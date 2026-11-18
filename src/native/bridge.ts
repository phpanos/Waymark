import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { channel, rewardChannel, type RewardAction, type Snapshot, type Placement, type TownRewardStatus } from './contract'

export const native = {
  listen: (accept: (s: Snapshot) => void) => listen<Snapshot>(channel, e => accept(e.payload)),
  snapshot: () => invoke<Snapshot>('snapshot'),
  pick: () => invoke<void>('pick_log'),
  discover: () => invoke<void>('use_discovery'),
  position: (placement: Placement) => invoke<void>('set_placement', { placement }),
  leagueStart: (enabled: boolean) => invoke<void>('set_league_start', { enabled }),
  campaignProfile: (character: string, league: string) => invoke<void>('set_campaign_profile', { character, league }),
  completeObjective: (profile: number | null, objective: string, completed: boolean) =>
    invoke<boolean>('set_objective_completed', { profile, objective, completed }),
  setTownReward: (profile: number | null, reward: string, expected: TownRewardStatus | null, status: TownRewardStatus) =>
    invoke<boolean>('set_town_reward', { profile, reward, expected, status }),
  listenRewards: (accept: (action: RewardAction) => void) => listen<RewardAction>(rewardChannel, e => accept(e.payload)),
  toggle: () => invoke<void>('toggle_overlay'),
  overlayHeight: (height: number) => invoke<void>('set_overlay_height', { height }),
  replay: (enabled: boolean) => invoke<void>('replay_fixture', { enabled }),
  close: () => invoke<void>('close_settings'),
}
