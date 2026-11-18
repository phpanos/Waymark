import areas from '../data/areas.json'
import type { Status, Zone } from '../native/contract'

type OptionalObjective = { hint: string; leagueStart?: boolean }
type AreaReference = {
  id: string
  name: string
  act: number
  objective?: string
  optional?: readonly OptionalObjective[]
  tip?: string
  shortcut?: { cue: string; detail: string }
}
export const campaignAreas: readonly AreaReference[] = areas

export const statusText: Record<Status, string> = {
  searching: 'Searching', watching: 'Connected', missing: 'File missing', readError: 'Read error',
  replaying: 'Replaying', replayComplete: 'Replay complete',
}

export function describeZone(zone: Zone | null) {
  if (!zone) return { title: 'Awaiting zone', areaId: null, act: null, objective: null, optional: [], tip: null, shortcut: null }
  const known = campaignAreas.find(a => zone.areaId ? a.id === zone.areaId : a.name === zone.name)
  return {
    title: zone.name || known?.name || zone.areaId || 'Unknown zone',
    areaId: known?.id ?? null,
    act: known?.act ?? null,
    objective: known?.objective ?? null,
    optional: known?.optional ?? [],
    tip: known?.tip ?? null,
    shortcut: known?.shortcut ?? null,
  }
}
