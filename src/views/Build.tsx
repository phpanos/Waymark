import { useMemo, useState, type ChangeEvent } from 'react'
import labels from '../data/build-labels.json'
import type { Snapshot } from '../native/contract'
import { guidanceAtLevel, maximumBuildBytes, parseBuild } from '../state/build'
import { activeProfile } from '../state/presentation'
import { CharacterProfile } from './CharacterProfile'

type Stage = { filename: string; source: string }
type Level = { manual: number; useLog: boolean }
type Saved = { stages: Stage[]; active: string; levels: Record<string, Level> }
const storageKey = 'waymark.build.v1'
const defaultLevel: Level = { manual: 1, useLog: true }
const empty: Saved = { stages: [], active: '', levels: {} }

function load(): Saved {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return empty
    const saved = JSON.parse(stored) as Saved
    return Array.isArray(saved.stages) && saved.levels && typeof saved.active === 'string' ? saved : empty
  } catch {
    return empty
  }
}

function label(id: string, entries: Record<string, string>) {
  if (Object.hasOwn(entries, id)) return entries[id]
  const canonical = id.replace('/Items/Gems/', '/Items/Gem/')
  if (Object.hasOwn(entries, canonical)) return entries[canonical]
  const key = id.split('/').pop() ?? id
  return key.replace(/^(?:SkillGem|SupportGem)/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2')
}

function Note({ text }: { text: string }) {
  return text && <span className="build-note">{text}</span>
}

export default function Build({ state, run }: {
  state: Snapshot
  run: (task: () => Promise<void>) => void
}) {
  const [saved, setSaved] = useState(load)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const profile = activeProfile(state.settings)
  const profileKey = JSON.stringify(profile ? [profile.character, profile.league] : [])
  const level = saved.levels[profileKey] ?? defaultLevel
  const logged = profile && level.useLog ? state.characterLevel : null
  const [preview, setPreview] = useState<{ scope: string; level: number } | null>(null)
  const scope = JSON.stringify([profileKey, saved.active])
  const previewLevel = preview?.scope === scope ? preview.level : null
  const effective = previewLevel ?? logged ?? level.manual
  const stage = saved.stages.find(item => item.filename === saved.active)
  const guide = useMemo(() => {
    if (!stage) return null
    try { return parseBuild(stage.source) } catch { return null }
  }, [stage])
  const readError = stage && !guide ? 'Import this build file again to open it.' : ''
  const guidance = guide && guidanceAtLevel(guide, effective)
  const nextLevel = guidance?.nextLevel ?? null

  function save(next: Saved) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
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
      const stages = new Map(saved.stages.map(item => [item.filename, item]))
      for (const item of imported) stages.set(item.filename, item)
      save({ ...saved, stages: [...stages.values()], active: imported[0].filename })
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function setLevel(next: Level) {
    setPreview(null)
    save({ ...saved, levels: { ...saved.levels, [profileKey]: next } })
  }

  return <>
    <label className="settings-field field">Import build files
      <input type="file" accept=".build" multiple disabled={importing} onChange={importFiles}/>
    </label>
    <p className="hint">Choose a .build export from Path of Building or Mobalytics. Import multiple files to switch between stages.</p>
    {saved.stages.length > 0 && <div className="build-controls field">
      <label className="settings-field">Build file
        <select value={saved.active} disabled={importing} onChange={e => save({ ...saved, active: e.target.value })}>
          {saved.stages.map(item => <option key={item.filename}>{item.filename}</option>)}
        </select>
      </label>
      <button type="button" disabled={importing} onClick={() => {
        const stages = saved.stages.filter(item => item.filename !== saved.active)
        save({ ...saved, stages, active: stages[0]?.filename ?? '' })
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
    {guide && guidance && <article className="build-guide">
      <h2>{guide.name}</h2>
      {(guide.author || guide.ascendancy) && <p className="hint">{[guide.ascendancy, guide.author && `by ${guide.author}`].filter(Boolean).join(' · ')}</p>}
      <Note text={guide.description}/>
      {nextLevel !== null && <button type="button" onClick={() => setPreview({ scope, level: nextLevel })}>Preview level {nextLevel}</button>}
      {previewLevel !== null && <button type="button" onClick={() => setPreview(null)}>Use character level</button>}
      {!guidance.skills.length && !guidance.gear.length && !guidance.passives.length && <p className="hint">No entries at level {effective}.</p>}
      {guidance.skills.length > 0 && <section aria-label="Skills"><h3>Skills and supports</h3>
        <ul>{guidance.skills.map(({ id, note, supports }, index) => <li key={index}>
          <strong>{label(id, labels.gems)}</strong>
          <Note text={note}/>
          {supports.length > 0 && <ul>{supports.map((support, supportIndex) => <li key={supportIndex}>
            {label(support.id, labels.gems)}<Note text={support.note}/>
          </li>)}</ul>}
        </li>)}</ul>
      </section>}
      {guidance.gear.length > 0 && <section aria-label="Gear"><h3>Gear</h3>
        <ul>{guidance.gear.map(({ slot, name, note }, index) => <li key={index}>
          {label(slot, {})}{name && ` · ${name}`}<Note text={note}/>
        </li>)}</ul>
      </section>}
      {guidance.passives.length > 0 && <details><summary>Passives ({guidance.passives.length})</summary>
        <ul>{guidance.passives.map(({ id, note, weaponSet }, index) => <li key={index}>
          {label(id, labels.passives)}{weaponSet && ` · Weapon set ${weaponSet}`}<Note text={note}/>
        </li>)}</ul>
      </details>}
    </article>}
  </>
}
