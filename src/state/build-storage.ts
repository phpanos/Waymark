import type { Snapshot } from '../native/contract'
import { activeProfile } from './presentation'
import { gemQueue, gemVariantIndex, parseGemGuide, type GemGuide } from './gem-priority'

export type BuildStage = { filename: string; source: string; gemGuide?: GemGuide; gemVariant?: number }
export type BuildLevel = { manual: number; useLog: boolean }
export type SavedBuilds = { stages: BuildStage[]; active: string; levels: Record<string, BuildLevel>; gemCuts: Record<string, string[]> }
export const buildStorageKey = 'waymark.build.v1'
const defaultLevel: BuildLevel = { manual: 1, useLog: true }
const empty: SavedBuilds = { stages: [], active: '', levels: {}, gemCuts: {} }

export function loadBuilds(): SavedBuilds {
  try {
    const stored = localStorage.getItem(buildStorageKey)
    if (!stored) return empty
    const saved = JSON.parse(stored) as Partial<SavedBuilds> | null
    if (!saved || !Array.isArray(saved.stages) || typeof saved.active !== 'string') return empty
    return {
      stages: saved.stages.filter(stage => stage && typeof stage.filename === 'string' && typeof stage.source === 'string')
        .map(stage => ({ ...stage, gemGuide: parseGemGuide(stage.gemGuide) })),
      active: saved.active,
      levels: saved.levels && typeof saved.levels === 'object' ? saved.levels : {},
      gemCuts: saved.gemCuts && typeof saved.gemCuts === 'object' ? saved.gemCuts : {},
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

export function buildGemPriority(state: Snapshot, saved: SavedBuilds) {
  const stage = saved.stages.find(item => item.filename === saved.active)
  if (!stage?.gemGuide) return null
  const { effective, profileKey } = buildLevel(state, saved)
  const automatic = gemVariantIndex(stage.gemGuide, effective)
  const variant = stage.gemGuide.variants[stage.gemVariant ?? automatic] ?? stage.gemGuide.variants[automatic]
  const scope = JSON.stringify([profileKey, stage.filename])
  const stored = saved.gemCuts[scope]
  const cut = Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []
  return { scope, variant, cut, ...gemQueue(variant, cut) }
}

export function setGemCut(state: Snapshot, scope: string, id: string, checked: boolean) {
  const saved = loadBuilds()
  const priority = buildGemPriority(state, saved)
  if (priority?.scope !== scope || priority.cut.includes(id) === checked ||
      ![...priority.all.gems, ...priority.all.supports].some(gem => gem.id === id)) return saved
  const cut = checked ? [...priority.cut, id] : priority.cut.filter(cutId => cutId !== id)
  const updated = { ...saved, gemCuts: { ...saved.gemCuts, [scope]: cut } }
  saveBuilds(updated)
  return updated
}
