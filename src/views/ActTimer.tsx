import { useEffect, useState } from 'react'
import { native } from '../native/bridge'
import type { ActClock, Snapshot } from '../native/contract'
import { activeProfile } from '../state/presentation'

function activeTiming(settings: Snapshot['settings']) {
  return settings.activeProfile === null ? settings.defaultActTiming : activeProfile(settings)?.actTiming
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(part => String(part).padStart(2, '0')).join(':')
}

function TimerValue({ clock }: { clock?: ActClock | null }) {
  const startedAt = clock?.startedAt
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (startedAt == null) return
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [startedAt])
  const elapsed = (clock?.elapsedMs ?? 0) + (startedAt == null ? 0 : Math.max(0, now - startedAt))
  return <span className="act-timer-value">{formatDuration(elapsed)}</span>
}

export function OverlayActTimer({ state, act }: { state: Snapshot; act: number | null }) {
  const clock = activeTiming(state.settings)?.current
  const running = clock?.startedAt != null
  const canStart = act !== null && state.status === 'watching' && state.replaySession === 0
  if (!clock && !canStart) return null
  return <div className="act-timer" data-running={running} aria-label={`Act ${clock?.act ?? act} timer ${running ? 'running' : 'stopped'}`}>
    <span className="act-timer-label">Act {clock?.act ?? act}</span>
    <TimerValue clock={clock}/>
    {clock && !running && <span className="act-timer-state">Paused</span>}
  </div>
}

export function ActTimerSettings({ state, act, run }: {
  state: Snapshot; act: number | null; run: (task: () => Promise<void>) => void
}) {
  const timing = activeTiming(state.settings)
  const clock = timing?.current
  const running = clock?.startedAt != null
  const canStart = state.status === 'watching' && state.replaySession === 0 && act !== null
  const saved = Object.entries(timing?.finished ?? {})
  return <div className="act-timer-settings">
    <div className="field act-timer-card">
      <div className="act-timer-card-heading"><div className="eyebrow">{clock || canStart ? `Act ${clock?.act ?? act}` : 'Act timer'}</div>
        <span className="act-timer-state" data-running={running}>{running ? 'Running' : clock ? 'Paused' : 'Ready'}</span></div>
      <TimerValue clock={clock}/>
      <div className="actions"><button className="primary" disabled={!running && !canStart} onClick={() => run(native.toggleActTimer)}>
        {running ? 'Stop timer' : 'Start timer'}
      </button><kbd>Alt+Shift+T</kbd></div>
      {!clock && !canStart && <p className="hint">Enter an Acts 1–4 area to start timing.</p>}
    </div>
    {saved.length > 0 && <div className="field">
      <div className="eyebrow">Saved act times</div>
      <dl className="act-timer-history">{saved.map(([act, elapsed]) => <div key={act}>
        <dt>Act {act}</dt><dd>{formatDuration(elapsed)}</dd>
      </div>)}</dl>
    </div>}
  </div>
}
