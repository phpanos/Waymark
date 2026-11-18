import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Compact } from '../views/Compact'
import type { Snapshot } from '../native/contract'
import { describeZone } from './presentation'
import { useSession } from './session'

const snapshot: Snapshot = {
  version: 1, revision: 0, kind: 'snapshot', status: 'watching', zone: null,
  moving: false,
  activePath: null, visible: true, anchored: false, logError: null, windowError: null, notices: [], replaySession: 0,
  settings: { logPath: null, placement: { corner: 'topRight', insetX: 20, insetY: 20, followGame: true }, leagueStart: false },
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
  it('shows the drag handle only during move mode', () => {
    expect(renderToStaticMarkup(<Compact state={snapshot}/>)).not.toContain('Drag Waymark here')
    expect(renderToStaticMarkup(<Compact state={{ ...snapshot, moving: true }}/>)).toContain('Drag Waymark here')
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
