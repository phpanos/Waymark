// Node 24. Read the rendered settings or compact view through the disposable test WebView's loopback endpoint.
import { appendFile, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

const [profile, log, view, argument, version] = process.argv.slice(2)

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
  async function expectText(text, selector = 'body') {
    await waitFor(text, async () => {
      const body = await evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`)
      if (!body.split(/\r?\n/).some(line => line.trim() === text)) {
        throw new Error(`Last rendered text: ${JSON.stringify(body)}`)
      }
      return true
    })
    console.log(`Overlay displayed '${text}'`)
  }
  const click = label => waitFor(`enabled ${label} button`, () => evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(button => !button.matches(':disabled') && !button.closest('[hidden]') && button.textContent.trim() === ${JSON.stringify(label)})
    if (!button) return false
    button.click()
    return true
  })()`))
  await expectText('Connected')
  await expectText('Awaiting zone')
  if (view === 'update') {
    const installer = argument
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
    await click('Objectives')
    await expectText('League-start recommendations')
    const select = (name, value) => waitFor(`${name} option ${value}`, () => evaluate(`(() => {
      const picker = document.querySelector(${JSON.stringify(`select[name=${name}]`)})
      const value = ${JSON.stringify(value)}
      if (!picker || picker.disabled || !Array.from(picker.options).some(option => option.value === value)) return false
      picker.value = value
      picker.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`))
    await select('campaignAct', '2')
    await select('campaignArea', 'G2_13')
    await expectText('Finish the Sekhemas trial for Ascendancy', '.optional-list li span:first-of-type')
    await expectText('For a first run, aim for character level 26–30. Equip relics with Honour resistance when available.')
    await select('campaignAct', '1')
    await expectText('Choose an area to see its objectives.')
    await select('campaignArea', 'G1_2')
    await expectText('Find the path into the Grelwood')
    await expectText('Defeat Beira for cold resistance', '.optional-list li span:first-of-type')
    await select('campaignArea', 'G1_5')
    await expectText('ROUTE SHORTCUT')
    await expectText('After defeating the Rust King and collecting all three obelisk quest items, open a portal to town. Get the Runed Spikes from Renly, then use the Grelwood waypoint to return to the Tree of Souls.')
    await click('Use current zone')
    await expectText('No objective assigned')
    const recommendationToggle = 'document.querySelector("[name=leagueStartRecommendations]")'
    const firstLaunch = argument === '1'
    const enabled = await evaluate(`${recommendationToggle}?.checked`)
    if (enabled !== !firstLaunch) throw new Error('Unexpected saved league-start preference')
    if (firstLaunch) await evaluate(`${recommendationToggle}.click()`)
    await click('Position')
    await expectText('Hold Alt and drag the Waymark header to move it. Release the mouse to save.')
    await click('Objectives')
    const fill = (selector, value) => evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)})
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await fill('input[type=search]', 'bloated miller')
    await click('The Riverbank · Act 1')
    await expectText('Reach Clearfell')
    if (firstLaunch) {
      await fill('input[name=character]', 'WaymarkSmoke')
      await fill('input[name=league]', 'Smoke league')
      await click('Use character')
    }
    await waitFor('saved campaign profile', () => evaluate('document.querySelector("select[name=activeProfile]")?.value === "0"'))
    await select('campaignArea', 'G1_3')
    const devourer = 'document.querySelector(".optional-list input[type=checkbox]")'
    await waitFor('saved optional objective', () => evaluate(`${devourer}?.checked === ${!firstLaunch}`))
    if (firstLaunch) {
      await evaluate(`${devourer}.click()`)
      await waitFor('completed objective', () => evaluate('!!document.querySelector(".objective-completed")'))
    }
    await click('Build')
    await expectText('Import build files')
    if (firstLaunch) {
      await evaluate(`(() => {
        const picker = document.querySelector('input[type=file]')
        const transfer = new DataTransfer()
        const build = { name: 'Smoke leveling build', skills: [
          'Metadata/Items/Gem/SkillGemEarthquake',
          { id: 'Metadata/Items/Gem/SkillGemArchmage', level_interval: [12, 100] }
        ] }
        transfer.items.add(new File([JSON.stringify(build)], 'smoke.build'))
        picker.files = transfer.files
        picker.dispatchEvent(new Event('change', { bubbles: true }))
      })()`)
    }
    await expectText('Smoke leveling build', '.build-guide h2')
    await expectText('Using level 1 (manual)')
    await appendFile(log, '[INFO Client 42] : WaymarkSmoke (Warrior) is now level 12.\r\n')
    await expectText('Using level 12 (Client.txt)')
    await expectText('Archmage', '.build-guide li:last-child strong')
  } else {
    await appendFile(log, 'Generating level 1 area "G1_1"\r\n')
    await expectText('The Riverbank')
    await expectText('Reach Clearfell')
    await appendFile(log, '[SCENE] Set Source [Smoke test crossing]\r\n')
    await expectText('Smoke test crossing')
    await appendFile(log, 'Generating level 2 area "G1_2"\r\n')
    await expectText('Find the path into the Grelwood')
    await expectText('Defeat Beira for cold resistance', '.optional-hint')
    await expectText('Recommended', '.optional-preview .recommended')
    await appendFile(log, 'Generating level 39 area "G3_2_2"\r\n')
    await expectText('Open a portal by the final lever', '.route-preview .optional-hint')
    await rename(log, log + '.' + process.pid + '.old')
    await expectText('File missing')
    await writeFile(log, 'Generating level 9 area "Smoke_Unknown"\r\n')
    await expectText('Smoke_Unknown')
    await expectText('No objective assigned')
  }
} finally {
  socket.close()
}
