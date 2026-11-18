import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Compact } from '../views/Compact'
import type { Snapshot } from '../native/contract'
import { campaignAreas, describeZone, searchCampaign, townRewards } from './presentation'
import { permanentRewards, selectedReward } from './rewards'
import { useSession } from './session'

const snapshot: Snapshot = {
  version: 1, revision: 0, kind: 'snapshot', status: 'watching', zone: null,
  activePath: null, characterLevel: null, visible: true, detailsExpanded: false, rewardRecap: false, anchored: false, logError: null, windowError: null, notices: [], replaySession: 0,
  settings: { logPath: null, placement: { corner: 'topRight', insetX: 20, insetY: 20, followGame: true }, leagueStart: false, profiles: [], activeProfile: null, defaultCompleted: [] },
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
    expect(html).toContain('Cross the canals using the pressure pads')
    expect(html).toContain('Portal after crossing the canals')
    expect(html).toContain('Take the detour to the Azak Bog')
    expect(renderToStaticMarkup(<Compact state={{ ...state, status: 'missing' }}/>)).not.toContain('Shortcut')
    expect(describeZone({ areaId: null, name: 'The Matlan Waterways', level: null }).shortcut?.detail).toContain('Once the quest updates')
    expect(describeZone({ areaId: 'G1_1', name: null, level: 1 }).shortcut).toBeNull()
  })
  it('keeps the Cemetery cue visible and shows the two tomb branches only in expanded directions', () => {
    const state: Snapshot = { ...snapshot, zone: { areaId: 'G1_7', name: null, level: 9 } }
    const collapsed = renderToStaticMarkup(<Compact state={state}/>)
    expect(collapsed).toContain('Sweep the edges for both tomb doors')
    expect(collapsed).not.toContain('route-diagram')
    const expanded = renderToStaticMarkup(<Compact state={{ ...state, detailsExpanded: true }}/>)
    expect(expanded).toContain('Clear either tomb first')
    expect(expanded).toContain('Draven · 1 key piece')
    expect(expanded).toContain('Asinia · 1 key piece')
    expect(expanded).toContain('Bring both key pieces to Lachlann')
    expect(expanded).toContain('activate the checkpoints at both tomb entrances')
    expect(renderToStaticMarkup(<Compact state={{ ...state, detailsExpanded: true, status: 'missing' }}/>))
      .not.toContain('route-diagram')
  })
  it('provides exits and an expanded diagram for every cataloged area', () => {
    for (const area of campaignAreas) {
      const zone = { areaId: area.id, name: null, level: null }
      const { navigation } = describeZone(zone)
      expect(navigation?.exits.length, area.id).toBeGreaterThan(0)
      expect(renderToStaticMarkup(<Compact state={{ ...snapshot, zone, detailsExpanded: true }}/>), area.id)
        .toContain('aria-label="Area diagram"')
    }
  })
  it('distinguishes waypoint availability, side-area returns and shared scene data', () => {
    const navigation = (areaId: string) => describeZone({ areaId, name: null, level: null }).navigation
    expect(navigation('G1_1')).toMatchObject({ waypoint: false, exits: [{ landmark: 'Clearfell Encampment' }] })
    expect(navigation('G3_9')).toMatchObject({ waypoint: true, label: 'Return to', exits: [{ landmark: 'The Drowned City' }] })
    expect(describeZone({ name: 'Ngakanu', areaId: null, level: null }).navigation).toMatchObject({ waypoint: true, exits: [] })
    expect(navigation('UNKNOWN')).toBeNull()
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
      act: 4, areaId: null, objective: null, route: null,
      optional: [{ id: 'tribal-medicine:shark-fin' }],
    })
    expect(describeZone({ name: 'Ngakanu', areaId: 'G4_11_1a', level: null }).route?.steps[0].landmark).toContain('Settlement')
    expect(describeZone({ name: 'Ngakanu', areaId: 'G4_11_1b', level: null }).route?.steps[0].landmark).toContain('fence')
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
  it.each([
    ['G2_2', 'Look for the Six Sisters bridge', 'Yellow paper seals · Optional'],
    ['G3_2_2', 'Step on pads to lower the water', 'Azak Bog entrance · Optional'],
    ['G4_4_1', 'Look for the fork after the third test', 'Silent Hall · Optional'],
  ])('keeps the route cue visible with the details collapsed or expanded in %s', (areaId, cue, detour) => {
    const state = { ...snapshot, zone: { areaId, name: null, level: null } }
    const collapsed = renderToStaticMarkup(<Compact state={state}/>)
    const expanded = renderToStaticMarkup(<Compact state={{ ...state, detailsExpanded: true }}/>)
    expect(collapsed).toContain(cue)
    expect(collapsed).not.toContain(detour)
    expect(expanded).toContain(cue)
    expect(expanded).toContain(detour)
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

describe('permanent reward recap', () => {
  it('counts the reward once even when multiple variants share the objective', () => {
    expect([1, 2, 3, 4].map(act => permanentRewards(act).length)).toEqual([5, 5, 6, 6])
    expect(permanentRewards(4).find(reward => reward.id === 'tribal-medicine:shark-fin')?.areas.map(area => area.id))
      .toEqual(['G4_11_1a', 'G4_11_1b'])
    expect(permanentRewards(2).map(reward => reward.id)).not.toContain('ancient-vows:kabala-relic')
  })

  it('highlights a nearby reward until the player chooses another', () => {
    const rewards = permanentRewards(1)
    expect(selectedReward(rewards, undefined, 'G1_12')?.id).toBe('G1_12:1')
    expect(selectedReward(rewards, 'G1_11:1', 'G1_12')?.id).toBe('G1_11:1')
    expect(selectedReward(rewards, 'missing', 'G1_12')?.id).toBe('G1_12:1')
  })

  it('uses the saved default checklist separately from named characters', () => {
    const state: Snapshot = {
      ...snapshot,
      zone: { areaId: 'G1_town', name: null, level: null },
      detailsExpanded: true,
      rewardRecap: true,
      settings: { ...snapshot.settings, defaultCompleted: ['G1_2:1'], profiles: [
        { character: 'Exile', league: 'One', completed: [] },
      ] },
    }
    const fallback = renderToStaticMarkup(<Compact state={state}/>)
    expect(fallback).toContain('4 rewards left')
    expect(fallback).not.toContain('Cold resistance')
    expect(fallback).toContain('bloody tracks')
    const named = renderToStaticMarkup(<Compact state={{ ...state, settings: { ...state.settings, activeProfile: 0 } }}/>)
    expect(named).toContain('5 rewards left')
    expect(named).toContain('Frostblood Ritual')
  })

  it('prioritizes Renly’s skill gem after the Riverbank and keeps the act-wide list on demand', () => {
    const riverbank = { areaId: 'G1_1', name: null, level: 1 }
    const state: Snapshot = {
      ...snapshot, detailsExpanded: true, zone: { areaId: 'G1_town', name: null, level: null },
    }
    const intro = renderToStaticMarkup(<Compact state={state} previousZone={riverbank}/>)
    expect(intro).toContain('Speak to Renly to claim the Miller reward')
    expect(intro).toContain('Level 1 Uncut Skill Gem')
    expect(intro).not.toContain('Act 1 permanent rewards')
    expect(intro).toContain('Alt+Shift+R')
    expect(renderToStaticMarkup(<Compact state={{ ...state, rewardRecap: true }} previousZone={riverbank}/>))
      .toContain('Act 1 permanent rewards')
    const revisit = renderToStaticMarkup(<Compact state={state} previousZone={{ areaId: 'G1_2', name: null, level: 2 }}/>)
    expect(revisit).not.toContain('Level 1 Uncut Skill Gem')
    expect(renderToStaticMarkup(<Compact state={state}/>)).toContain('Level 1 Uncut Skill Gem after defeating the Miller')
    expect(renderToStaticMarkup(<Compact state={state} previousZone={{ areaId: 'UnknownHideout', name: null, level: null }}/>))
      .not.toContain('Level 1 Uncut Skill Gem')
  })

  it.each([
    ['G1_town', 'G1_3', 'Speak with Renly and Una', 'Uncut Support Gem', 'Speak to Renly', true],
    ['G2_town', 'G2_4_3', 'Speak with Asala and use the Desert Map', 'Uncut Support Gem', 'Essence of Water to Zarka', false],
    ['G3_town', 'G3_9', 'Work with Alva to open the route below', 'Level 11 Uncut Skill Gem', 'Hammer of Kamasa to Oswald', true],
    ['G4_town', 'G4_2_2', 'Arrange passage with Makoru and investigate the islands', 'Level 13 Uncut Skill Gem', 'Talk to Tujen after defeating Omniphobia', true],
  ] as const)('shows the relevant reward on arrival in %s while keeping the main task first', (town, from, objective, reward, claim, optional) => {
    const state: Snapshot = { ...snapshot, detailsExpanded: false, zone: { areaId: town, name: null, level: null } }
    const markup = renderToStaticMarkup(<Compact state={state} previousZone={{ areaId: from, name: null, level: null }}/>)
    expect(markup).toContain(objective)
    expect(markup).toContain(reward)
    expect(markup).toContain(claim)
    expect(markup.indexOf(objective)).toBeLessThan(markup.indexOf(reward))
    expect(markup.includes('Optional reward')).toBe(optional)
    expect(markup).not.toContain('reward-list')
    expect(renderToStaticMarkup(<Compact state={state} previousZone={{ areaId: 'Unrelated', name: null, level: null }}/>))
      .not.toContain(claim)
  })
})

describe('pinned town rewards', () => {
  const zone = (areaId: string) => ({ areaId, name: null, level: null })
  const oswald = 'treasures-of-utzaal'

  it('offers a gem reward to pin in each act and uses unique IDs', () => {
    expect(new Set(townRewards.map(reward => reward.id)).size).toBe(townRewards.length)
    for (const area of ['G1_3', 'G2_4_3', 'G3_9', 'G4_2_2']) {
      expect(renderToStaticMarkup(<Compact state={{ ...snapshot, zone: zone(area) }}/>)).toContain('Alt+Shift+P')
    }
  })

  it('shows the pin after a detour only in its town and for the active profile', () => {
    const settings: Snapshot['settings'] = {
      ...snapshot.settings, activeProfile: 0, profiles: [
        { character: 'Exile', league: 'One', completed: [], townRewards: { [oswald]: 'pinned' } },
        { character: 'Other', league: 'One', completed: [] },
      ],
    }
    const town: Snapshot = { ...snapshot, settings, zone: zone('G3_town') }
    const markup = renderToStaticMarkup(<Compact state={town} previousZone={zone('G3_8')}/>)
    expect(markup).toContain('Pinned reward')
    expect(markup).toContain('Bring the Hammer of Kamasa to Oswald')
    expect(markup.indexOf('Work with Alva')).toBeLessThan(markup.indexOf('Pinned reward'))
    expect(renderToStaticMarkup(<Compact state={{ ...town, zone: zone('G4_town') }}/>)).not.toContain('Pinned reward')
    expect(renderToStaticMarkup(<Compact state={{ ...town, settings: { ...settings, activeProfile: 1 } }}/>)).not.toContain('Pinned reward')
    expect(renderToStaticMarkup(<Compact state={{ ...town, status: 'replaying' }}/>)).not.toContain('Pinned reward')
  })

  it('stops showing a handled reward on a direct town arrival and lets a dismissed reward be pinned again', () => {
    for (const status of ['claimed', 'dismissed'] as const) {
      const state: Snapshot = { ...snapshot, zone: zone('G3_town'), settings: {
        ...snapshot.settings, defaultTownRewards: { [oswald]: status },
      } }
      expect(renderToStaticMarkup(<Compact state={state} previousZone={zone('G3_9')}/>)).not.toContain('Hammer of Kamasa')
      expect(renderToStaticMarkup(<Compact state={{ ...state, zone: zone('G3_9') }}/>).includes('Alt+Shift+P'))
        .toBe(status === 'dismissed')
    }
  })
})

describe('snapshot handoff', () => {
  beforeEach(() => useSession.setState({current:null, previousZone:null}))
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
  it('keeps the previous area as a transition is refined and clears it when the log changes', () => {
    const {accept} = useSession.getState()
    const riverbank = { areaId: 'G1_1', name: null, level: 1 }
    const town = { areaId: 'G1_town', name: null, level: 1 }
    accept({ ...snapshot, zone: riverbank })
    accept({ ...snapshot, revision: 1, kind: 'zoneChanged', zone: town })
    accept({ ...snapshot, revision: 2, kind: 'zoneUpdated', zone: { ...town, name: 'Clearfell Encampment' } })
    expect(useSession.getState().previousZone).toEqual(riverbank)
    accept({ ...snapshot, revision: 3, activePath: 'Other Client.txt', zone: town })
    expect(useSession.getState().previousZone).toBeNull()
  })
})
