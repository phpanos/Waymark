// Node 24. Read the rendered compact view through the disposable test WebView's loopback endpoint.
import { appendFile, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const [profile, log] = process.argv.slice(2)

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

const port = await waitFor('WebView2 debugging port', async () => {
  const files = await readdir(profile, { recursive: true })
  const active = files.find(name => path.basename(name) === 'DevToolsActivePort')
  if (!active) return
  return Number((await readFile(path.join(profile, active), 'utf8')).split('\n')[0])
})

const target = await waitFor('local compact page', async () => {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
  const page = pages.find(p => p.type === 'page' && new URL(p.url).hostname === 'tauri.localhost' &&
    !new URL(p.url).searchParams.has('view'))
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
  async function renderedText() {
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
        expression: "document.body?.innerText ?? ''", returnByValue: true
      } }))
    })
  }
  async function expectText(text) {
    await waitFor(text, async () => {
      const body = await renderedText()
      if (!body.split(/\r?\n/).some(line => line.trim() === text)) {
        throw new Error(`Last rendered text: ${JSON.stringify(body)}`)
      }
      return true
    })
    console.log(`Overlay displayed '${text}'`)
  }
  await expectText('Connected')
  await expectText('Awaiting zone')
  await appendFile(log, 'Generating level 1 area "G1_1"\r\n')
  await expectText('The Riverbank')
  await appendFile(log, '[SCENE] Set Source [Smoke test crossing]\r\n')
  await expectText('Smoke test crossing')
  await rename(log, log + '.old')
  await expectText('File missing')
  await writeFile(log, 'Generating level 9 area "Smoke_Unknown"\r\n')
  await expectText('Smoke_Unknown')
} finally {
  socket.close()
}
