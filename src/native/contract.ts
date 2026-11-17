export const channel = 'waymark://state-v1'
export type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
export type Placement = { corner: Corner; insetX: number; insetY: number; followGame: boolean }
export type Zone = { areaId: string | null; name: string | null; level: number | null }
export type Status = 'searching' | 'watching' | 'missing' | 'readError' | 'replaying' | 'replayComplete'
export interface Snapshot {
  version: 1
  revision: number
  kind: 'snapshot' | 'zoneChanged' | 'zoneUpdated'
  settings: { logPath: string | null; placement: Placement }
  activePath: string | null
  status: Status
  zone: Zone | null
  visible: boolean
  anchored: boolean
  logError: string | null
  windowError: string | null
  notices: string[]
  replaySession: number
}
