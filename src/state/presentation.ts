import areas from '../data/areas.json'
import type { Snapshot, Status, Zone } from '../native/contract'

type OptionalObjective = { id: string; hint: string; leagueStart?: boolean }
export type Route = { cue: string; steps: readonly { landmark: string; detail: string }[] }
type AreaReference = {
  id: string
  name: string
  act: number
  objective?: string
  bosses?: readonly string[]
  optional?: readonly OptionalObjective[]
  tip?: string
  shortcut?: { cue: string; detail: string }
  route?: Route
}
export const campaignAreas: readonly AreaReference[] = areas

const byId = new Map(campaignAreas.map(area => [area.id, area]))

function sceneKey(value: string) {
  return value.trim().normalize('NFC').toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').replace(/^the /, '')
}

function searchKey(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const searchIndex = campaignAreas.map(area => ({ area, terms: searchKey([
  area.name, area.id, area.objective, ...(area.bosses ?? []), area.tip,
  area.shortcut?.cue, area.shortcut?.detail, ...(area.optional?.map(objective => objective.hint) ?? []),
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

export const statusText: Record<Status, string> = {
  searching: 'Searching', watching: 'Connected', missing: 'File missing', readError: 'Read error',
  replaying: 'Replaying', replayComplete: 'Replay complete',
}

export function describeZone(zone: Zone | null) {
  if (!zone) return { title: 'Awaiting zone', areaId: null, act: null, objective: null, optional: [], tip: null, shortcut: null, route: null }
  const scene = zone.name ? sceneKey(zone.name) : ''
  const matchingScenes = !zone.areaId && scene ? campaignAreas.filter(area => sceneKey(area.name) === scene) : []
  // A scene-only label cannot distinguish campaign stages which share a name and have different routes.
  const known = zone.areaId ? byId.get(zone.areaId) : matchingScenes.length === 1 ? matchingScenes[0] : undefined
  const reference = matchingScenes[0]
  const sharedOptional = reference?.optional?.filter(objective =>
    matchingScenes.every(area => area.optional?.some(other => other.id === objective.id)))
  return {
    title: zone.name || known?.name || zone.areaId || 'Unknown zone',
    areaId: known?.id ?? null,
    act: known?.act ?? (reference && matchingScenes.every(area => area.act === reference.act) ? reference.act : null),
    objective: known?.objective ?? (reference && matchingScenes.every(area => area.objective === reference.objective) ? reference.objective ?? null : null),
    optional: known?.optional ?? sharedOptional ?? [],
    tip: known?.tip ?? null,
    shortcut: known?.shortcut ?? null,
    route: known?.route ?? null,
  }
}
