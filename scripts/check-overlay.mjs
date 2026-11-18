// Node 24. Read the rendered settings or compact view through the disposable test WebView's loopback endpoint.
import { appendFile, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

const [profile, log, view, installer, version] = process.argv.slice(2)

async function waitFor(description, probe) {
  const deadline = Date.now() + 45_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const result = await probe()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }
  throw new Error(`Timed out waiting for ${description}. ${lastError?.message ?? ''}`)
}

const pageView = view === 'overlay' ? 'overlay' : 'settings'
const target = await waitFor(`local ${view} page`, async () => {
  // The port file may briefly contain the previous process's port after a restart.
  const files = await readdir(profile, { recursive: true })
  const active = files.find(name => path.basename(name) === 'DevToolsActivePort')
  if (!active) return
  const port = Number((await readFile(path.join(profile, active), 'utf8')).split('\n')[0])
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
  const page = pages.find(p => p.type === 'page' && new URL(p.url).hostname === 'tauri.localhost' &&
    (new URL(p.url).searchParams.get('view') ?? 'overlay') === pageView)
  if (!page) throw new Error(`Page URLs: ${pages.map(p => p.url).join(', ')}`)
  return page
})

const socket = new WebSocket(target.webSocketDebuggerUrl)
try {
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('Could not attach to the test webview')), { once: true })
  })
  let sequence = 0
  async function evaluate(expression) {
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.removeEventListener('message', onMessage)
        reject(new Error('WebView2 did not answer the DOM query'))
      }, 3000)
      function onMessage(event) {
        const reply = JSON.parse(event.data)
        if (reply.id !== id) return
        clearTimeout(timeout)
        socket.removeEventListener('message', onMessage)
        if (reply.error || reply.result.exceptionDetails) reject(new Error(JSON.stringify(reply)))
        else resolve(reply.result.result.value)
      }
      socket.addEventListener('message', onMessage)
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
        expression, returnByValue: true
      } }))
    })
  }
  async function expectText(text) {
    await waitFor(text, async () => {
      const body = await evaluate("document.body?.innerText ?? ''")
      if (!body.split(/\r?\n/).some(line => line.trim() === text)) {
        throw new Error(`Last rendered text: ${JSON.stringify(body)}`)
      }
      return true
    })
    console.log(`Overlay displayed '${text}'`)
  }
  const click = label => evaluate(`Array.from(document.querySelectorAll('button'))
    .find(button => !button.disabled && !button.closest('[hidden]') && button.textContent.trim() === ${JSON.stringify(label)})?.click()`)
  await expectText('Connected')
  await expectText('Awaiting zone')
  if (view === 'update') {
    const exe = await readFile(installer)
    const signature = (await readFile(installer + '.sig', 'utf8')).trim()
    const manifest = JSON.stringify({
      version,
      platforms: { 'windows-x86_64': { url: 'http://127.0.0.1:44891/installer.exe', signature } },
    })
    const server = createServer((request, response) => {
      if (request.url === '/latest.json') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(manifest)
      } else if (request.url === '/installer.exe') {
        response.writeHead(200, { 'Content-Length': exe.length }).end(exe)
      } else {
        response.writeHead(404).end()
      }
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(44891, '127.0.0.1', resolve)
    })
    try {
      await click('Updates')
      await expectText('Check for updates')
      await click('Check for updates')
      await expectText(`Waymark ${version} is available.`)
      const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }))
      await click('Install and restart')
      // The updater exits the host process after it launches the checked installer.
      const exited = await Promise.race([closed.then(() => true), delay(90_000, false, { ref: false })])
      if (!exited) throw new Error(`Waymark did not exit after installation. ${await evaluate('document.body.innerText')}`)
    } finally {
      server.closeAllConnections()
      server.close()
    }
  } else if (view === 'settings') {
    await expectText('Settings')
    await click('Position')
    await expectText('Move overlay')
    await click('Move overlay')
    await expectText('Confirm position')
  } else if (view === 'cancel-move') {
    await click('Cancel')
    await expectText('Move overlay')
  } else {
    await appendFile(log, 'Generating level 1 area "G1_1"\r\n')
    await expectText('The Riverbank')
    await appendFile(log, '[SCENE] Set Source [Smoke test crossing]\r\n')
    await expectText('Smoke test crossing')
    await rename(log, log + '.' + process.pid + '.old')
    await expectText('File missing')
    await writeFile(log, 'Generating level 9 area "Smoke_Unknown"\r\n')
    await expectText('Smoke_Unknown')
  }
} finally {
  socket.close()
}
