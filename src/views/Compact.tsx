import { lazy, Suspense, useEffect, useRef } from 'react'
import compass from '../assets/compass.png'
import { native } from '../native/bridge'
import type { Snapshot, Status, Zone } from '../native/contract'
import { completedObjectives, describeZone, statusText, type Route } from '../state/presentation'
import { useBuildMilestone } from '../state/use-build-milestone'
import { RewardRecap, useRewardRecap } from './RewardRecap'

const BuildMilestoneRow = lazy(() => import('./BuildMilestone'))

export function StatusLight({ status }: { status: Status }) {
  return <span className={'status ' + status}><i aria-hidden="true" />{statusText[status]}</span>
}

export function RouteLandmarks({ route }: { route: Route }) {
  return <ol className="route-landmarks" role="list" aria-label="Route landmarks">
    {route.steps.map(step => <li key={step.landmark}><strong>{step.landmark}</strong><p>{step.detail}</p></li>)}
  </ol>
}

export function Compact({ state, previousZone = null }: { state: Snapshot; previousZone?: Zone | null }) {
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

  const previousAreaId = previousZone?.areaId ?? describeZone(previousZone).areaId
  const zone = describeZone(state.zone, previousAreaId)
  const milestone = useBuildMilestone(state)
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
  const recap = useRewardRecap(state, zone.act, zone.areaId)
  const hasDetails = hasDirections || recap.showRecap || !!milestone
  const expanded = state.detailsExpanded && hasDetails
  const optionalLoot = !expanded && !zone.objective ? featuredOptional?.loot : undefined
  return <main ref={panel} className={`compact${shortcut ? ' with-shortcut' : ''}${route ? ' with-route' : ''}${expanded ? ' expanded' : ''}${milestone ? ' with-build' : ''}${zone.questReward || optionalLoot ? ' with-quest-reward' : ''}`}>
    <header className="compact-head"><span className="brand"><img src={compass} alt=""/>Waymark</span><StatusLight status={state.status}/></header>
    <div className="zone-block">
      <div className="zone-meta">
        <div className="eyebrow">{context}{zone.act && <span className="act">Act {zone.act}</span>}</div>
        <div className="zone-actions">
          {recap.catalog.length > 0 && <span className="reward-count">{recap.remaining.length} {recap.remaining.length === 1 ? 'reward' : 'rewards'} left</span>}
          {hasDetails && <span className="details-gesture">Alt+click header {expanded ? '−' : '+'}</span>}
          {!hasDetails && recap.available && <span className="details-gesture">Alt+Shift+R</span>}
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
      {zone.questReward && <p className="quest-reward">
        <span className="optional-label">{zone.arrivalReward?.optional ? 'Optional reward' : 'Reward'}</span>
        <span><strong>{zone.questReward}</strong>
          {zone.arrivalReward?.claim && <span className="reward-claim">{zone.arrivalReward.claim}</span>}
        </span>
      </p>}
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
      {optionalLoot && <p className="quest-reward">
        <span className="optional-label">Reward</span>
        <strong>{optionalLoot}</strong>
      </p>}
      {milestone && <Suspense fallback={null}><BuildMilestoneRow milestone={milestone} expanded={expanded}/></Suspense>}
      {expanded && (hasDirections || recap.showRecap || recap.available) && <section className="overlay-details" aria-label="Objective details">
        {recap.showRecap ? <RewardRecap act={zone.act} recap={recap}/> : <>
          {route && <RouteLandmarks route={route}/>}
          {shortcut && <div className="zone-shortcut"><h2>Shortcut</h2><p>{shortcut.detail}</p></div>}
          {tip && <div><h2>Encounter tip</h2><p>{tip}</p></div>}
          {remaining.length > 0 && <div className="zone-optional"><h2>Optional objectives</h2>
            <ul>{remaining.map(objective => <li key={objective.id}>
              {objective.hint}
              {showRecommendations && objective.leagueStart && <span className="recommended"> · Recommended</span>}
              {objective.loot && <span className="objective-loot">{objective.loot}</span>}
            </li>)}</ul>
          </div>}
        </>}
        {recap.available && <p className="reward-keys">
          <span><kbd>Alt+Shift+R</kbd> {recap.showRecap ? 'Return to current objective' : 'Permanent rewards'}</span>
        </p>}
      </section>}
    </footer>
  </main>
}
