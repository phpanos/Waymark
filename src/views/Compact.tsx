import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import compass from '../assets/compass.png'
import { directionsByArea } from '../data/directions'
import { native } from '../native/bridge'
import type { RewardClick, Snapshot, Status, Zone } from '../native/contract'
import { adjacentStoryObjectives, completedObjectives, describeStoryStep, describeZone, reachedClearfell, statusText, townRewardProgress, type Route, type StoryStep, type ZoneNavigation } from '../state/presentation'
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
  const content = useRef<HTMLDivElement>(null)
  const [previewStep, setPreviewStep] = useState<StoryStep | null>(null)
  useEffect(() => {
    setPreviewStep(null)
  }, [state.activePath, state.settings.activeProfile, state.replaySession, state.status])
  const lastHeight = useRef(0)
  const lastTargets = useRef('')
  useLayoutEffect(() => {
    const card = panel.current
    const body = content.current
    if (!card || !body) return
    const controls = [...card.querySelectorAll<HTMLElement>('[data-reward-target]:enabled')]
    const measure = () => {
      const height = Math.ceil(body.getBoundingClientRect().height) + 6
      if (height !== lastHeight.current) {
        lastHeight.current = height
        void native.overlayHeight(height).catch(console.error)
      }
      const targets = controls.map(control => {
        const { left, top, right, bottom } = control.getBoundingClientRect()
        return { id: control.dataset.rewardTarget || null, left, top, right, bottom }
      })
      const viewportHeight = window.innerHeight
      const key = JSON.stringify([state.revision, viewportHeight, targets])
      if (key === lastTargets.current) return
      lastTargets.current = key
      void native.setRewardTargets(state.revision, viewportHeight, targets).catch(console.error)
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(body)
    for (const control of controls) resize.observe(control)
    window.addEventListener('resize', measure)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', measure)
    }
  })

  const previousAreaId = previousZone?.areaId ?? describeZone(previousZone).areaId
  const liveZone = describeZone(state.zone, previousAreaId, townRewardProgress(state.settings), reachedClearfell(state.settings))
  const preview = previewStep !== null
  const zone = previewStep ? describeStoryStep(previewStep) : liveZone
  const buildMilestone = useBuildMilestone(state)
  const milestone = preview ? null : buildMilestone
  const completed = completedObjectives(state.settings)
  const remaining = zone.optional.filter(objective => !completed.includes(objective.id))
  const showRecommendations = state.settings.leagueStart
  const stale = state.status === 'missing' || state.status === 'readError'
  const shortcut = stale ? null : zone.shortcut
  const route = !stale && (zone.objective || remaining.length > 0) ? zone.route : null
  const navigation = stale ? null : zone.navigation
  const direction = !stale && !previewStep?.objective && zone.areaId ? directionsByArea[zone.areaId] : undefined
  const showRouteLandmarks = route && !(direction && (route.diagram || direction.layout === 'landmarks'))
  const tip = stale ? null : zone.tip
  const hasDiagram = navigation && (navigation.waypoint || navigation.exits.length || zone.objective || remaining.length)
  const hasDirections = !!(direction || route || hasDiagram || shortcut || tip || remaining.length)
  const recap = useRewardRecap(state, liveZone.act, liveZone.areaId, preview)
  const town = useTownRewards(state, liveZone.areaId, liveZone.arrivalReward?.id, recap.showRecap || preview)
  const pinned = preview ? undefined : town.selected
  const reward = pinned?.reward ?? zone.questReward
  const claim = pinned?.claim ?? (zone.arrivalReward?.objective === zone.objective ? undefined : zone.arrivalReward?.claim)
  const townFeedback = !recap.showRecap && !preview && (town.undo || town.errorMessage)
  const hasDetails = hasDirections || recap.showRecap || !!milestone
  const expanded = state.detailsExpanded && hasDetails
  const quickRoute = !expanded && !recap.showRecap &&
    (!zone.arrivalReward?.objective || zone.arrivalReward.objectiveAfterClaim)
    ? direction?.quickSteps ?? direction?.legs.map(([, instruction]) => instruction) ??
      (shortcut ? [shortcut.cue] : null)
    : null
  const returnSteps = quickRoute ? direction?.returnSteps : undefined
  const next = navigation?.exits.length === 1 ? navigation.exits[0].landmark : null
  const adjacent = adjacentStoryObjectives(zone.areaId, previousAreaId, previewStep)
  const canBrowse = state.visible && state.status === 'watching' && state.replaySession === 0 && !recap.showRecap
  const browseClick = useRef<(click: RewardClick) => void>(() => {})
  useLayoutEffect(() => {
    browseClick.current = ({ revision, id }) => {
      if (!canBrowse || revision !== state.revision) return
      if (id === 'guide:previous' && adjacent.previous) setPreviewStep(adjacent.previous)
      if (id === 'guide:next' && adjacent.next) setPreviewStep(adjacent.next)
      if (id === 'guide:live') setPreviewStep(null)
    }
  })
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void native.listenRewardClicks(click => browseClick.current(click)).then(unlisten => {
      if (disposed) unlisten()
      else stop = unlisten
    }).catch(console.error)
    return () => { disposed = true; stop?.() }
  }, [])
  const optionalObjectives = remaining.length > 0 && <div className="zone-optional"><h2>{expanded ? 'Optional objectives' : 'Optional'}</h2>
    <ul>{remaining.map(objective => <li key={objective.id}>
      {expanded ? objective.hint : objective.compactHint ?? objective.hint}
      {showRecommendations && objective.leagueStart && <span className="recommended"> · Recommended</span>}
      {expanded && objective.loot && <span className="objective-loot">{objective.loot}</span>}
      {!expanded && objective.compactReward && <span className="optional-reward">{objective.compactReward}</span>}
    </li>)}</ul>
  </div>
  return <main ref={panel} data-status={state.status} className={`compact${expanded ? ' expanded' : ''}${reward || townFeedback ? ' with-quest-reward' : ''}`}>
    <div ref={content} className="compact-content">
      <header className="compact-head">
        <div className="overlay-identity">
          <span className="overlay-wordmark"><img src={compass} alt=""/>Waymark</span>
          {state.status !== 'watching' && <StatusLight status={state.status}/>}
        </div>
        <OverlayActTimer state={state} act={liveZone.act}/>
      </header>
      <div className="zone-block">
        <div className="zone-meta">
          <div className="zone-context">
            {(preview || (state.zone && stale)) && <div className="eyebrow">{preview ? 'Preview' : 'Last zone'}</div>}
            <h1 title={zone.title}>{zone.title}</h1>
          </div>
          <div className="zone-actions">
            {hasDetails && <span className="details-gesture" data-expanded={expanded} title="Alt+click the header">Details <span aria-hidden="true">{expanded ? '▾' : '▸'}</span></span>}
            {canBrowse && (adjacent.previous || adjacent.next || preview) && <nav className="guide-navigation" aria-label="Story objectives">
              {preview && <button type="button" data-reward-target="guide:live" onClick={() => setPreviewStep(null)} aria-label="Resume live tracking">Live</button>}
              <button type="button" disabled={!adjacent.previous} data-reward-target="guide:previous" aria-label="Previous story objective"
                onClick={() => adjacent.previous && setPreviewStep(adjacent.previous)}>‹</button>
              <button type="button" disabled={!adjacent.next} data-reward-target="guide:next" aria-label="Next story objective"
                onClick={() => adjacent.next && setPreviewStep(adjacent.next)}>›</button>
            </nav>}
          </div>
        </div>
      </div>
      <footer className="objective">
        {(zone.objective || remaining.length === 0) && <p className="story-objective">
          {zone.objective ?? (zone.optional.length ? 'Optional objectives complete' : 'No objective assigned')}
        </p>}
        {reward && <div className={town.claimTarget ? 'quest-reward with-claim-control' : 'quest-reward'}>
          <span className="optional-label">{pinned ? 'Pinned reward' : zone.arrivalReward?.optional ? 'Optional reward' : 'Reward'}</span>
          <span className="quest-reward-copy"><strong>{reward}</strong>
            {claim && <span className="reward-claim">{claim}</span>}
          </span>
          {town.claimTarget && <button type="button" className="reward-claim-button" data-reward-target={town.claimTarget} onClick={town.claim}>Mark claimed</button>}
        </div>}
        {!recap.showRecap && !preview && town.undo && <div className="town-reward-actions" role="status">
          <p className="reward-feedback">{town.undo.status === 'claimed' ? 'Claimed' : 'Dismissed'} · {town.undo.reward.reward}</p>
          {town.undoTarget && <button type="button" className="reward-undo" data-reward-target={town.undoTarget} onClick={town.restore}>Undo</button>}
        </div>}
        {!recap.showRecap && !preview && town.errorMessage && <p className="reward-feedback" role="status">{town.errorMessage}</p>}
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
        {!expanded && !recap.showRecap && !stale && optionalObjectives}
        {returnSteps && <section className="route-return" aria-label={returnSteps.heading}>
          <h2>{returnSteps.heading}</h2>
          <ol className="quick-route" role="list">
            {returnSteps.steps.map(step => <li key={step}>{step}</li>)}
          </ol>
        </section>}
        {expanded && !recap.showRecap && !preview && town.source && <p className="town-reward-source" title={town.source.reward}>
          {town.sourcePinned ? <span>Pinned for {town.source.townName}</span>
            : <span>Pin for {town.source.townName} · {town.source.reward}</span>}
        </p>}
        {expanded && !recap.showRecap && milestone && <Suspense fallback={null}><BuildMilestoneRow milestone={milestone} expanded={expanded}/></Suspense>}
        {expanded && (hasDirections || recap.showRecap || recap.available) && <section className="overlay-details" aria-label="Objective details">
          {recap.showRecap ? <RewardRecap act={zone.act} recap={recap}/> : <>
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
    </div>
    <span className="resize-grip" aria-hidden="true"/>
  </main>
}
