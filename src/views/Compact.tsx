import compass from '../assets/compass.png'
import type { Snapshot, Status } from '../native/contract'
import { describeZone, statusText } from '../state/presentation'

export function StatusLight({ status }: { status: Status }) {
  return <span className={'status ' + status}><i aria-hidden="true" />{statusText[status]}</span>
}

export function Compact({ state }: { state: Snapshot }) {
  const zone = describeZone(state.zone)
  const showRecommendations = state.settings.leagueStart
  const recommended = showRecommendations ? zone.optional.find(objective => objective.leagueStart) : undefined
  const featuredOptional = recommended ?? zone.optional[0]
  const stale = state.status === 'missing' || state.status === 'readError'
  const context = state.zone && stale ? 'Last zone' : 'Current zone'
  const shortcut = stale ? null : zone.shortcut
  return <main className={shortcut ? 'compact with-shortcut' : 'compact'}>
    <header className="compact-head"><span className="brand"><img src={compass} alt=""/>Waymark</span><StatusLight status={state.status}/></header>
    <div className="zone-block">
      <div className="eyebrow">{context}{zone.act && <span className="act">Act {zone.act}</span>}</div>
      <h1 title={zone.title}>{zone.title}</h1>
    </div>
    <footer className="objective">
      {(zone.objective || !featuredOptional) && <>
        <div className="eyebrow">Story objective</div>
        <p className="story-objective" title={zone.objective ?? undefined}>{zone.objective ?? 'No objective assigned'}</p>
      </>}
      {shortcut && <p className="route-preview" title={shortcut.detail}>
        <span className="optional-label">Shortcut</span>
        <span className="optional-hint">{shortcut.cue}</span>
      </p>}
      {featuredOptional && <div className="optional-preview" title={featuredOptional.hint}>
        <span className="optional-label">Optional</span>
        <span className="optional-hint">{featuredOptional.hint}</span>
        {recommended && <span className="recommended">Recommended</span>}
        {zone.optional.length > 1 && <span>+{zone.optional.length - 1}</span>}
      </div>}
    </footer>
  </main>
}
