import { useEffect, useMemo, useState } from 'react'
import type { Snapshot } from '../native/contract'
import { nextBuildMilestone, parseBuild } from './build'
import { buildGemPriority, buildLevel, buildStorageKey, loadBuilds, markGemCut } from './build-storage'

export function useBuildMilestone(state: Snapshot) {
  const [saved, setSaved] = useState(loadBuilds)
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === buildStorageKey || event.key === null) setSaved(loadBuilds())
    }
    window.addEventListener('storage', refresh)
    setSaved(loadBuilds())
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const source = saved.stages.find(stage => stage.filename === saved.active)?.source
  const guide = useMemo(() => {
    if (!source) return null
    try { return parseBuild(source) } catch { return null }
  }, [source])
  const { effective } = buildLevel(state, saved)
  const milestone = useMemo(() => guide && nextBuildMilestone(guide, effective), [guide, effective])
  const gemPriority = buildGemPriority(state, saved)
  return {
    milestone,
    gemPriority,
    cutGem(id: string) {
      if (gemPriority) setSaved(markGemCut(state, gemPriority.scope, id))
    },
  }
}
