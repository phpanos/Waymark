import { create } from 'zustand'
import type { Snapshot } from '../native/contract'

type Session = { current: Snapshot | null; accept: (value: Snapshot) => void }

export const useSession = create<Session>(set => ({
  current: null,
  accept(value) {
    set(state => value.version === 1 && (!state.current || value.revision > state.current.revision)
      ? { current: value } : state)
  },
}))
