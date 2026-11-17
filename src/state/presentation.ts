import areas from '../data/areas.json'
import type { Status, Zone } from '../native/contract'

export const statusText: Record<Status, string> = {
  searching: 'Searching', watching: 'Connected', missing: 'File missing', readError: 'Read error',
  replaying: 'Replaying', replayComplete: 'Replay complete',
}

export function describeZone(zone: Zone | null) {
  if (!zone) return { title: 'Awaiting zone', act: null }
  const known = areas.find(a => zone.areaId ? a.id === zone.areaId : a.name === zone.name)
  return { title: zone.name || known?.name || zone.areaId || 'Unknown zone', act: known?.act ?? null }
}
