import type { Snapshot } from '../native/contract'
import { activeProfile } from './presentation'

export type BuildStage = { filename: string; source: string }
export type BuildLevel = { manual: number; useLog: boolean }
export type SavedBuilds = { stages: BuildStage[]; active: string; levels: Record<string, BuildLevel> }
export const buildStorageKey = 'waymark.build.v1'
const defaultLevel: BuildLevel = { manual: 1, useLog: true }
const empty: SavedBuilds = { stages: [], active: '', levels: {} }

export function loadBuilds(): SavedBuilds {
  try {
    const stored = localStorage.getItem(buildStorageKey)
    if (!stored) return empty
    const saved = JSON.parse(stored) as Partial<SavedBuilds> | null
    if (!saved || !Array.isArray(saved.stages) || typeof saved.active !== 'string') return empty
    return {
      stages: saved.stages.filter(stage => stage && typeof stage.filename === 'string' && typeof stage.source === 'string'),
      active: saved.active,
      levels: saved.levels && typeof saved.levels === 'object' ? saved.levels : {},
    }
  } catch {
    return empty
  }
}

export function saveBuilds(saved: SavedBuilds) {
  localStorage.setItem(buildStorageKey, JSON.stringify(saved))
}

export function buildLevel(state: Snapshot, saved: SavedBuilds) {
  const profile = activeProfile(state.settings)
  const profileKey = JSON.stringify(profile ? [profile.character, profile.league] : [])
  const stored = saved.levels[profileKey]
  const preferences = stored && Number.isInteger(stored.manual) && stored.manual >= 1 && stored.manual <= 100 &&
    typeof stored.useLog === 'boolean' ? stored : defaultLevel
  const logged = profile && preferences.useLog ? state.characterLevel : null
  return { profile, profileKey, preferences, logged, effective: logged ?? preferences.manual }
}
