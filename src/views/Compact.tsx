import { useEffect, useState } from 'react'
import compass from '../assets/compass.png'
import { native } from '../native/bridge'
import type { Snapshot, Status } from '../native/contract'
import { describeZone, statusText } from '../state/presentation'

export function StatusLight({ status }: { status: Status }) {
  return <span className={'status ' + status}><i aria-hidden="true" />{statusText[status]}</span>
}

export function Compact({ state }: { state: Snapshot }) {
  const [dragError, setDragError] = useState('')
  useEffect(() => {
    if (!state.moving) setDragError('')
  }, [state.moving])
  const zone = describeZone(state.zone)
  const context = state.zone && (state.status === 'missing' || state.status === 'readError') ? 'Last zone' : 'Current zone'
  return <main className="compact">
    {state.moving ? <div className="move-handle" onMouseDown={event => {
      if (event.button === 0) {
        event.preventDefault()
        setDragError('')
        void native.dragOverlay().catch(error => setDragError(String(error)))
      }
    }}>Drag Waymark here</div> :
    <header className="compact-head"><span className="brand"><img src={compass} alt=""/>Waymark</span><StatusLight status={state.status}/></header>
    }
    {dragError && state.moving && <p role="alert">{dragError}</p>}
    <div className="zone-block">
      <div className="eyebrow">{context}{zone.act && <span className="act">Act {zone.act}</span>}</div>
      <h1 title={zone.title}>{zone.title}</h1>
    </div>
    <footer className="objective"><span className="objective-mark" aria-hidden="true">◇</span><div><div className="eyebrow">Next objective</div><p>No objective assigned</p></div></footer>
  </main>
}
