import areas from '../data/areas.json'
import navigation from '../data/navigation.json'
import storySteps from '../data/story-route.json'
import type { Snapshot, Status, TownRewardProgress, Zone } from '../native/contract'

type OptionalObjective = {
  id: string
  hint: string
  leagueStart?: boolean
  reward?: { name: string; direction: string }
  loot?: string
  compactHint?: string
  compactReward?: string
}
type RouteLandmark = { landmark: string; detail: string }
export type Route = {
  cue: string
  steps: readonly RouteLandmark[]
  diagram?: { caption: string; branches: readonly RouteLandmark[]; destination: RouteLandmark }
}
type ArrivalReward = {
  id?: string
  from: readonly string[]
  reward: string
  claim?: string
  optional?: boolean
  objective?: string
  fallback?: string
  objectiveAfterClaim?: string
}
type AreaReference = {
  id: string
  name: string
  act: number
  objective?: string
  questReward?: string
  arrivalRewards?: readonly ArrivalReward[]
  bosses?: readonly string[]
  optional?: readonly OptionalObjective[]
  tip?: string
  shortcut?: { cue: string; detail: string }
  route?: Route
}
export const campaignAreas: readonly AreaReference[] = areas

export const townRewards = campaignAreas.flatMap(town => (town.arrivalRewards ?? []).flatMap(reward =>
  reward.id && reward.claim ? [{
    id: reward.id, from: reward.from, reward: reward.reward, claim: reward.claim,
    townId: town.id, townName: town.name,
  }] : []))

const byId = new Map(campaignAreas.map(area => [area.id, area]))

type NavigationData = { waypoint: boolean; label?: string; exits: readonly { id: string; detail?: string }[] }
const navigationById: Readonly<Record<string, NavigationData>> = navigation
export type ZoneNavigation = { waypoint: boolean; label: string; exits: readonly RouteLandmark[] }

function describeNavigation(references: readonly AreaReference[]): ZoneNavigation | null {
  const [reference, ...variants] = references.map(area => navigationById[area.id])
  if (!reference) return null
  const exits = reference.exits.filter(exit => variants.every(variant => variant?.label === reference.label &&
    variant?.exits.some(other => other.id === exit.id && other.detail === exit.detail)))
  return {
    waypoint: reference.waypoint && variants.every(variant => variant?.waypoint),
    label: reference.label ?? (exits.length > 1 ? 'Next zones' : 'Next zone'),
    exits: exits.flatMap(exit => {
      const area = byId.get(exit.id)
      return area ? [{ landmark: area.name, detail: exit.detail ?? '' }] : []
    }),
  }
}

function sceneKey(value: string) {
  return value.trim().normalize('NFC').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').replace(/^the /, '')
}

function searchKey(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const searchIndex = campaignAreas.map(area => ({ area, terms: searchKey([
  area.name, area.id, area.objective, area.questReward,
  ...(area.arrivalRewards?.flatMap(({ reward, claim }) => [reward, claim]) ?? []),
  ...(area.bosses ?? []), area.tip,
  area.shortcut?.cue, area.shortcut?.detail,
  ...(area.optional?.flatMap(objective => [objective.hint, objective.reward?.name, objective.loot]) ?? []),
  ...(area.route?.steps.map(step => `${step.landmark} ${step.detail}`) ?? []),
].join(' ')) }))

export function searchCampaign(query: string) {
  const key = searchKey(query)
  if (!key) return []
  const terms = key.split(' ')
  return searchIndex.filter(entry => terms.every(term => entry.terms.includes(term))).map(entry => entry.area)
}

export function activeProfile(settings: Snapshot['settings']) {
  return settings.activeProfile == null ? undefined : settings.profiles[settings.activeProfile]
}

export function completedObjectives(settings: Snapshot['settings']) {
  return activeProfile(settings)?.completed ?? settings.defaultCompleted
}

export function townRewardProgress(settings: Snapshot['settings']): TownRewardProgress {
  return (settings.activeProfile === null ? settings.defaultTownRewards : activeProfile(settings)?.townRewards) ?? {}
}

export function reachedClearfell(settings: Snapshot['settings']) {
  return settings.activeProfile === null ? settings.defaultReachedClearfell : activeProfile(settings)?.reachedClearfell
}

export type StoryStep = { areaId: string; objective?: string; index: number }
export const storyRoute: readonly StoryStep[] = storySteps.map((step, index) => ({
  ...(typeof step === 'string' ? { areaId: step } : step), index,
}))

const storyVariants = new Map([['G2_3s', 'G2_3'], ['G2_8a', 'G2_8']])
const repeatedStoryAreas = new Set(storyRoute.filter((step, index) =>
  storyRoute.findIndex(other => other.areaId === step.areaId) !== index).map(step => step.areaId))
const storyReturns = new Map<string, { areaId: string; from?: string }>([
  ['Abyss_Intro', { areaId: 'G2_5_1' }],
  ['Abyss_Hub', { areaId: 'G2_5_1' }],
  ['G3_10_Airlock', { areaId: 'G3_5' }],
  ['G3_10', { areaId: 'G3_5' }],
  ['G4_13', { areaId: 'G4_town', from: 'G4_2_2' }],
  ['ExpeditionSubArea_Kalguur_Act4', { areaId: 'G4_town', from: 'G4_2_2' }],
])

function findStoryStep(areaId: string | null, from: string | null) {
  if (!areaId) return undefined
  const id = storyVariants.get(areaId) ?? areaId
  const previous = from && (storyVariants.get(from) ?? from)
  return storyRoute.find((step, index) => step.areaId === id && storyRoute[index - 1]?.areaId === previous)
    ?? storyRoute.find(step => step.areaId === id)
}

export function storyVisit(areaId: string | null, from: string | null, visits?: ReadonlyMap<string, StoryStep>) {
  if (!areaId) return undefined
  const id = storyVariants.get(areaId) ?? areaId
  const previous = from && (storyVariants.get(from) ?? from)
  const previousStep = (previous ? visits?.get(previous) : undefined) ?? findStoryStep(from, null)
  const next = previousStep && storyRoute[previousStep.index + 1]
  return next?.areaId === id ? next : visits?.get(id)
}

export function adjacentStoryObjectives(areaId: string | null, from: string | null = null, preview: StoryStep | null = null) {
  const step = preview ?? findStoryStep(areaId, from)
  if (step) return { previous: storyRoute[step.index - 1], next: storyRoute[step.index + 1] }

  const exits = areaId ? navigationById[areaId]?.exits : undefined
  const rejoin = areaId ? storyReturns.get(areaId) : undefined
  return {
    previous: areaId && byId.has(areaId) ? findStoryStep(from, null) : undefined,
    next: rejoin ? findStoryStep(rejoin.areaId, rejoin.from ?? null)
      : exits?.length === 1 ? findStoryStep(exits[0].id, areaId) : undefined,
  }
}

export function describeStoryStep(step: StoryStep) {
  const previous = storyRoute[step.index - 1]
  const zone = describeZone({ areaId: step.areaId, name: null, level: null }, previous?.areaId)
  return applyStoryStep(zone, step)
}

function applyStoryStep(zone: ReturnType<typeof describeZone>, step?: StoryStep) {
  if (!step?.objective) return zone

  const next = storyRoute[step.index + 1]
  const nextArea = next && byId.get(next.areaId)
  return {
    ...zone,
    objective: step.objective,
    route: null,
    shortcut: null,
    navigation: zone.navigation && {
      ...zone.navigation,
      label: 'Next story zone',
      exits: nextArea ? [{ landmark: nextArea.name, detail: '' }] : [],
    },
  }
}

export function describeLiveZone(state: Snapshot, previousZone: Zone | null, trackedStep?: StoryStep) {
  const previousAreaId = previousZone?.areaId ?? describeZone(previousZone).areaId
  const zone = describeZone(state.zone, previousAreaId, townRewardProgress(state.settings), reachedClearfell(state.settings))
  const storyStep = trackedStep ?? storyVisit(zone.areaId, previousAreaId)
  const contextual = !!storyStep?.objective && repeatedStoryAreas.has(storyStep.areaId) && !zone.route?.diagram &&
    zone.objective !== zone.arrivalReward?.objective
  return { ...(contextual ? applyStoryStep(zone, storyStep) : zone), previousAreaId, storyStep, contextual }
}

export const statusText: Record<Status, string> = {
  searching: 'Searching', watching: 'Connected', missing: 'File missing', readError: 'Read error',
  replaying: 'Replaying', replayComplete: 'Replay complete',
}

export function describeZone(zone: Zone | null, previousAreaId: string | null = null, progress: TownRewardProgress = {}, clearedIntro = false) {
  if (!zone) return { title: 'Awaiting zone', areaId: null, act: null, objective: null, questReward: null, arrivalReward: null, optional: [], tip: null, shortcut: null, route: null, navigation: null }
  const scene = zone.name ? sceneKey(zone.name) : ''
  const matchingScenes = !zone.areaId && scene ? campaignAreas.filter(area => sceneKey(area.name) === scene) : []
  // A scene-only label cannot distinguish campaign stages which share a name and have different routes.
  const known = zone.areaId ? byId.get(zone.areaId) : matchingScenes.length === 1 ? matchingScenes[0] : undefined
  const reference = matchingScenes[0]
  const advanced = (reward: ArrivalReward) => !!reward.id &&
    (progress[reward.id] === 'claimed' || (reward.id === 'bloated-miller' && clearedIntro))
  const available = known?.arrivalRewards?.filter(reward =>
    !advanced(reward) && (!reward.id || progress[reward.id] !== 'dismissed'))
  const arrival = available?.find(reward => previousAreaId !== null && reward.from.includes(previousAreaId))
  const fallback = previousAreaId === null ? available?.find(reward => reward.fallback) : undefined
  const nextObjective = known?.arrivalRewards?.find(reward =>
    reward.objectiveAfterClaim && advanced(reward))?.objectiveAfterClaim
  const sharedOptional = reference?.optional?.filter(objective =>
    matchingScenes.every(area => area.optional?.some(other => other.id === objective.id)))
  return {
    title: zone.name || known?.name || zone.areaId || 'Unknown zone',
    areaId: known?.id ?? null,
    act: known?.act ?? (reference && matchingScenes.every(area => area.act === reference.act) ? reference.act : null),
    objective: (arrival?.objective ?? nextObjective ?? known?.objective) ??
      (reference && matchingScenes.every(area => area.objective === reference.objective) ? reference.objective ?? null : null),
    questReward: arrival?.reward ?? known?.questReward ?? fallback?.fallback ?? null,
    arrivalReward: arrival ?? fallback ?? null,
    optional: known?.optional ?? sharedOptional ?? [],
    tip: known?.tip ?? null,
    shortcut: known?.shortcut ?? null,
    route: known?.route ?? null,
    navigation: describeNavigation(known ? [known] : matchingScenes),
  }
}
