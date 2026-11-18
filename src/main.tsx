import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { isTauri } from '@tauri-apps/api/core'
import '@fontsource/cinzel/latin-500.css'
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-600.css'
import './style.css'
import { native } from './native/bridge'
import { useSession } from './state/session'
import { Compact } from './views/Compact'
import { Settings } from './views/Settings'

const settingsView = new URLSearchParams(location.search).get('view') === 'settings'
document.body.className = settingsView ? 'settings-window' : 'overlay-window'

function App() {
  const state = useSession(s => s.current)
  const previousZone = useSession(s => s.previousZone)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isTauri()) { setError('Launch Waymark with the Tauri desktop app.'); return }
    let closed = false
    let stop: (() => void) | undefined
    const accept = useSession.getState().accept
    async function connect() {
      stop = await native.listen(accept)
      if (closed) { stop(); return }
      accept(await native.snapshot())
    }
    connect().catch(e => setError(String(e)))
    return () => { closed = true; stop?.() }
  }, [])
  if (error) return <main className="startup" role="alert">{error}</main>
  if (!state) return null
  return settingsView ? <Settings state={state}/> : <Compact state={state} previousZone={previousZone}/>
}

createRoot(document.getElementById('root')!).render(<App/>)
