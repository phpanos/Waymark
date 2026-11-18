import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import compass from '../assets/compass.png'
import { directionsByArea } from '../data/directions'
import { native } from '../native/bridge'
import type { Snapshot, Status, Zone } from '../native/contract'
import { completedObjectives, describeZone, statusText, type Route, type ZoneNavigation } from '../state/presentation'
import { useBuildMilestone } from '../state/use-build-milestone'
import { useTownRewards } from '../state/use-town-rewards'
import { OverlayActTimer } from './ActTimer'
import { DirectionDiagram } from './DirectionDiagram'
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

function RouteDiagram({ diagram }: { diagram: NonNullable<Route['diagram']> }) {
  return <figure className="route-diagram">
    <figcaption>{diagram.caption}</figcaption>
    <ul className="route-diagram-branches" role="list">
      {diagram.branches.map(branch => <li key={branch.landmark}>
        <strong>{branch.landmark}</strong><span>{branch.detail}</span>
      </li>)}
    </ul>
    <p className="route-diagram-destination">
      <strong>{diagram.destination.landmark}</strong><span>{diagram.destination.detail}</span>
    </p>
  </figure>
}

function AreaOverview({ navigation, fork, children }: {
  navigation: ZoneNavigation; fork?: Route['diagram']; children?: ReactNode
}) {
  return <section className="area-diagram" aria-label="Objectives and exits">
    <h2>Objectives and exits</h2>
    {navigation.waypoint && <p className="area-diagram-waypoint">Waypoint</p>}
    {fork && <RouteDiagram diagram={fork}/>}
    {children}
    {navigation.exits.length > 0 && <div className="area-diagram-exits">
      <h2>{navigation.label}</h2>
      <ul role="list">{navigation.exits.map(exit => <li key={exit.landmark}>
        <strong>{exit.landmark}</strong>{exit.detail && <span>{exit.detail}</span>}
      </li>)}</ul>
    </div>}
  </section>
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
  const shortcut = stale ? null : zone.shortcut
  const route = !stale && (zone.objective || featuredOptional) ? zone.route : null
  const navigation = stale ? null : zone.navigation
  const direction = !stale && zone.areaId ? directionsByArea[zone.areaId] : undefined
  const showRouteLandmarks = route && !(direction && (route.diagram || direction.layout === 'landmarks'))
  const tip = stale ? null : zone.tip
  const hasDiagram = navigation && (navigation.waypoint || navigation.exits.length || zone.objective || remaining.length)
  const hasDirections = !!(direction || route || hasDiagram || shortcut || tip || remaining.length)
  const recap = useRewardRecap(state, zone.act, zone.areaId)
  const town = useTownRewards(state, zone.areaId, zone.arrivalReward?.id, recap.showRecap)
  const reward = town.selected?.reward ?? (town.hideDirect ? null : zone.questReward)
  const claim = town.selected?.claim ?? zone.arrivalReward?.claim
  const townFeedback = !recap.showRecap && (town.undo || town.errorMessage)
  const hasDetails = hasDirections || recap.showRecap || !!milestone
  const expanded = state.detailsExpanded && hasDetails
  const quickRoute = !expanded && !recap.showRecap && direction && !direction.layout && !zone.arrivalReward?.objective
    ? direction.quickSteps ?? direction.legs.map(([, instruction]) => instruction) : null
  const optionalLoot = !expanded && !zone.objective ? featuredOptional?.loot : undefined
  const next = navigation?.exits.length === 1 ? navigation.exits[0].landmark : null
  const optionalObjectives = remaining.length > 0 && <div className="zone-optional"><h2>Optional objectives</h2>
    <ul>{remaining.map(objective => <li key={objective.id}>
      {objective.hint}
      {showRecommendations && objective.leagueStart && <span className="recommended"> · Recommended</span>}
      {objective.loot && <span className="objective-loot">{objective.loot}</span>}
    </li>)}</ul>
  </div>
  return <main ref={panel} className={`compact${expanded && shortcut ? ' with-shortcut' : ''}${route || next || quickRoute ? ' with-route' : ''}${expanded ? ' expanded' : ''}${expanded && milestone ? ' with-build' : ''}${reward || optionalLoot || townFeedback ? ' with-quest-reward' : ''}`}>
    <header className="compact-head">
      <div className="overlay-identity"><span className="brand"><img src={compass} alt=""/>Waymark</span><StatusLight status={state.status}/></div>
      <OverlayActTimer state={state} act={zone.act}/>
    </header>
    <div className="zone-block">
      <div className="zone-meta">
        <div className="eyebrow zone-context">{state.zone && stale && <span>Last zone</span>}{zone.act && <span className="act">Act {zone.act}</span>}</div>
        <div className="zone-actions">
          {hasDetails && <span className="details-gesture" data-expanded={expanded} title="Alt+click the header">Details <span aria-hidden="true">{expanded ? '▾' : '▸'}</span></span>}
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
      {reward && <p className="quest-reward">
        <span className="optional-label">{town.selected ? 'Pinned reward' : zone.arrivalReward?.optional ? 'Optional reward' : 'Reward'}</span>
        <span><strong>{reward}</strong>
          {claim && <span className="reward-claim">{claim}</span>}
        </span>
      </p>}
      {!recap.showRecap && town.undo && <div className="town-reward-actions" role="status">
        <p className="reward-feedback">{town.undo.status === 'claimed' ? 'Claimed' : 'Dismissed'} · {town.undo.reward.reward}</p>
      </div>}
      {!recap.showRecap && town.errorMessage && <p className="reward-feedback" role="status">{town.errorMessage}</p>}
      {quickRoute && <ol className="quick-route" aria-label="Route steps" role="list">
        {quickRoute.map(step => <li key={step}>{step}</li>)}
      </ol>}
      {route && !quickRoute && !recap.showRecap && <p className="route-preview direction" title={route.cue}>
        <span className="optional-label">Route</span>
        <span className="optional-hint">{route.cue}</span>
      </p>}
      {!expanded && !quickRoute && !route && navigation && next && <p className="route-preview" title={next}>
        <span className="optional-label">{navigation.label}</span><span className="optional-hint">{next}</span>
      </p>}
      {!expanded && featuredOptional && !zone.objective && <div className="optional-preview" title={featuredOptional.hint}>
        <span className="optional-label">Optional</span>
        <span className="optional-hint">{featuredOptional.hint}</span>
        {recommended && <span className="recommended">Recommended</span>}
        {remaining.length > 1 && <span>+{remaining.length - 1}</span>}
      </div>}
      {optionalLoot && <p className="quest-reward">
        <span className="optional-label">Reward</span>
        <strong>{optionalLoot}</strong>
      </p>}
      {expanded && !recap.showRecap && town.source && <p className="town-reward-source" title={town.source.reward}>
        {town.sourcePinned ? <span>Pinned for {town.source.townName}</span>
          : <span>Pin for {town.source.townName} · {town.source.reward}</span>}
      </p>}
      {expanded && !recap.showRecap && milestone && <Suspense fallback={null}><BuildMilestoneRow milestone={milestone} expanded={expanded}/></Suspense>}
      {expanded && (hasDirections || recap.showRecap || recap.available) && <section className="overlay-details" aria-label="Objective details">
        {recap.showRecap ? <RewardRecap act={zone.act} revision={state.revision} recap={recap}/> : <>
          {direction && <DirectionDiagram guide={direction}/>}
          {shortcut && <aside className="zone-shortcut"><h2>Shortcut</h2><p>{shortcut.detail}</p></aside>}
          {hasDiagram && navigation ? <AreaOverview navigation={navigation} fork={route?.diagram}>
            {optionalObjectives}
          </AreaOverview> : optionalObjectives}
          {showRouteLandmarks && <RouteLandmarks route={route}/>}
          {tip && <div><h2>Encounter tip</h2><p>{tip}</p></div>}
        </>}
      </section>}
    </footer>
  </main>
}
