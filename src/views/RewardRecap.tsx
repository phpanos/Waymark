import { useEffect, useRef, useState } from 'react'
import { native } from '../native/bridge'
import type { RewardAction, RewardClick, Snapshot } from '../native/contract'
import { completedObjectives } from '../state/presentation'
import { permanentRewards, selectedReward, type PermanentReward } from '../state/rewards'

type Completion = { profile: number | null; id: string; name: string }

export function useRewardRecap(state: Snapshot, act: number | null, areaId: string | null, preview: boolean) {
  const profile = state.settings.activeProfile
  const scope = JSON.stringify([profile, act, areaId])
  const catalog = permanentRewards(act)
  const completed = completedObjectives(state.settings)
  const remaining = catalog.filter(reward => !completed.includes(reward.id))
  const [selection, setSelection] = useState<{ scope: string; id: string } | null>(null)
  const [lastDone, setLastDone] = useState<Completion | null>(null)
  const [feedback, setFeedback] = useState<{ profile: number | null; message: string } | null>(null)
  const pending = useRef(false)
  const receive = useRef<(action: RewardAction) => void>(() => {})
  const click = useRef<(event: RewardClick) => void>(() => {})
  const selected = selectedReward(remaining, selection?.scope === scope ? selection.id : undefined, areaId)
  const undo = lastDone?.profile === profile && completed.includes(lastDone.id) ? lastDone : null
  const canEdit = state.visible && state.status === 'watching' && state.replaySession === 0 && !preview
  const canMark = canEdit && !!selected
  const message = feedback?.profile === profile ? feedback.message : ''
  const available = !!(catalog.length || undo || message)
  const showRecap = available && state.rewardRecap && !preview

  function mark(reward: PermanentReward) {
    if (!canEdit || pending.current || completed.includes(reward.id)) return
    void save({ profile, id: reward.id, name: reward.name }, true)
  }

  function restore() {
    if (undo && !pending.current) void save(undo, false)
  }

  async function save(reward: Completion, done: boolean) {
    pending.current = true
    try {
      const changed = await native.completeObjective(reward.profile, reward.id, done)
      if (!changed) return
      setLastDone(done ? reward : null)
      if (!done) setSelection({ scope, id: reward.id })
      setFeedback({ profile: reward.profile, message: done ? `Marked done · ${reward.name}` : `Restored · ${reward.name}` })
    } catch (error) {
      setFeedback({ profile: reward.profile, message: String(error) })
    } finally {
      pending.current = false
    }
  }

  useEffect(() => {
    receive.current = action => {
      if (!state.visible || !state.detailsExpanded || !showRecap || pending.current) return
      if (action === 'next' && canMark && selected) {
        const index = remaining.indexOf(selected)
        setSelection({ scope, id: remaining[(index + 1) % remaining.length].id })
        setFeedback(null)
      } else if (action === 'done' && canMark && selected) {
        mark(selected)
      } else if (action === 'undo' && undo) {
        restore()
      }
    }

    click.current = ({ revision, id }) => {
      if (!canEdit || !showRecap || !state.detailsExpanded || revision !== state.revision) return
      if (id === null) restore()
      else {
        const reward = remaining.find(reward => reward.id === id)
        if (reward) mark(reward)
      }
    }
  })

  useEffect(() => {
    let closed = false
    const stops: (() => void)[] = []
    for (const registration of [native.listenRewards(action => receive.current(action)), native.listenRewardClicks(event => click.current(event))]) {
      void registration.then(unlisten => {
        if (closed) unlisten()
        else stops.push(unlisten)
      }).catch(console.error)
    }
    return () => { closed = true; stops.forEach(stop => stop()) }
  }, [])

  return { catalog, remaining, selected, canEdit, mark, restore, undo, message, available, showRecap }
}

export function RewardRecap({ act, recap }: {
  act: number | null
  recap: ReturnType<typeof useRewardRecap>
}) {
  const { catalog, remaining, selected, canEdit, mark, restore, undo, message } = recap
  return <section className="reward-recap" aria-label="Permanent rewards">
    <div className="reward-recap-heading">
      <h2>{catalog.length ? `Act ${act} permanent rewards` : 'Permanent rewards'}</h2>
      {catalog.length > 0 && <span className="reward-count">{remaining.length} {remaining.length === 1 ? 'reward' : 'rewards'} left</span>}
    </div>
    {remaining.length > 0 && <ul className="reward-list" role="list">
      {remaining.map(reward => <li key={reward.id} aria-current={reward === selected ? 'true' : undefined}>
        <input type="checkbox" aria-label={`Mark done: ${reward.name}`} checked={false} disabled={!canEdit} data-reward-target={reward.id} onChange={() => mark(reward)}/>
        <strong>{reward.name}</strong><span>{[...new Set(reward.areas.map(area => area.name))].join(' / ')}</span>
      </li>)}
    </ul>}
    {selected && <p className="reward-direction">{selected.direction}</p>}
    {catalog.length > 0 && !remaining.length && <p>All permanent rewards marked done.</p>}
    {(message || undo) && <p className="reward-feedback" role="status">{message || `Last marked done · ${undo?.name}`}</p>}
    {undo && <button type="button" className="reward-undo" disabled={!canEdit} data-reward-target="" onClick={restore}>Undo</button>}
  </section>
}
