import type { PermanentReward } from '../state/rewards'

export function ActRewards({ act, rewards }: { act: number | null; rewards: PermanentReward[] }) {
  return <section id="act-rewards" className="act-rewards" aria-labelledby="act-rewards-heading">
    <h2 id="act-rewards-heading">Act {act} permanent rewards</h2>
    <ul className="reward-list" role="list">
      {rewards.map(reward => <li key={reward.id}>
        <strong>{reward.name}</strong>
        <span>{[...new Set(reward.areas.map(area => area.name))].join(' / ')}</span>
        <p>{reward.direction}</p>
      </li>)}
    </ul>
  </section>
}
