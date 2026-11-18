import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { channel, type Snapshot, type Placement } from './contract'

export const native = {
  listen: (accept: (s: Snapshot) => void) => listen<Snapshot>(channel, e => accept(e.payload)),
  snapshot: () => invoke<Snapshot>('snapshot'),
  pick: () => invoke<void>('pick_log'),
  discover: () => invoke<void>('use_discovery'),
  position: (placement: Placement) => invoke<void>('set_placement', { placement }),
  beginMove: () => invoke<void>('begin_move'),
  finishMove: (save: boolean) => invoke<void>('finish_move', { save }),
  dragOverlay: () => invoke<void>('drag_overlay'),
  toggle: () => invoke<void>('toggle_overlay'),
  replay: (enabled: boolean) => invoke<void>('replay_fixture', { enabled }),
  close: () => invoke<void>('close_settings'),
}
