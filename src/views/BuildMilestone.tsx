import labels from '../data/build-labels.json'
import { buildLabel } from '../state/build-label'
import type { BuildChange, BuildMilestone } from '../state/build'

function describe(change: BuildChange) {
  switch (change.kind) {
    case 'gem':
      return `Gem · ${buildLabel(change.id, labels.gems)}`
    case 'support':
      return `Support · ${buildLabel(change.id, labels.gems)} for ${buildLabel(change.skillId, labels.gems)}`
    case 'passive': {
      const { id, weaponSet } = change.passive
      const name = buildLabel(id, labels.passives)
      return weaponSet ? `Passive · ${name} (set ${weaponSet})` : `Passive · ${name}`
    }
    case 'gear': {
      const { name, slot, note } = change.item
      const detail = note.split(/\r?\n/, 1)[0].trim()
      const short = detail.length > 72 ? `${detail.slice(0, 71).trimEnd()}…` : detail
      return `Gear · ${name || [buildLabel(slot), short].filter(Boolean).join(' — ')}`
    }
  }
}

export default function BuildMilestoneRow({ milestone, expanded }: { milestone: BuildMilestone; expanded: boolean }) {
  const visible = expanded ? milestone.changes.slice(0, 3) : milestone.changes.slice(0, 1)
  const extra = milestone.changes.length - visible.length
  return <section className="build-milestone" aria-live="polite" aria-label={`Next build milestone at level ${milestone.level}`}>
    <div className="build-milestone-row">
      <span className="optional-label">Build Lv {milestone.level}</span>
      <span className="build-milestone-change">{describe(visible[0])}</span>
      {!expanded && extra > 0 && <span>+{extra}</span>}
    </div>
    {expanded && (visible.length > 1 || extra > 0) && <ul className="build-milestone-more">
      {visible.slice(1).map((change, index) => <li key={index}>{describe(change)}</li>)}
      {!!extra && <li>+{extra} more in Build settings</li>}
    </ul>}
  </section>
}
