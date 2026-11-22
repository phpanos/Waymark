import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import labels from '../data/build-labels.json'
import { native } from '../native/bridge'
import type { Snapshot } from '../native/contract'
import { guidanceAtLevel, maximumBuildBytes, parseBuild } from '../state/build'
import { buildLabel } from '../state/build-label'
import { buildGemPriority, buildLevel, buildStorageKey, loadBuilds, markGemCut, saveBuilds, type BuildLevel, type SavedBuilds } from '../state/build-storage'
import { mobalyticsUrl, parseGemGuide } from '../state/gem-priority'
import { CharacterProfile } from './CharacterProfile'
import { GemPriority } from './GemPriority'

function Note({ text }: { text: string }) {
  return text && <span className="build-note">{text}</span>
}

export default function Build({ state, run }: {
  state: Snapshot
  run: (task: () => Promise<void>) => void
}) {
  const [saved, setSaved] = useState(loadBuilds)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [guideUrl, setGuideUrl] = useState('')
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === buildStorageKey || event.key === null) setSaved(loadBuilds())
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])
  const { profile, profileKey, preferences: level, logged, effective: characterLevel } = buildLevel(state, saved)
  const [preview, setPreview] = useState<{ scope: string; level: number } | null>(null)
  const scope = JSON.stringify([profileKey, saved.active])
  const previewLevel = preview?.scope === scope ? preview.level : null
  const effective = previewLevel ?? characterLevel
  const stage = saved.stages.find(item => item.filename === saved.active)
  const guide = useMemo(() => {
    if (!stage || stage.gemGuide) return null
    try { return parseBuild(stage.source) } catch { return null }
  }, [stage])
  const readError = stage && !guide && !stage.gemGuide ? 'Import this build file again to open it.' : ''
  const priority = buildGemPriority(state, saved)
  const guidance = guide && guidanceAtLevel(guide, effective)
  const nextLevel = guidance?.nextLevel ?? null

  function save(next: SavedBuilds) {
    try {
      saveBuilds(next)
      setSaved(next)
      setError('')
    } catch {
      setError('Waymark could not save this change. Remove an old build and try again.')
    }
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setImporting(true)
    try {
      const imported = await Promise.all(files.map(async file => {
        if (!file.name.toLowerCase().endsWith('.build')) throw new Error(`${file.name}: Choose a .build export.`)
        if (file.size > maximumBuildBytes) throw new Error(`${file.name}: The file exceeds 512 KB.`)
        try {
          const source = await file.text()
          parseBuild(source)
          return { filename: file.name, source }
        } catch (cause) {
          const detail = cause instanceof SyntaxError ? 'The export is not valid JSON.' : (cause as Error).message
          throw new Error(`${file.name}: ${detail}`)
        }
      }))
      const current = loadBuilds()
      const stages = new Map(current.stages.map(item => [item.filename, item]))
      for (const item of imported) stages.set(item.filename, item)
      save({ ...current, stages: [...stages.values()], active: imported[0].filename })
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setImporting(false)
    }
  }

  async function importGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setImporting(true)
    setError('')
    try {
      const url = mobalyticsUrl(guideUrl)
      const gemGuide = parseGemGuide(await native.importMobalyticsGuide(url))
      if (!gemGuide) throw new Error('This guide does not contain an importable gem list.')
      const current = loadBuilds()
      const stages = new Map(current.stages.map(item => [item.filename, item]))
      stages.set(url, { filename: url, source: '', gemGuide })
      save({ ...current, stages: [...stages.values()], active: url })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImporting(false)
    }
  }

  function setLevel(next: BuildLevel) {
    setPreview(null)
    const current = loadBuilds()
    save({ ...current, levels: { ...current.levels, [profileKey]: next } })
  }

  return <>
    <form className="field build-controls" onSubmit={event => void importGuide(event)}>
      <label className="settings-field">Mobalytics build link
        <input type="url" value={guideUrl} onChange={event => setGuideUrl(event.target.value)} disabled={importing}
          placeholder="https://mobalytics.gg/poe-2/…" required/>
      </label>
      <button type="submit" disabled={importing}>{importing ? 'Importing…' : 'Import guide'}</button>
    </form>
    <label className="settings-field field">Import build files
      <input type="file" accept=".build" multiple disabled={importing} onChange={importFiles}/>
    </label>
    <p className="hint">Choose a .build export from Path of Building or Mobalytics. Import multiple files to switch between stages.</p>
    {saved.stages.length > 0 && <div className="build-controls field">
      <label className="settings-field">Build file
        <select value={saved.active} disabled={importing} onChange={e => save({ ...loadBuilds(), active: e.target.value })}>
          {saved.stages.map(item => <option key={item.filename} value={item.filename}>{item.gemGuide?.name ?? item.filename}</option>)}
        </select>
      </label>
      <button type="button" disabled={importing} onClick={() => {
        const current = loadBuilds()
        const stages = current.stages.filter(item => item.filename !== current.active)
        save({ ...current, stages, active: stages[0]?.filename ?? '' })
      }}>Remove build</button>
    </div>}
    {(error || readError) && <p className="issues" role="alert">{error || readError}</p>}
    <CharacterProfile settings={state.settings} run={run}/>
    <label className="check">
      <input type="checkbox" checked={level.useLog} disabled={!profile || importing}
        onChange={e => setLevel({ ...level, useLog: e.target.checked })}/>
      Use character level from Client.txt
    </label>
    <div className="build-controls field">
      <label className="settings-field">Manual level
        <input type="number" min="1" max="100" step="1" value={level.manual} disabled={importing}
          onChange={e => {
            const manual = e.target.valueAsNumber
            if (Number.isInteger(manual) && manual >= 1 && manual <= 100) setLevel({ ...level, manual })
          }}/>
      </label>
      <p className="hint">Using level {effective} ({previewLevel !== null ? 'preview' : logged === null ? 'manual' : 'Client.txt'})</p>
    </div>
    {stage?.gemGuide && priority && <div className="field build-controls">
      <label className="settings-field">Gem variant
        <select value={stage.gemVariant ?? ''} onChange={event => {
          const index = event.target.value === '' ? undefined : Number(event.target.value)
          const current = loadBuilds()
          save({ ...current, stages: current.stages.map(item =>
            item.filename === stage.filename ? { ...item, gemVariant: index } : item) })
        }}>
          <option value="">Automatic by level</option>
          {stage.gemGuide.variants.map((variant, index) => <option key={index} value={index}>{variant.label}</option>)}
        </select>
      </label>
      <p className="hint">Using {priority.variant.label}</p>
      <GemPriority gem={priority.gems[0]} support={priority.supports[0]} onCut={id => {
        try { setSaved(markGemCut(state, priority.scope, id)) }
        catch { setError('Waymark could not save gem progress.') }
      }}/>
      {priority.cut.length > 0 && <button type="button" onClick={() => {
        const current = loadBuilds()
        const latest = buildGemPriority(state, current)
        if (latest?.scope === priority.scope) {
          save({ ...current, gemCuts: { ...current.gemCuts, [latest.scope]: latest.cut.slice(0, -1) } })
        }
      }}>Undo last cut</button>}
    </div>}
    {guide && guidance && <article className="build-guide">
      <h2>{guide.name}</h2>
      {(guide.author || guide.ascendancy) && <p className="hint">{[guide.ascendancy, guide.author && `by ${guide.author}`].filter(Boolean).join(' · ')}</p>}
      <Note text={guide.description}/>
      {nextLevel !== null && <button type="button" onClick={() => setPreview({ scope, level: nextLevel })}>Preview level {nextLevel}</button>}
      {previewLevel !== null && <button type="button" onClick={() => setPreview(null)}>Use character level</button>}
      {!guidance.skills.length && !guidance.gear.length && !guidance.passives.length && <p className="hint">No entries at level {effective}.</p>}
      {guidance.skills.length > 0 && <section aria-label="Skills"><h3>Skills and supports</h3>
        <ul>{guidance.skills.map(({ id, note, supports }, index) => <li key={index}>
          <strong>{buildLabel(id, labels.gems)}</strong>
          <Note text={note}/>
          {supports.length > 0 && <ul>{supports.map((support, supportIndex) => <li key={supportIndex}>
            {buildLabel(support.id, labels.gems)}<Note text={support.note}/>
          </li>)}</ul>}
        </li>)}</ul>
      </section>}
      {guidance.gear.length > 0 && <section aria-label="Gear"><h3>Gear</h3>
        <ul>{guidance.gear.map(({ slot, name, note }, index) => <li key={index}>
          {buildLabel(slot)}{name && ` · ${name}`}<Note text={note}/>
        </li>)}</ul>
      </section>}
      {guidance.passives.length > 0 && <details><summary>Passives ({guidance.passives.length})</summary>
        <ul>{guidance.passives.map(({ id, note, weaponSet }, index) => <li key={index}>
          {buildLabel(id, labels.passives)}{weaponSet && ` · Weapon set ${weaponSet}`}<Note text={note}/>
        </li>)}</ul>
      </details>}
    </article>}
  </>
}
