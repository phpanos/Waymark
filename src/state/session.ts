import { create } from 'zustand'
import type { Snapshot, Zone } from '../native/contract'

type Session = { current: Snapshot | null; previousZone: Zone | null; accept: (value: Snapshot) => void }

export const useSession = create<Session>(set => ({
  current: null,
  previousZone: null,
  accept(value) {
    set(state => {
      const current = state.current
      if (value.version !== 1 || (current && value.revision <= current.revision)) return state
      const sameSource = current && current.activePath === value.activePath && current.replaySession === value.replaySession
      const previousZone = !sameSource || !value.zone ? null
        : value.kind === 'zoneChanged' ? current.zone : state.previousZone
      return { current: value, previousZone }
    })
  },
}))
