import { lazy, Suspense, useState, type FormEvent, type ReactNode } from 'react'
import compass from '../assets/compass.png'
import { native } from '../native/bridge'
import type { Corner, Placement, Snapshot } from '../native/contract'
import { activeProfile, campaignAreas, describeZone, searchCampaign } from '../state/presentation'
import { CharacterProfile } from './CharacterProfile'
import { StatusLight } from './Compact'
import { Updates } from './Updates'

type Run = (task: () => Promise<void>) => void
type Tab = 'Log source' | 'Position' | 'Objectives' | 'Build' | 'Diagnostics' | 'Updates'
const Build = lazy(() => import('./Build'))
const corners: [Corner, string][] = [['topLeft', 'Top left'], ['topRight', 'Top right'], ['bottomLeft', 'Bottom left'], ['bottomRight', 'Bottom right']]
const campaignActs = [...new Set(campaignAreas.map(area => area.act))].sort((a, b) => a - b)

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><div className="eyebrow">{label}</div>{children}</div>
}

function Objectives({ zone, settings, run }: { zone: Snapshot['zone']; settings: Snapshot['settings']; run: Run }) {
  const [browse, setBrowse] = useState<{ act: number; areaId: string | null } | null>(null)
  const [query, setQuery] = useState('')
  const results = searchCampaign(query)
  const profile = activeProfile(settings)
  const profileIndex = settings.activeProfile
  const current = describeZone(zone)
  const act = browse?.act ?? current.act
  const areaId = browse ? browse.areaId : current.areaId
  const choices = campaignAreas.filter(area => area.act === act)
  const selected = browse ? choices.find(area => area.id === areaId) : current
  const optional = selected?.optional ?? []

  return <>
    <label className="settings-field field">Search campaign
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Area, boss, or reward"/>
    </label>
    {query.trim() && (results.length > 0 ? <ul className="campaign-results" aria-label="Campaign search results">
      {results.map(area => <li key={area.id}><button type="button" onClick={() => {
        setBrowse({ act: area.act, areaId: area.id })
        setQuery('')
      }}>{area.name} · Act {area.act}{results.some(other => other.id !== area.id && other.name === area.name) && ` (${area.id})`}</button></li>)}
    </ul> : <p className="hint" role="status">No matching areas</p>)}
    <div className="campaign-picker">
      <label>Act
        <select name="campaignAct" value={act ?? ''} onChange={e => setBrowse({ act: Number(e.target.value), areaId: null })}>
          <option value="" disabled>Choose act</option>
          {campaignActs.map(number => <option key={number} value={number}>Act {number}</option>)}
        </select>
      </label>
      <label>Area
        <select name="campaignArea" value={areaId ?? ''} disabled={act === null}
          onChange={e => { if (act !== null) setBrowse({ act, areaId: e.target.value }) }}>
          <option value="" disabled>Choose area</option>
          {choices.map(area => <option key={area.id} value={area.id}>
            {area.name}{choices.some(other => other.id !== area.id && other.name === area.name) ? ` (${area.id})` : ''}
          </option>)}
        </select>
      </label>
    </div>
    {browse && <button type="button" className="campaign-reset" onClick={() => setBrowse(null)}>Use current zone</button>}
    {selected?.objective && <Field label="Story objective"><p>{selected.objective}</p></Field>}
    {optional.length > 0 && <Field label="Optional objectives">
      <ul className="optional-list">{optional.map(objective => {
        const completed = profile?.completed.includes(objective.id) ?? false
        const hint = <><span>{objective.hint}</span>{settings.leagueStart && objective.leagueStart && !completed && <span className="recommended"> · Recommended</span>}</>
        return <li key={objective.id} className={completed ? 'objective-completed' : undefined}>
          {profileIndex !== null && profile ? <label><input type="checkbox" checked={completed} onChange={e => {
            const checked = e.target.checked
            run(() => native.completeObjective(profileIndex, objective.id, checked))
          }}/>{hint}</label> : hint}
        </li>
      })}</ul>
      {!profile && <p className="hint">Choose a character to record completed objectives.</p>}
    </Field>}
    {!selected?.objective && optional.length === 0 && <p className="hint">
      {browse && !areaId ? 'Choose an area to see its objectives.' : 'No objective assigned'}
    </p>}
    {selected?.shortcut && <Field label="Route shortcut"><p>{selected.shortcut.detail}</p></Field>}
    {selected?.tip && <Field label="Encounter tip">
      {!browse && zone?.level != null && <p className="encounter-level">Area level {zone.level}</p>}
      <p>{selected.tip}</p>
    </Field>}
    <CharacterProfile settings={settings} run={run}/>
    <label className="check"><input type="checkbox" name="leagueStartRecommendations" checked={settings.leagueStart}
      onChange={e => { const enabled = e.target.checked; run(() => native.leagueStart(enabled)) }}/>
      League-start recommendations
    </label>
    <p className="hint">Highlight optional objectives with lasting character rewards.</p>
  </>
}

function Position({ saved, run, anchored }: { saved: Placement; run: Run; anchored: boolean }) {
  const [corner, setCorner] = useState(saved.corner)
  const [x, setX] = useState(String(saved.insetX))
  const [y, setY] = useState(String(saved.insetY))
  const [follow, setFollow] = useState(saved.followGame)
  function submit(e: FormEvent) {
    e.preventDefault()
    run(() => native.position({ corner, insetX: Number(x), insetY: Number(y), followGame: follow }))
  }
  const dirty = saved.corner !== corner || saved.insetX !== Number(x) || saved.insetY !== Number(y) || saved.followGame !== follow
  return <form onSubmit={submit}>
    <fieldset className="corner-group"><legend className="eyebrow">Screen corner</legend><div className="corners">
      {corners.map(([id, label]) => <label key={id} className={'choice ' + (corner === id ? 'chosen' : '')}>
        <input type="radio" name="corner" checked={corner === id} onChange={() => setCorner(id)}/>
        <span className={'screen ' + id} aria-hidden="true"><i/></span>{label}
      </label>)}
    </div></fieldset>
    <div className="insets">{([['Horizontal inset', x, setX], ['Vertical inset', y, setY]] as const).map(([name, value, set]) =>
      <label key={name}>{name}<span><input type="number" min="0" max="4096" step="1" required value={value} onChange={e => set(e.target.value)}/> DIP</span></label>)}</div>
    <label className="check"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)}/>Follow the game window</label>
    <p className="hint">Current anchor · {anchored ? 'Game client area' : 'Primary display work area'}</p>
    <p className="hint">Hold Alt and drag the Waymark header to move it. Release the mouse to save.</p>
    <button className="primary" disabled={!dirty}>Save position</button>
  </form>
}

export function Settings({ state }: { state: Snapshot }) {
  const [tab, setTab] = useState<Tab>('Log source')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function run(task: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try { await task() } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  const zone = describeZone(state.zone)
  const replay = state.replaySession !== 0
  return <main className="settings">
    <header className="settings-head"><img src={compass} alt=""/><div><div className="brand">Waymark</div><h1>Settings</h1></div></header>
    <section className="readout" aria-label="Current detection">
      <div className="readout-head"><span className="eyebrow">{state.status === 'replaying' || state.status === 'replayComplete' ? 'Fixture zone' : 'Latest zone'}</span><StatusLight status={state.status}/></div>
      <h2>{zone.title}</h2>{zone.act && <span className="act">Act {zone.act}</span>}
    </section>
    <nav aria-label="Settings sections">{(['Log source', 'Position', 'Objectives', 'Build', 'Diagnostics', 'Updates'] as const).map(t =>
      <button key={t} disabled={busy} aria-current={t === tab ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>)}</nav>
    <fieldset className="pane" disabled={busy} aria-label={tab}>
      {tab === 'Log source' && <>
        <Field label="Client log"><div className="path">{state.settings.logPath || state.activePath || 'Looking for Client.txt…'}</div></Field>
        <p className="hint">{state.settings.logPath ? 'Using your selected file.' : 'Searching Steam libraries and standalone installations.'} Zone detection starts with newly appended lines.</p>
        <div className="actions"><button className="primary" onClick={() => run(native.pick)}>Choose Client.txt…</button>
        {state.settings.logPath && <button onClick={() => run(native.discover)}>Use auto-detection</button>}</div>
      </>}
      {tab === 'Position' &&
        <Position key={JSON.stringify(state.settings.placement)} saved={state.settings.placement} run={run} anchored={state.anchored}/>
      }
      {tab === 'Objectives' && <Objectives zone={state.zone} settings={state.settings} run={run}/>}
      {tab === 'Build' && <Suspense fallback={<p role="status">Loading build guide…</p>}><Build state={state} run={run}/></Suspense>}
      <div hidden={tab !== 'Updates'}><Updates/></div>
      {tab === 'Diagnostics' && <>
        <Field label="Fixture replay"><p>Play a sample log through the zone detector. Live log observation continues in the background.</p></Field>
        <div className="actions"><button className="primary" onClick={() => run(() => native.replay(true))}>{replay ? 'Restart replay' : 'Replay fixture'}</button>
        {replay && <button onClick={() => run(() => native.replay(false))}>Return to live</button>}</div>
        <Field label="Last area ID"><code>{state.zone?.areaId || 'Unavailable'}</code></Field>
      </>}
    </fieldset>
    {(error || state.notices.length > 0 || state.logError || state.windowError) && <div className="issues" role="alert">{[error, ...state.notices, state.logError, state.windowError].filter(Boolean).map((m,i) => <p key={i}>{m}</p>)}</div>}
    <footer className="settings-footer"><button disabled={busy} onClick={() => run(native.toggle)}>{state.visible ? 'Hide overlay' : 'Show overlay'}</button><kbd>Alt + N</kbd><button className="done" onClick={() => run(native.close)}>Done</button></footer>
  </main>
}
