import { useEffect, useRef, useState } from 'react'
import { native } from '../native/bridge'
import type { RewardAction, RewardClick, Snapshot, TownRewardStatus } from '../native/contract'
import { townRewardProgress, townRewards } from './presentation'

type TownReward = typeof townRewards[number]
type Change = {
  profile: number | null
  reward: TownReward
  status: 'claimed' | 'dismissed'
  previous: TownRewardStatus | null
}

export function useTownRewards(state: Snapshot, areaId: string | null, directId: string | undefined, recapOpen: boolean) {
  const profile = state.settings.activeProfile
  const live = state.status === 'watching' && state.replaySession === 0
  const canEdit = state.visible && live && !recapOpen
  const progress = townRewardProgress(state.settings)
  const [selection, setSelection] = useState<{ profile: number | null; id: string } | null>(null)
  const [lastChange, setLastChange] = useState<Change | null>(null)
  const [error, setError] = useState<{ profile: number | null; areaId: string | null; message: string } | null>(null)
  const busy = useRef(false)
  const receive = useRef<(action: RewardAction) => void>(() => {})
  const receiveClick = useRef<(click: RewardClick) => void>(() => {})

  const source = live ? townRewards.find(reward => areaId !== null && reward.from.includes(areaId) && progress[reward.id] !== 'claimed') : undefined
  const pinned = live ? townRewards.filter(reward => reward.townId === areaId && progress[reward.id] === 'pinned') : []
  const selected = pinned.find(reward => selection?.profile === profile && reward.id === selection.id)
    ?? pinned.find(reward => reward.id === directId) ?? pinned[0]
  const direct = live && directId ? townRewards.find(reward => reward.id === directId && reward.townId === areaId) : undefined
  const claimable = selected ?? direct
  const undo = live && lastChange?.profile === profile && lastChange.reward.townId === areaId &&
    progress[lastChange.reward.id] === lastChange.status ? lastChange : null
  const errorMessage = error?.profile === profile && error.areaId === areaId ? error.message : ''
  const claimTarget = canEdit && claimable ? 'town:claim:' + claimable.id : undefined
  const undoTarget = canEdit && undo ? 'town:undo:' + undo.reward.id : undefined

  function claim() {
    if (canEdit && claimable && !busy.current) void save(claimable, 'claimed', progress[claimable.id] ?? null)
  }

  function restore() {
    if (canEdit && undo && !busy.current) void save(undo.reward, undo.previous, undo.status)
  }

  async function save(reward: TownReward, status: TownRewardStatus | null, expected: TownRewardStatus | null) {
    busy.current = true
    setError(null)
    try {
      if (!await native.setTownReward(profile, reward.id, expected, status)) return
      if (status === 'claimed' || status === 'dismissed') {
        setLastChange({ profile, reward, status, previous: expected })
      } else if (reward.townId === areaId) {
        setLastChange(null)
        if (status === 'pinned') setSelection({ profile, id: reward.id })
      }
    } catch (error) {
      setError({ profile, areaId, message: String(error) })
    } finally {
      busy.current = false
    }
  }

  useEffect(() => {
    receive.current = action => {
      if (!canEdit || busy.current) return
      if (action === 'pin' && source && progress[source.id] !== 'pinned') {
        void save(source, 'pinned', progress[source.id] ?? null)
      } else if (action === 'next' && selected && pinned.length > 1) {
        const index = pinned.indexOf(selected)
        setSelection({ profile, id: pinned[(index + 1) % pinned.length].id })
      } else if (action === 'done') {
        claim()
      } else if (action === 'dismiss' && selected) {
        void save(selected, 'dismissed', 'pinned')
      } else if (action === 'undo') {
        restore()
      }
    }
    receiveClick.current = ({ revision, id }) => {
      if (revision !== state.revision || id === null) return
      if (id === claimTarget) claim()
      else if (id === undoTarget) restore()
    }
  })

  useEffect(() => {
    let closed = false
    const stops: (() => void)[] = []
    for (const registration of [native.listenRewards(action => receive.current(action)), native.listenRewardClicks(click => receiveClick.current(click))]) {
      void registration.then(unlisten => {
        if (closed) unlisten()
        else stops.push(unlisten)
      }).catch(console.error)
    }
    return () => { closed = true; stops.forEach(stop => stop()) }
  }, [])

  return {
    source, sourcePinned: source && progress[source.id] === 'pinned', selected,
    undo, errorMessage, claim, claimTarget, restore, undoTarget,
  }
}
