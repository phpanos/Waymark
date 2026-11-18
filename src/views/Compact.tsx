import { useEffect, useRef } from 'react'
import compass from '../assets/compass.png'
import { native } from '../native/bridge'
import type { Snapshot, Status } from '../native/contract'
import { completedObjectives, describeZone, statusText, type Route } from '../state/presentation'
import { RewardRecap, useRewardRecap } from './RewardRecap'

export function StatusLight({ status }: { status: Status }) {
  return <span className={'status ' + status}><i aria-hidden="true" />{statusText[status]}</span>
}

export function RouteLandmarks({ route }: { route: Route }) {
  return <ol className="route-landmarks" role="list" aria-label="Route landmarks">
    {route.steps.map(step => <li key={step.landmark}><strong>{step.landmark}</strong><p>{step.detail}</p></li>)}
  </ol>
}

export function Compact({ state }: { state: Snapshot }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const card = panel.current
    if (!card) return
    let lastHeight = 0
    const resize = new ResizeObserver(() => {
      const height = Math.ceil(card.getBoundingClientRect().height) + 4
      if (height === lastHeight) return
      lastHeight = height
      void native.overlayHeight(height).catch(console.error)
    })
    resize.observe(card)
    return () => resize.disconnect()
  }, [])

  const zone = describeZone(state.zone)
  const completed = completedObjectives(state.settings)
  const remaining = zone.optional.filter(objective => !completed.includes(objective.id))
  const showRecommendations = state.settings.leagueStart
  const recommended = showRecommendations ? remaining.find(objective => objective.leagueStart) : undefined
  const featuredOptional = recommended ?? remaining[0]
  const stale = state.status === 'missing' || state.status === 'readError'
  const context = state.zone && stale ? 'Last zone' : 'Current zone'
  const shortcut = stale ? null : zone.shortcut
  const route = !stale && (zone.objective || featuredOptional) ? zone.route : null
  const tip = stale ? null : zone.tip
  const hasDirections = !!(route || shortcut || tip || remaining.length)
  const recap = useRewardRecap(state, zone.act, zone.areaId, hasDirections)
  const hasDetails = hasDirections || recap.available
  const expanded = state.detailsExpanded && hasDetails
  return <main ref={panel} className={`compact${shortcut ? ' with-shortcut' : ''}${route ? ' with-route' : ''}${expanded ? ' expanded' : ''}`}>
    <header className="compact-head"><span className="brand"><img src={compass} alt=""/>Waymark</span><StatusLight status={state.status}/></header>
    <div className="zone-block">
      <div className="zone-meta">
        <div className="eyebrow">{context}{zone.act && <span className="act">Act {zone.act}</span>}</div>
        <div className="zone-actions">
          {recap.catalog.length > 0 && <span className="reward-count">{recap.remaining.length} {recap.remaining.length === 1 ? 'reward' : 'rewards'} left</span>}
          {hasDetails && <span className="details-gesture">Alt+click header {expanded ? '−' : '+'}</span>}
        </div>
      </div>
      <h1 title={zone.title}>{zone.title}</h1>
    </div>
    <footer className="objective">
      {(zone.objective || !featuredOptional) && <>
        <div className="eyebrow">{!zone.objective && zone.optional.length ? 'Optional objectives' : 'Story objective'}</div>
        <p className="story-objective" title={zone.objective ?? undefined}>
          {zone.objective ?? (zone.optional.length ? 'Optional objectives complete' : 'No objective assigned')}
        </p>
      </>}
      {route && <p className="route-preview direction" title={route.cue}>
        <span className="optional-label">Route</span>
        <span className="optional-hint">{route.cue}</span>
      </p>}
      {!expanded && shortcut && <p className="route-preview" title={shortcut.detail}>
        <span className="optional-label">Shortcut</span>
        <span className="optional-hint">{shortcut.cue}</span>
      </p>}
      {!expanded && featuredOptional && <div className="optional-preview" title={featuredOptional.hint}>
        <span className="optional-label">Optional</span>
        <span className="optional-hint">{featuredOptional.hint}</span>
        {recommended && <span className="recommended">Recommended</span>}
        {remaining.length > 1 && <span>+{remaining.length - 1}</span>}
      </div>}
      {expanded && <section className="overlay-details" aria-label="Objective details">
        {recap.available && hasDirections && <p className="reward-keys">
          <span><kbd>Alt+Shift+R</kbd> {recap.showRecap ? 'Directions' : 'Rewards'}</span>
        </p>}
        {recap.showRecap ? <RewardRecap act={zone.act} recap={recap}/> : <>
          {route && <RouteLandmarks route={route}/>}
          {shortcut && <div><h2>Shortcut</h2><p>{shortcut.detail}</p></div>}
          {tip && <div><h2>Encounter tip</h2><p>{tip}</p></div>}
          {remaining.length > 0 && <div className="zone-optional"><h2>Optional objectives</h2>
            <ul>{remaining.map(objective => <li key={objective.id}>
              {objective.hint}
              {showRecommendations && objective.leagueStart && <span className="recommended"> · Recommended</span>}
            </li>)}</ul>
          </div>}
        </>}
      </section>}
    </footer>
  </main>
}
