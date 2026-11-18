import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Compact } from '../views/Compact'
import type { Snapshot } from '../native/contract'
import { campaignAreas, describeZone, searchCampaign } from './presentation'
import { useSession } from './session'

const snapshot: Snapshot = {
  version: 1, revision: 0, kind: 'snapshot', status: 'watching', zone: null,
  activePath: null, characterLevel: null, visible: true, detailsExpanded: false, anchored: false, logError: null, windowError: null, notices: [], replaySession: 0,
  settings: { logPath: null, placement: { corner: 'topRight', insetX: 20, insetY: 20, followGame: true }, leagueStart: false, profiles: [], activeProfile: null },
}

describe('zone presentation', () => {
  it('resolves the reference area and scene-only records', () => {
    expect(describeZone({ areaId: 'G1_1', name: null, level: 1 })).toMatchObject({ title: 'The Riverbank', act: 1, areaId: 'G1_1' })
    expect(describeZone({ areaId: null, name: 'The Riverbank', level: null })).toMatchObject({ act: 1, areaId: 'G1_1' })
  })
  it('shows the Riverbank objective for both ID and scene-only records', () => {
    for (const zone of [
      { areaId: 'G1_1', name: null, level: 1 },
      { areaId: null, name: 'The Riverbank', level: null },
    ]) {
      expect(renderToStaticMarkup(<Compact state={{ ...snapshot, zone }}/>)).toContain('Reach Clearfell')
    }
  })
  it('falls back when there is no current zone or matching objective', () => {
    for (const zone of [null, { areaId: 'UNKNOWN', name: 'The Riverbank', level: 1 }]) {
      expect(renderToStaticMarkup(<Compact state={{ ...snapshot, zone }}/>)).toContain('No objective assigned')
    }
  })
  it('labels optional objectives and recommends lasting rewards only in league-start mode', () => {
    const state = { ...snapshot, zone: { areaId: 'G1_2', name: null, level: 2 } }
    const standard = renderToStaticMarkup(<Compact state={state}/>)
    expect(standard).toContain('Story objective')
    expect(standard).toContain('Find the path into the Grelwood')
    expect(standard).toContain('Optional')
    expect(standard).toContain('Defeat Beira for cold resistance')
    expect(standard).not.toContain('Recommended')
    const leagueStart = { ...state, settings: { ...state.settings, leagueStart: true } }
    expect(renderToStaticMarkup(<Compact state={leagueStart}/>)).toContain('Recommended')
  })
  it('shows only optional objectives for a side area', () => {
    const state = { ...snapshot, zone: { areaId: 'G1_3', name: null, level: 3 } }
    const html = renderToStaticMarkup(<Compact state={state}/>)
    expect(html).toContain('Optional')
    expect(html).toContain('Defeat the Devourer for Finn')
    expect(html).not.toContain('Story objective')
  })
  it('resolves encounter tips without treating area level as a recommendation', () => {
    const trial = describeZone({ areaId: 'G2_13', name: null, level: 22 })
    expect(trial.tip).toContain('character level 26–30')
    expect(describeZone({ areaId: null, name: 'Ogham Manor', level: null }).tip).toContain('cold resistance')
    expect(describeZone({ areaId: 'UNKNOWN', name: null, level: 22 }).tip).toBeNull()
  })
  it('shows an area’s shortcut alongside its objectives and hides it if the log goes missing', () => {
    const state = { ...snapshot, zone: { areaId: 'G3_2_2', name: null, level: 39 } }
    const html = renderToStaticMarkup(<Compact state={state}/>)
    expect(html).toContain('Drain the canals using the sluice levers')
    expect(html).toContain('Open a portal by the final lever')
    expect(html).toContain('Take the detour to the Azak Bog')
    expect(renderToStaticMarkup(<Compact state={{ ...state, status: 'missing' }}/>)).not.toContain('Shortcut')
    expect(describeZone({ areaId: null, name: 'The Matlan Waterways', level: null }).shortcut?.detail).toContain('wait for the quest to update')
    expect(describeZone({ areaId: 'G1_1', name: null, level: 1 }).shortcut).toBeNull()
  })
  it('escapes unknown identifiers and leaves the act unknown', () => {
    const zone = { areaId: '<img src=x>', name: null, level: 42 }
    const html = renderToStaticMarkup(<Compact state={{...snapshot,zone}}/>)
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).not.toContain('<img src=x>')
    expect(describeZone(zone)).toMatchObject({ act: null, areaId: null })
  })
  it('prefers a scene label and handles waiting for the first record', () => {
    expect(describeZone({areaId:'future',name:'A new zone',level:null}).title).toBe('A new zone')
    expect(describeZone(null).title).toBe('Awaiting zone')
  })
  it('resolves scene-only areas across Acts 1–4 and keeps variant-specific guidance keyed by ID', () => {
    for (const [name, act] of [['riverbank', 1], ['Traitor’s Passage', 2], ['Matlan Waterways', 3], ['Solitary Confinement', 4]] as const) {
      expect(describeZone({ areaId: null, name, level: null })).toMatchObject({ act, objective: expect.any(String) })
    }
    const scene = { name: 'The Halani Gates', level: null }
    expect(describeZone({ ...scene, areaId: null })).toMatchObject({ act: 2, objective: null })
    expect(describeZone({ ...scene, areaId: 'G2_3s' }).objective).toContain('sandstorm')
    expect(describeZone({ ...scene, areaId: 'G2_3a' }).objective).toContain('closed gates')
    expect(describeZone({ name: 'Ngakanu', areaId: null, level: null })).toMatchObject({
      act: 4, areaId: null, objective: 'Find the Heart of the Tribe',
      optional: [{ id: 'tribal-medicine:shark-fin' }],
    })
  })
  it('searches area names, bosses and rewards without relying on matching punctuation', () => {
    expect(searchCampaign('traitor’s passage')[0]?.id).toBe('G2_2')
    expect(searchCampaign('bloated miller').map(area => area.id)).toContain('G1_1')
    expect(searchCampaign('Beira cold resistance').map(area => area.id)).toContain('G1_2')
    expect(searchCampaign('g4_5_2')[0]?.id).toBe('G4_5_2')
    expect(searchCampaign('orange mushrooms').map(area => area.id)).toContain('G1_4')
    expect(searchCampaign('no such reward')).toEqual([])
    expect(new Set(campaignAreas.map(area => area.id)).size).toBe(campaignAreas.length)
  })
  it('shows route guidance with story, shortcut and optional hints and hides it on a stale zone', () => {
    const state = { ...snapshot, zone: { areaId: 'G1_4', name: null, level: 4 } }
    const html = renderToStaticMarkup(<Compact state={state}/>)
    expect(html).toContain('Investigate the Tree of Souls')
    expect(html).toContain('Glowing roots lead to the tree')
    expect(html).toContain('Tag the Grim Tangle waypoint early')
    expect(html).toContain('Defeat the Brambleghast')
    expect(renderToStaticMarkup(<Compact state={{ ...state, status: 'readError' }}/>)).not.toContain('Glowing roots')
    expect(describeZone({ areaId: null, name: 'The Riverbank', level: null }).route?.steps).toHaveLength(2)
    expect(describeZone({ areaId: 'UNKNOWN', name: 'The Riverbank', level: null }).route).toBeNull()
  })
  it('expands full route directions and shortcut text in the overlay', () => {
    const zone = { areaId: 'G1_4', name: null, level: 4 }
    const collapsed = renderToStaticMarkup(<Compact state={{ ...snapshot, zone }}/>)
    const expanded = renderToStaticMarkup(<Compact state={{ ...snapshot, zone, detailsExpanded: true }}/>)
    expect(collapsed).not.toContain('Orange mushrooms')
    expect(expanded).toContain('Orange mushrooms')
    expect(expanded).toContain('step inside to activate its waypoint')
    expect(expanded).toContain('Defeat the Brambleghast')
    expect(renderToStaticMarkup(<Compact state={{ ...snapshot, zone: null, detailsExpanded: true }}/>)).not.toContain('Objective details')
  })
  it('hides completed recommendations for the active character and league only', () => {
    const state = {
      ...snapshot, zone: { areaId: 'G1_2', name: null, level: 2 },
      settings: { ...snapshot.settings, leagueStart: true, activeProfile: 0, profiles: [
        { character: 'Exile', league: 'One', completed: ['G1_2:1'] },
        { character: 'Exile', league: 'Two', completed: [] },
      ] },
    }
    expect(renderToStaticMarkup(<Compact state={state}/>)).not.toContain('Defeat Beira')
    expect(renderToStaticMarkup(<Compact state={{ ...state, settings: { ...state.settings, activeProfile: 1 } }}/>)).toContain('Recommended')
  })
})

describe('snapshot handoff', () => {
  beforeEach(() => useSession.setState({current:null}))
  it('keeps a newer live event when the initial command returns late', () => {
    const {accept} = useSession.getState()
    accept({...snapshot, revision:2, kind:'zoneChanged'})
    accept(snapshot)
    expect(useSession.getState().current?.revision).toBe(2)
  })
  it('ignores unknown contract versions and accepts revision zero', () => {
    const {accept} = useSession.getState()
    accept({...snapshot, version:2} as unknown as Snapshot)
    expect(useSession.getState().current).toBeNull()
    accept(snapshot)
    expect(useSession.getState().current).toEqual(snapshot)
  })
})
