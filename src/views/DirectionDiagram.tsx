import type { DirectionGuide, Motion } from '../data/directions'

const arrows: Record<Motion, string> = {
  forward: '↑', follow: '↝', across: '↑', back: '↶', inward: '⊙', loop: '◯', 'left-wall': '↰', 'right-wall': '↱',
  'screen-up': '↑', 'screen-left': '←', 'screen-right': '→', 'screen-upper-right': '↗',
}

export function DirectionDiagram({ guide }: { guide: DirectionGuide }) {
  return <figure className="direction-diagram" aria-label="Directions diagram" data-layout={guide.layout ?? 'path'}>
    <figcaption>Directions</figcaption>
    <p className="direction-origin">{guide.origin}</p>
    <ul className="direction-legs" role="list">
      {guide.legs.map(([motion, instruction, destination]) => <li key={instruction} data-motion={motion}>
        <span className="direction-arrow" aria-hidden="true">{arrows[motion]}</span>
        <p><strong>{destination}</strong>{' '}<span>{instruction}</span></p>
      </li>)}
    </ul>
  </figure>
}
