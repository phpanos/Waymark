import type { DirectionGuide, Motion } from '../data/directions'

const arrows: Record<Motion, string> = {
  forward: '↑', follow: '↝', across: '↑', back: '↶', inward: '⊙', loop: '◯', 'left-wall': '↰', 'right-wall': '↱',
  'screen-up': '↑', 'screen-left': '←', 'screen-right': '→', 'screen-upper-right': '↗',
}

export function DirectionDiagram({ guide }: { guide: DirectionGuide }) {
  const Legs = guide.layout ? 'ul' : 'ol'
  return <figure className="direction-diagram" aria-label="Directions diagram" data-layout={guide.layout ?? 'path'}>
    <figcaption>Directions</figcaption>
    <p className="direction-origin">{guide.origin}</p>
    <Legs className="direction-legs" role="list">
      {guide.legs.map(([motion, instruction, destination]) => <li key={instruction} data-motion={motion}>
        <span className="direction-arrow" aria-hidden="true">{arrows[motion]}</span>
        <p>{guide.layout === 'worldMap'
          ? <><strong>{destination}</strong>{' '}<span>{instruction}</span></>
          : <><span>{instruction}</span>{' '}<strong>{destination}</strong></>}</p>
      </li>)}
    </Legs>
  </figure>
}
