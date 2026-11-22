import { create } from 'zustand'
import type { Snapshot, Zone } from '../native/contract'
import { describeZone, storyVisit, type StoryStep } from './presentation'

type Session = {
  current: Snapshot | null
  previousZone: Zone | null
  storyStep: StoryStep | undefined
  storyVisits: ReadonlyMap<string, StoryStep>
  accept: (value: Snapshot) => void
}

export const useSession = create<Session>(set => ({
  current: null,
  previousZone: null,
  storyStep: undefined,
  storyVisits: new Map(),
  accept(value) {
    set(state => {
      const current = state.current
      if (value.version !== 1 || (current && value.revision <= current.revision)) return state
      const sameSource = current && current.activePath === value.activePath && current.replaySession === value.replaySession &&
        current.settings.activeProfile === value.settings.activeProfile
      const previousZone = !sameSource || !value.zone ? null
        : value.kind === 'zoneChanged' ? current.zone : state.previousZone
      if (sameSource && value.kind === 'snapshot' && value.zone?.areaId === current.zone?.areaId &&
        value.zone?.name === current.zone?.name) return { current: value, previousZone }

      let storyVisits = sameSource ? state.storyVisits : new Map<string, StoryStep>()
      const areaId = value.zone?.areaId ?? describeZone(value.zone).areaId
      const from = previousZone?.areaId ?? describeZone(previousZone).areaId
      const storyStep = storyVisit(areaId, from, storyVisits)
      if (storyStep && storyVisits.get(storyStep.areaId) !== storyStep) {
        storyVisits = new Map(storyVisits).set(storyStep.areaId, storyStep)
      }
      return { current: value, previousZone, storyStep, storyVisits }
    })
  },
}))
