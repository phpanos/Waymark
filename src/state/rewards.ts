import { campaignAreas } from './presentation'

export type PermanentReward = {
  id: string
  name: string
  direction: string
  areas: { id: string; name: string }[]
}

const byAct = new Map<number, Map<string, PermanentReward>>()
for (const area of campaignAreas) {
  for (const objective of area.optional ?? []) {
    if (!objective.reward) continue
    let act = byAct.get(area.act)
    if (!act) {
      act = new Map()
      byAct.set(area.act, act)
    }
    const location = { id: area.id, name: area.name }
    const existing = act.get(objective.id)
    if (existing) existing.areas.push(location)
    else act.set(objective.id, { id: objective.id, ...objective.reward, areas: [location] })
  }
}

export function permanentRewards(act: number | null): PermanentReward[] {
  const rewards = act == null ? undefined : byAct.get(act)
  return rewards ? [...rewards.values()] : []
}

export function selectedReward(rewards: PermanentReward[], selection: string | undefined, areaId: string | null) {
  return rewards.find(reward => reward.id === selection)
    ?? rewards.find(reward => reward.areas.some(area => area.id === areaId))
    ?? rewards[0]
}
