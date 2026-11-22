import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import compass from '../assets/compass.png'
import { directionsByArea } from '../data/directions'
import { native } from '../native/bridge'
import type { RewardClick, Snapshot, Status, Zone } from '../native/contract'
import { adjacentStoryObjectives, completedObjectives, describeLiveZone, describeStoryStep, statusText, type Route, type StoryStep, type ZoneNavigation } from '../state/presentation'
import { permanentRewards } from '../state/rewards'
import { useBuildMilestone } from '../state/use-build-milestone'
import { useTownRewards } from '../state/use-town-rewards'
import { ActRewards } from './ActRewards'
import { OverlayActTimer } from './ActTimer'
import { DirectionDiagram } from './DirectionDiagram'
import { GemPriority } from './GemPriority'

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
        <p className="route-diagram-cue">{branch.cue}</p>
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

export function Compact({ state, previousZone = null, storyStep }: {
  state: Snapshot; previousZone?: Zone | null; storyStep?: StoryStep
}) {
  const panel = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  const scrollContent = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ up: false, down: false })
  const [previewStep, setPreviewStep] = useState<StoryStep | null>(null)
  useEffect(() => {
    setPreviewStep(null)
  }, [state.activePath, state.settings.activeProfile, state.replaySession, state.status])
  const lastHeight = useRef(0)
  const lastTargets = useRef('')
  useLayoutEffect(() => {
    const card = panel.current
    const body = content.current
    const viewport = scrollArea.current
    const flow = scrollContent.current
    if (!card || !body || !viewport || !flow) return
    const controls = [...card.querySelectorAll<HTMLElement>('[data-reward-target]:not(:disabled)')]
    const measure = () => {
      const bounds = viewport.getBoundingClientRect()
      // Report the layout's full height even when the native window caps the viewport.
      const naturalHeight = body.getBoundingClientRect().height - bounds.height + flow.getBoundingClientRect().height
      const minHeight = card.matches('.with-quest-reward:not(.expanded)') ? 190 : 0
      const height = Math.max(minHeight, Math.ceil(naturalHeight) + 6)
      if (height !== lastHeight.current) {
        lastHeight.current = height
        void native.overlayHeight(height).catch(console.error)
      }
      const up = viewport.scrollTop > 1
      const down = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1
      setScroll(previous => previous.up === up && previous.down === down ? previous : { up, down })
      const targets = controls.flatMap(control => {
        let { left, top, right, bottom } = control.getBoundingClientRect()
        if (viewport.contains(control)) {
          left = Math.max(left, bounds.left)
          top = Math.max(top, bounds.top)
          right = Math.min(right, bounds.right)
          bottom = Math.min(bottom, bounds.bottom)
        }
        return right > left && bottom > top ? [{ id: control.dataset.rewardTarget || null, left, top, right, bottom }] : []
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
    resize.observe(viewport)
    resize.observe(flow)
    for (const control of controls) resize.observe(control)
    window.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure, { passive: true })
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
    }
  })

  const liveZone = describeLiveZone(state, previousZone, storyStep)
  const preview = previewStep !== null
  const zone = previewStep ? describeStoryStep(previewStep) : liveZone
  const build = useBuildMilestone(state)
  const milestone = preview ? null : build.milestone
  const gemPriority = !preview && state.status === 'watching' && state.replaySession === 0 ? build.gemPriority : null
  const completed = completedObjectives(state.settings)
  const remaining = zone.optional.filter(objective => !completed.includes(objective.id))
  const showRecommendations = state.settings.leagueStart
  const stale = state.status === 'missing' || state.status === 'readError'
  const shortcut = stale ? null : zone.shortcut
  const route = !stale && (zone.objective || remaining.length > 0) ? zone.route : null
  const navigation = stale ? null : zone.navigation
  const contextual = previewStep ? !!previewStep.objective : liveZone.contextual
  const direction = !stale && !contextual && zone.areaId ? directionsByArea[zone.areaId] : undefined
  const showRouteLandmarks = route && !(direction && (route.diagram || direction.layout === 'landmarks'))
  const tip = stale ? null : zone.tip
  const hasDiagram = navigation && (navigation.waypoint || navigation.exits.length || zone.objective || remaining.length)
  const hasDirections = !!(direction || route || hasDiagram || shortcut || tip || remaining.length)
  const rewards = permanentRewards(zone.act)
  const showRewards = state.rewardRecap && rewards.length > 0
  const town = useTownRewards(state, liveZone.areaId, liveZone.arrivalReward?.id, showRewards || preview)
  const pinned = preview ? undefined : town.selected
  const reward = pinned?.reward ?? zone.questReward
  const claim = pinned?.claim ?? (zone.arrivalReward?.objective === zone.objective ? undefined : zone.arrivalReward?.claim)
  const townFeedback = !preview && (town.undo || town.errorMessage)
  const hasDetails = hasDirections || !!milestone
  const expanded = state.detailsExpanded && hasDetails && !showRewards
  const storyTravelTip = contextual && !stale ? (previewStep ?? liveZone.storyStep)?.travelTip : undefined
  const quickRoute = !expanded &&
    (!zone.arrivalReward?.objective || zone.arrivalReward.objectiveAfterClaim)
    ? direction?.quickSteps ?? direction?.legs.map(([, instruction]) => instruction) ??
      (storyTravelTip ? [storyTravelTip] : shortcut ? [shortcut.cue] : null)
    : null
  const next = navigation?.exits.length === 1 ? navigation.exits[0].landmark : null
  const adjacent = adjacentStoryObjectives(zone.areaId, liveZone.previousAreaId, previewStep ?? liveZone.storyStep)
  const canBrowse = state.visible && state.status === 'watching' && state.replaySession === 0 && !showRewards
  useLayoutEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = 0
  }, [zone.areaId, zone.title, liveZone.storyStep, previewStep, showRewards, expanded, state.settings.activeProfile])

  function scrollPage(direction: number) {
    const viewport = scrollArea.current
    if (viewport) viewport.scrollBy({ top: direction * Math.max(1, viewport.clientHeight - 32) })
  }

  const overlayClick = useRef<(click: RewardClick) => void>(() => {})
  useLayoutEffect(() => {
    overlayClick.current = ({ revision, id }) => {
      if (!state.visible || revision !== state.revision) return
      if (id === 'overlay:page-up') scrollPage(-1)
      if (id === 'overlay:page-down') scrollPage(1)
      if (!canBrowse) return
      if (gemPriority && id?.startsWith('build:cut:')) build.cutGem(id.slice('build:cut:'.length))
      if (id === 'guide:previous' && adjacent.previous) setPreviewStep(adjacent.previous)
      if (id === 'guide:next' && adjacent.next) setPreviewStep(adjacent.next)
      if (id === 'guide:live') setPreviewStep(null)
    }
  })
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void native.listenRewardClicks(click => overlayClick.current(click)).then(unlisten => {
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
  return <main ref={panel} data-status={state.status} data-area-id={zone.areaId ?? undefined}
    className={`compact${expanded ? ' expanded' : ''}${!showRewards && (reward || townFeedback) ? ' with-quest-reward' : ''}`}>
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
            {!showRewards && hasDetails && <span className="details-gesture" data-expanded={expanded} title="Alt+click the header">Details <span aria-hidden="true">{expanded ? '▾' : '▸'}</span></span>}
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
      <div className="overlay-scroll" ref={scrollArea}>
        <div className="overlay-scroll-content" ref={scrollContent}>
          {showRewards ? <ActRewards act={zone.act} rewards={rewards}/> : <div className="objective">
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
            {!preview && town.undo && <div className="town-reward-actions" role="status">
              <p className="reward-feedback">{town.undo.status === 'claimed' ? 'Claimed' : 'Dismissed'} · {town.undo.reward.reward}</p>
              {town.undoTarget && <button type="button" className="reward-undo" data-reward-target={town.undoTarget} onClick={town.restore}>Undo</button>}
            </div>}
            {!preview && town.errorMessage && <p className="reward-feedback" role="status">{town.errorMessage}</p>}
            {quickRoute && <ol className="quick-route" aria-label="Route steps" role="list">
              {quickRoute.map((step, index) => <li key={step}>
                {index === 0 && (direction || storyTravelTip) ? <div className="traversal-tip">
                  <span className="optional-label">Start here</span><span className="traversal-instruction">{step}</span>
                </div> : step}
              </li>)}
            </ol>}
            {route && !quickRoute && <p className="route-preview direction" title={route.cue}>
              <span className="optional-label">Route</span>
              <span className="optional-hint">{route.cue}</span>
            </p>}
            {!expanded && !quickRoute && !route && navigation && next && <p className="route-preview" title={next}>
              <span className="optional-label">{navigation.label}</span><span className="optional-hint">{next}</span>
            </p>}
            {!expanded && !stale && optionalObjectives}
            {expanded && !preview && town.source && <p className="town-reward-source" title={town.source.reward}>
              {town.sourcePinned ? <span>Pinned for {town.source.townName}</span>
                : <span>Pin for {town.source.townName} · {town.source.reward}</span>}
            </p>}
            {gemPriority && <GemPriority gem={gemPriority.gems[0]} support={gemPriority.supports[0]} onCut={build.cutGem}/>}
            {expanded && milestone && <Suspense fallback={null}><BuildMilestoneRow milestone={milestone} expanded={expanded}/></Suspense>}
            {expanded && hasDirections && <section className="overlay-details" aria-label="Objective details">
              {direction && !route?.diagram && <DirectionDiagram guide={direction}/>}
              {shortcut && <aside className="zone-shortcut"><h2>Shortcut</h2><p>{shortcut.detail}</p></aside>}
              {hasDiagram && navigation ? <AreaOverview navigation={navigation} fork={route?.diagram}>
                {optionalObjectives}
              </AreaOverview> : optionalObjectives}
              {showRouteLandmarks && <RouteLandmarks route={route}/>}
              {tip && <div><h2>Encounter tip</h2><p>{tip}</p></div>}
            </section>}
          </div>}
        </div>
      </div>
      <footer className="compact-footer">
        {(scroll.up || scroll.down) && <nav className="overlay-scroll-controls" aria-label="Scroll the overlay">
          <button type="button" data-reward-target="overlay:page-up" aria-label="Scroll up"
            title="Alt+click to scroll up" disabled={!scroll.up} onClick={() => scrollPage(-1)}>↑</button>
          <button type="button" data-reward-target="overlay:page-down" aria-label="Scroll down"
            title="Alt+click to scroll down" disabled={!scroll.down} onClick={() => scrollPage(1)}>↓</button>
        </nav>}
        <button type="button" className="act-rewards-toggle" data-reward-target="act-rewards"
          title="Alt+click to toggle act rewards" aria-expanded={showRewards} aria-controls={showRewards ? 'act-rewards' : undefined}
          disabled={rewards.length === 0}>Rewards</button>
      </footer>
    </div>
    <span className="resize-grip" aria-hidden="true"/>
  </main>
}
