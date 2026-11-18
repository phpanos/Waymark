import { useEffect, useMemo, useState } from 'react'
import type { Snapshot } from '../native/contract'
import { nextBuildMilestone, parseBuild } from './build'
import { buildLevel, buildStorageKey, loadBuilds } from './build-storage'

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
  return useMemo(() => guide && nextBuildMilestone(guide, effective), [guide, effective])
}
