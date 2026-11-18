import { useEffect, useRef, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { check, type Update } from '@tauri-apps/plugin-updater'

const enabled = import.meta.env.VITE_WAYMARK_UPDATES === '1'

export function Updates() {
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<Update | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)
  const pending = useRef<Update | null>(null)

  useEffect(() => {
    mounted.current = true
    void getVersion().then(setVersion).catch(() => {})
    return () => {
      mounted.current = false
      if (pending.current) void pending.current.close().catch(() => {})
    }
  }, [])

  async function checkForUpdates() {
    setBusy(true)
    setStatus('Checking for updates…')
    try {
      const available = await check({ timeout: 15_000 })
      if (!mounted.current) {
        await available?.close()
        return
      }
      pending.current = available
      setUpdate(available)
      setStatus(available ? `Waymark ${available.version} is available.` : 'Waymark is up to date.')
    } catch {
      setStatus('Could not check for updates. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function installUpdate(available: Update) {
    // Keep the resource alive if the settings tab changes during installation.
    pending.current = null
    setBusy(true)
    setStatus('Downloading update…')
    try {
      let downloaded = 0
      let total: number | undefined
      await available.downloadAndInstall(event => {
        if (event.event === 'Started') total = event.data.contentLength
        if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          if (total) setStatus(`Downloading update… ${Math.min(100, Math.floor(downloaded / total * 100))}%`)
        }
        if (event.event === 'Finished') setStatus('Verifying update and starting the installer…')
      }, { timeout: 120_000 })
    } catch {
      setUpdate(null)
      setStatus('Could not install the update. Check for updates to try again.')
    } finally {
      await available.close().catch(() => {})
      setBusy(false)
    }
  }

  return <>
    {version && <p className="hint">Installed version {version}</p>}
    {enabled ? <>
      <p className="hint" role="status">{status}</p>
      <div className="actions">
        {update
          ? <button className="primary" disabled={busy} onClick={() => void installUpdate(update)}>Install and restart</button>
          : <button className="primary" disabled={busy} onClick={() => void checkForUpdates()}>Check for updates</button>}
      </div>
    </> : <p className="hint">In-app updates are available in signed Waymark releases.</p>}
  </>
}
