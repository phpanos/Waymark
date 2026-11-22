import type { GemCut } from '../state/gem-priority'

export function GemPriority({ gem, support, onCut, overlay = false }: {
  gem?: GemCut
  support?: GemCut
  onCut: (id: string) => void
  overlay?: boolean
}) {
  return <section className="gem-priority" aria-label="Gem priority" aria-live="polite">
    {!gem && !support && <p>Gem priority complete for this stage.</p>}
    {[gem, support].map((cut, index) => cut && <div className="gem-priority-row" key={cut.id}>
      <div>
        <span className="optional-label">{index === 0 ? 'Next gem' : 'Next support'}</span>
        <p><strong>{cut.name}</strong>{cut.skill && <span> for {cut.skill}</span>}</p>
      </div>
      <button type="button" className="gem-cut-button" data-reward-target={overlay ? `build:cut:${cut.id}` : undefined}
        aria-label={`Mark ${cut.name}${cut.skill ? ` for ${cut.skill}` : ''} cut`}
        onClick={() => onCut(cut.id)}>Mark cut</button>
    </div>)}
  </section>
}
