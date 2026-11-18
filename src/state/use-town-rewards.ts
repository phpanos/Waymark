import { useEffect, useRef, useState } from 'react'
import { native } from '../native/bridge'
import type { RewardAction, Snapshot, TownRewardStatus } from '../native/contract'
import { activeProfile, townRewards } from './presentation'

type TownReward = typeof townRewards[number]
type Change = { profile: number | null; reward: TownReward; status: 'claimed' | 'dismissed' }

export function useTownRewards(state: Snapshot, areaId: string | null, directId: string | undefined, recapOpen: boolean) {
  const profile = state.settings.activeProfile
  const live = state.status === 'watching'
  const progress = (profile === null ? state.settings.defaultTownRewards : activeProfile(state.settings)?.townRewards) ?? {}
  const [selection, setSelection] = useState<{ profile: number | null; id: string } | null>(null)
  const [lastChange, setLastChange] = useState<Change | null>(null)
  const [error, setError] = useState<{ profile: number | null; areaId: string | null; message: string } | null>(null)
  const busy = useRef(false)
  const receive = useRef<(action: RewardAction) => void>(() => {})

  const source = live ? townRewards.find(reward => areaId !== null && reward.from.includes(areaId) && progress[reward.id] !== 'claimed') : undefined
  const pinned = live ? townRewards.filter(reward => reward.townId === areaId && progress[reward.id] === 'pinned') : []
  const selected = pinned.find(reward => selection?.profile === profile && reward.id === selection.id)
    ?? pinned.find(reward => reward.id === directId) ?? pinned[0]
  const undo = live && lastChange?.profile === profile && lastChange.reward.townId === areaId &&
    progress[lastChange.reward.id] === lastChange.status ? lastChange : null
  const errorMessage = error?.profile === profile && error.areaId === areaId ? error.message : ''
  const directStatus = live && directId ? progress[directId] : undefined

  useEffect(() => {
    receive.current = action => {
      if (!state.visible || !live || recapOpen || busy.current) return
      if (action === 'pin' && source && progress[source.id] !== 'pinned') {
        void save(source, 'pinned', progress[source.id] ?? null)
      } else if (action === 'next' && selected && pinned.length > 1) {
        const index = pinned.indexOf(selected)
        setSelection({ profile, id: pinned[(index + 1) % pinned.length].id })
      } else if ((action === 'done' || action === 'dismiss') && selected) {
        void save(selected, action === 'done' ? 'claimed' : 'dismissed', 'pinned')
      } else if (action === 'undo' && undo) {
        void save(undo.reward, 'pinned', undo.status)
      }
    }

    async function save(reward: TownReward, status: TownRewardStatus, expected: TownRewardStatus | null) {
      busy.current = true
      setError(null)
      try {
        if (!await native.setTownReward(profile, reward.id, expected, status)) return
        if (status !== 'pinned') setLastChange({ profile, reward, status })
        if (status === 'pinned' && expected !== null && reward.townId === areaId) {
          setLastChange(null)
          setSelection({ profile, id: reward.id })
        }
      } catch (error) {
        setError({ profile, areaId, message: String(error) })
      } finally {
        busy.current = false
      }
    }
  })

  useEffect(() => {
    let closed = false
    let stop: (() => void) | undefined
    void native.listenRewards(action => receive.current(action)).then(unlisten => {
      if (closed) unlisten()
      else stop = unlisten
    }).catch(console.error)
    return () => { closed = true; stop?.() }
  }, [])

  return {
    source, sourcePinned: source && progress[source.id] === 'pinned', selected,
    pinnedCount: pinned.length, undo, errorMessage,
    hideDirect: directStatus === 'claimed' || directStatus === 'dismissed',
  }
}
