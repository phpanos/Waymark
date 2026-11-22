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

const pageView = ['overlay', 'details', 'rewards', 'town', 'miller', 'guide', 'diagram', 'timer', 'quick-route'].includes(view) ? 'overlay' : 'settings'
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
  async function rewardControlPoint(selector) {
    const point = await waitFor('the visible reward control', () => evaluate(`(() => {
      const bounds = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()
      const height = Math.ceil(document.querySelector('.compact').getBoundingClientRect().height) + 4
      if (!bounds || bounds.bottom > innerHeight || Math.abs(innerHeight - height) > 1) return null
      return [Math.round((bounds.left + bounds.width / 2) * devicePixelRatio),
              Math.round((bounds.top + bounds.height / 2) * devicePixelRatio)]
    })()`))
    console.log('Reward control point ' + point.join(' '))
  }
  if (pageView === 'overlay') {
    await waitFor('live log tracking', () => evaluate('!!document.querySelector(".compact[data-status=watching]")'))
  } else if (view !== 'replay' || argument === 'start') {
    await expectText('Connected')
  }
  if (view === 'settings' || (view === 'overlay' && argument !== '1')) await expectText('Awaiting zone')
  if (view === 'timer' && argument === 'click-point') {
    await rewardControlPoint('[data-reward-target="act-timer"]')
  } else if (view === 'timer') {
    const ready = argument === 'ready-one'
    const running = !ready && argument !== 'stopped-two'
    const act = ready || argument === 'running-one' ? 1 : 2
    if (argument === 'backtracked') await expectText('Clearfell', '.zone-block h1')
    await waitFor(`the act ${act} timer to be ${running ? 'running' : 'stopped'}`, () => evaluate(`(() => {
      const timer = document.querySelector('.act-timer')
      return timer?.getAttribute('aria-label') === 'Act ${act} timer ${running ? 'running' : 'stopped'}' &&
        (timer.querySelector('.act-timer-value').innerText === '00:00:00') === ${ready}
    })()`))
    if (argument === 'running-one') {
      await waitFor('details to stay collapsed after clicking the timer', () =>
        evaluate('!!document.querySelector(".details-gesture[data-expanded=false]")'))
    }
  } else if (view === 'replay') {
    if (argument === 'start') {
      await click('Diagnostics')
      await click('Replay fixture')
      await expectText('Replaying')
    } else {
      await expectText('Replay complete')
      await expectText('Fixture_Unknown_02', '.readout h2')
      await click('Return to live')
      await expectText('Connected')
      await expectText('Vastiri Outskirts', '.readout h2')
    }
  } else if (view === 'timer-settings') {
    await click('Act timer')
    await expectText('Stop timer', '.act-timer-settings button')
    await expectText('Act 1', '.act-timer-history dt')
    if (argument === 'stop') {
      await click('Stop timer')
      await expectText('Start timer', '.act-timer-settings button')
    }
  } else if (view === 'quick-route' && argument === 'story-return') {
    await appendFile(log, 'Generating level 2 area "G1_town"\r\n')
    await expectText('Bring the girdles to Renly for the Runed Spikes', '.story-objective')
    await expectText('The Grelwood', '.route-preview .optional-hint')
    await appendFile(log, 'Generating level 4 area "G1_4"\r\n')
    await expectText('Use the Runed Spikes at the Tree of Souls and free the Hooded One', '.story-objective')
  } else if (view === 'quick-route') {
    await appendFile(log, 'Generating level 5 area "G1_5"\r\n')
    await expectText('Sweep the wall for obelisks. Found one off a short spur? Check the central island.', '.quick-route li:nth-child(1)')
    await expectText('Kill the Rust King. Take the final girdle.', '.quick-route li:nth-child(2)')
    await expectText('Portal to Renly for the Runed Spikes.', '.quick-route li:nth-child(3)')
    await expectText('Waypoint back to the Grelwood tree.', '.quick-route li:nth-child(4)')
    await waitFor('the 16px ordered steps to fit without a duplicate shortcut', () => evaluate(`(() => {
      const panel = document.querySelector('.compact').getBoundingClientRect()
      const steps = document.querySelectorAll('.quick-route li')
      return steps.length === 4 && [...steps].every(step => getComputedStyle(step).fontSize === '16px' &&
        step.scrollWidth <= step.clientWidth && step.getBoundingClientRect().bottom < panel.bottom) &&
        !document.querySelector('.shortcut-preview, .overlay-details') && panel.bottom <= innerHeight - 1
    })()`))
  } else if (view === 'diagram') {
    if (argument === 'collapsed') {
      await expectText('Circle the edge and watch for checkpoints on the minimap.', '.quick-route li:first-child')
      await waitFor('the collapsed details control', () => evaluate('!!document.querySelector(".details-gesture[data-expanded=false]")'))
      await waitFor('the route cue without the diagram at the collapsed window size', () => evaluate(`(() => {
        const height = Math.ceil(document.querySelector('.compact').getBoundingClientRect().height) + 4
        return !document.querySelector('.route-diagram, .direction-diagram') && Math.abs(innerHeight - height) <= 1
      })()`))
    } else {
      await expectText('Sweep the edges for both tomb doors', '.direction .optional-hint')
      await expectText('Clear either tomb first', '.route-diagram figcaption')
      await expectText('Draven · 1 key piece', '.route-diagram li:first-child span')
      await expectText('Asinia · 1 key piece', '.route-diagram li:last-child span')
      await expectText('Bring both key pieces to Lachlann', '.route-diagram-destination span')
      await expectText('Activate the checkpoint at each tomb entrance as you find it. If both are active, use checkpoint travel to reach the other entrance after your first key.', '.zone-shortcut p')
      await waitFor('expanded directions to use 15px text', () => evaluate(`
        getComputedStyle(document.querySelector('.direction-legs li p')).fontSize === '15px'
      `))
      await waitFor('both branches and the destination to fit in the overlay', () => evaluate(`(() => {
        const panel = document.querySelector('.compact').getBoundingClientRect()
        const [left, right, gate] = [...document.querySelectorAll('.route-diagram li, .route-diagram-destination')]
          .map(node => node.getBoundingClientRect())
        return left.right < right.left && left.top === right.top && gate.top > left.bottom && gate.top > right.bottom &&
          [left, right, gate].every(rect => rect.left > panel.left && rect.right < panel.right && rect.bottom < panel.bottom) &&
          panel.bottom <= innerHeight - 1
      })()`))
      if (argument === 'expanded') {
        for (const [area, title, next, waypoint] of [
          ['G1_1', 'The Riverbank', 'Clearfell Encampment', false],
          ['G1_town', 'Clearfell Encampment', 'Clearfell', true],
          ['G1_2', 'Clearfell', 'The Grelwood', true],
          ['G2_town', 'The Ardura Caravan', 'Mastodon Badlands', true],
          ['G3_9', 'The Molten Vault', 'The Drowned City', true],
          ['G4_town', 'Kingsmarch', 'Arastas', true],
        ]) {
          await appendFile(log, `Generating level 40 area "${area}"\r\n`)
          await expectText(title, '.zone-block h1')
          await expectText(next, '.area-diagram-exits li:first-child strong')
          await waitFor('waypoint and area diagram to fit in the overlay', () => evaluate(`(() => {
            const panel = document.querySelector('.compact').getBoundingClientRect()
            const diagram = document.querySelector('.area-diagram')
            return !!diagram.querySelector('.area-diagram-waypoint') === ${waypoint} &&
              diagram.getBoundingClientRect().bottom < panel.bottom && panel.bottom <= innerHeight - 1
          })()`))
          if (area === 'G1_1') {
            await expectText('Follow the path inland', '.direction-diagram [data-motion="forward"] p span')
          } else if (area === 'G1_town') {
            await expectText('Exit to', '.direction-diagram [data-motion="follow"] p span')
            await expectText('Clearfell', '.direction-diagram [data-motion="follow"] strong')
          } else if (area === 'G1_2') {
            await expectText('Search the left edge', '.direction-diagram [data-motion="screen-left"] strong')
            await expectText('Search the right edge', '.direction-diagram [data-motion="screen-right"] strong')
            await waitFor('the Clearfell options to surround the world-map origin', () => evaluate(`(() => {
              const diagram = document.querySelector('.direction-diagram')
              const bounds = selector => diagram.querySelector(selector).getBoundingClientRect()
              const center = bounds('.direction-origin')
              return bounds('[data-motion="screen-left"]').right < center.left &&
                bounds('[data-motion="screen-right"]').left > center.right &&
                bounds('[data-motion="screen-up"]').bottom < center.top
            })()`))
          }
        }
        await appendFile(log, 'Generating level 9 area "G1_7"\r\n')
        await expectText('Clear either tomb first', '.route-diagram figcaption')
        await waitFor('the Cemetery panel to be resized before clicking the header', () => evaluate(`
          document.querySelector('.compact').getBoundingClientRect().bottom <= innerHeight - 1
        `))
      }
    }
  } else if (view === 'guide') {
    if (argument.endsWith('-point')) {
      await rewardControlPoint(`[data-reward-target="guide:${argument.replace('-point', '')}"]:enabled`)
    } else {
      if (argument === 'spires') await appendFile(log, 'Generating level 25 area "G2_9_2"\r\n')
      const titles = {
        previous: 'The Riverbank', next: 'Clearfell Encampment', live: 'Clearfell Encampment',
        spires: 'The Spires of Deshar', caravan: 'The Ardura Caravan',
        dreadnought: "The Dreadnought's Wake", 'live-spires': 'The Spires of Deshar',
      }
      await expectText(titles[argument], '.zone-block h1')
      if (argument === 'caravan') {
        await expectText('Use the Desert Map to reach the Dreadnought', '.story-objective')
        await waitFor('the full caravan instruction to fit', () => evaluate(`(() => {
          const objective = document.querySelector('.story-objective')
          const panel = document.querySelector('.compact')
          return objective.scrollWidth <= objective.clientWidth && panel.getBoundingClientRect().bottom <= innerHeight
        })()`))
      }
      if (argument === 'live' || argument === 'spires' || argument === 'live-spires') {
        await waitFor('live tracking to resume', () => evaluate('!document.querySelector("[data-reward-target=\\"guide:live\\"]")'))
      } else {
        await waitFor('a read-only story preview', () => evaluate(`
          !!document.querySelector('[data-reward-target="guide:live"]') && !document.querySelector('.reward-claim-button')
        `))
      }
    }
  } else if (view === 'miller') {
    if (argument === 'enter') {
      await appendFile(log, 'Generating level 1 area "G1_1"\r\n')
      await expectText('The Riverbank', '.zone-block h1')
      await appendFile(log, 'Generating level 1 area "G1_town"\r\n')
      await expectText('Speak to Renly to claim the Miller reward', '.story-objective')
    } else if (argument === 'claim-point') {
      await rewardControlPoint('.reward-claim-button:enabled')
    } else if (argument === 'undo-point') {
      await rewardControlPoint('.town-reward-actions .reward-undo:enabled')
    } else if (argument === 'claimed') {
      await expectText('Leave the encampment and enter Clearfell', '.story-objective')
      await waitFor('the Miller reward to disappear', () => evaluate('!document.querySelector(".quest-reward")'))
    } else if (argument === 'restored') {
      await expectText('Speak to Renly to claim the Miller reward', '.story-objective')
      await expectText('Level 1 Uncut Skill Gem', '.quest-reward strong')
    }
  } else if (view === 'town') {
    const reward = 'Level 11 Uncut Skill Gem and Reforging Bench'
    const claim = 'Bring the Hammer of Kamasa to Oswald if you recovered it.'
    if (argument === 'source') {
      await appendFile(log, 'Generating level 40 area "G3_9"\r\n')
      await expectText('The Molten Vault', '.zone-block h1')
    } else if (argument === 'claimed' || argument === 'dismissed') {
      await expectText(`${argument === 'claimed' ? 'Claimed' : 'Dismissed'} · ${reward}`, '.town-reward-actions .reward-feedback')
      await waitFor('the handled town reward to disappear', () => evaluate(`
        !document.querySelector('.quest-reward')
      `))
    } else {
      if (argument === 'detour' || argument === 'restart') {
        await appendFile(log, 'Generating level 40 area "G3_8"\r\n')
        await expectText('The Drowned City', '.zone-block h1')
        await waitFor('the pin to stay hidden in the Drowned City', () => evaluate('!document.querySelector(".town-reward-actions")'))
        await appendFile(log, 'Generating level 40 area "G3_town"\r\n')
      }
      await expectText('Work with Alva to open the route below', '.story-objective')
      await expectText('PINNED REWARD', '.quest-reward .optional-label')
      await expectText(reward, '.quest-reward strong')
      await expectText(claim, '.reward-claim')
      await waitFor('the pinned reward to fit without opening the permanent reward list', () => evaluate(`
        document.querySelector('.compact').getBoundingClientRect().bottom <= innerHeight - 1 && !document.querySelector('.reward-list')
      `))
    }
  } else if (view === 'rewards') {
    if (argument === 'opened') {
      await expectText('5 rewards left', '.reward-count')
      await expectText('Cold resistance', '.reward-list li[aria-current] strong')
      await waitFor('reward recap to fit inside the overlay', () => evaluate(`
        document.querySelector('.compact').getBoundingClientRect().bottom <= innerHeight - 1
      `))
    } else if (argument === 'selected') {
      await expectText('5 rewards left', '.reward-count')
      await expectText('Passive points from the Crowbell', '.reward-list li[aria-current] strong')
    } else if (argument === 'completed') {
      await expectText('4 rewards left', '.reward-count')
      await expectText('Marked done · Passive points from the Crowbell', '.reward-feedback')
    } else if (argument === 'checkbox-point' || argument === 'undo-point') {
      const selector = argument === 'checkbox-point' ? '.reward-list li[aria-current] input:enabled' : '.reward-undo:enabled'
      await rewardControlPoint(selector)
    } else {
      await expectText('5 rewards left', '.reward-count')
      await expectText('Restored · Passive points from the Crowbell', '.reward-feedback')
    }
  } else if (view === 'details') {
    await expectText('The Grelwood')
    if (argument === 'expanded' || argument === 'reopened') {
      await expectText('Follow the orange mushrooms after freeing the Hooded One and reporting to Una', '.direction-diagram li:last-child p span')
      await expectText('Defeat the Brambleghast', '.zone-optional ul li')
      const expectDetailsToFit = () => waitFor('all objective details to fit', () => evaluate(`(() => {
        const panel = document.querySelector('.compact')
        const cue = panel?.querySelector('.direction .optional-hint')
        const expectedHeight = Math.ceil(panel.getBoundingClientRect().height) + 4
        return panel?.classList.contains('expanded') && Math.abs(innerHeight - expectedHeight) <= 1 &&
          cue?.scrollWidth <= cue?.clientWidth
      })()`))
      await expectDetailsToFit()
      if (argument === 'expanded') {
        for (const [level, id, cue, detour] of [
          [17, 'G2_2', 'Look for the Six Sisters bridge', 'Yellow paper seals · Optional'],
          [39, 'G3_2_2', 'Step on pads to lower the water', 'Azak Bog entrance · Optional'],
          [46, 'G4_4_1', 'Look for the fork after the third test', 'Silent Hall · Optional'],
        ]) {
          await appendFile(log, `Generating level ${level} area "${id}"\r\n`)
          await expectText(cue, '.direction .optional-hint')
          await expectText(detour, '.overlay-details .route-landmarks li:last-child strong')
          await expectDetailsToFit()
        }
        await appendFile(log, 'Generating level 4 area "G1_4"\r\n')
        await expectText('The Grelwood')
        await expectDetailsToFit()
      }
    } else {
      await waitFor('the collapsed details control', () => evaluate('!!document.querySelector(".details-gesture[data-expanded=false]")'))
      await expectText('Follow glowing roots. Activate the tree waypoint.', '.quick-route li:first-child')
      await expectText('After the Red Vale', '.route-return h2')
      await waitFor('native window to match the compact overlay height', () => evaluate(`(() => {
        const panel = document.querySelector('.compact')
        const expectedHeight = Math.ceil(panel.getBoundingClientRect().height) + 4
        return Math.abs(innerHeight - expectedHeight) <= 1
      })()`))
    }
  } else if (view === 'update') {
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
    await click('Controls')
    await waitFor('the Controls tab to list the timer and permanent rewards hotkeys', () => evaluate(`(() => {
      const text = document.querySelector('.control-guide')?.innerText
      return text?.includes('Alt+Shift+T') && text.includes('Alt+Shift+R')
    })()`))
    await click('Objectives')
    const fill = (selector, value) => evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)})
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await fill('input[type=search]', 'bloated miller')
    await click('The Riverbank · Act 1')
    await expectText('Reach Clearfell')
    await expectText('The Bloated Miller', '.route-landmarks li:last-child strong')
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
          { id: 'Metadata/Items/Gem/SkillGemArchmage', level_interval: [12, 100] },
          { id: 'Metadata/Items/Gem/SkillGemRollingSlam', level_interval: [14, 100] }
        ], passives: [
          { id: 'accuracy1', level_interval: 16 }
        ], inventory_slots: [
          { inventory_id: 'Weapon1', unique_name: 'Smoke weapon', level_interval: [20, 100] }
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
    await click('Preview level 14')
    await expectText('Using level 14 (preview)')
  } else {
    await appendFile(log, 'Generating level 1 area "G1_1"\r\n')
    await expectText('The Riverbank')
    await expectText('Reach Clearfell')
    await expectText('The Bloated Miller', '.overlay-details .route-landmarks li:last-child strong')
    await appendFile(log, '[SCENE] Set Source [Smoke test crossing]\r\n')
    await expectText('Smoke test crossing')
    await appendFile(log, 'Generating level 1 area "G1_town"\r\n')
    await expectText('Clearfell Encampment')
    if (Number(argument) > 1) {
      await expectText('Leave the encampment and enter Clearfell', '.story-objective')
      await waitFor('the Miller reward reminder to stay hidden after restart', () => evaluate('!document.querySelector(".quest-reward")'))
    } else {
      await expectText('Speak to Renly to claim the Miller reward', '.story-objective')
      await expectText('Level 1 Uncut Skill Gem', '.quest-reward strong')
    }
    await waitFor('the quest reward without the permanent reward list', () => evaluate('!document.querySelector(".reward-list")'))
    await appendFile(log, 'Generating level 2 area "G1_2"\r\n')
    await expectText('Find the path into the Grelwood')
    await expectText('Defeat Beira for cold resistance · Recommended', '.zone-optional li')
    await appendFile(log, 'Generating level 1 area "G1_town"\r\n')
    await expectText('Leave the encampment and enter Clearfell', '.story-objective')
    await waitFor('the first-visit reward to stay hidden on a return visit', () => evaluate('!document.querySelector(".quest-reward")'))
    await appendFile(log, 'Generating level 4 area "G1_4"\r\n')
    await expectText('Glowing roots lead to the tree', '.direction .optional-hint')
    await expectText('Follow the orange mushrooms after freeing the Hooded One and reporting to Una', '.direction-diagram li:last-child p span')
    await expectText('SHORTCUT', '.zone-shortcut h2')
    await expectText('Gem · Rolling Slam', '.build-milestone-change')
    await expectText('BUILD LV 14', '.build-milestone-row .optional-label')
    await waitFor('all Grelwood hints fit inside the overlay', () => evaluate(`(() => {
      const card = document.querySelector('.compact').getBoundingClientRect()
      const cue = document.querySelector('.direction .optional-hint')
      const milestone = document.querySelector('.build-milestone')
      return card.bottom <= innerHeight - 1 && milestone?.getBoundingClientRect().bottom <= card.bottom - 1 &&
        cue?.scrollWidth <= cue?.clientWidth
    })()`))
    await appendFile(log, '[INFO Client 42] : OtherCharacter (Warrior) is now level 99.\r\n')
    await expectText('Gem · Rolling Slam', '.build-milestone-change')
    await appendFile(log, '[INFO Client 42] : WaymarkSmoke (Warrior) is now level 14.\r\n')
    await expectText('Passive · Accuracy', '.build-milestone-change')
    await appendFile(log, '[INFO Client 42] : WaymarkSmoke (Warrior) is now level 16.\r\n')
    await expectText('Gear · Smoke weapon', '.build-milestone-change')
    await appendFile(log, '[INFO Client 42] : WaymarkSmoke (Warrior) is now level 20.\r\n')
    await waitFor('the last build milestone to clear', () => evaluate('!document.querySelector(".build-milestone")'))
    await appendFile(log, 'Generating level 39 area "G3_2_2"\r\n')
    await expectText('If you are doing Ignagduk now, take the Azak Bog side exit before leaving. Walk through the pre-drained final stretch and wait for the quest to update before portaling to Alva in the Ziggurat Encampment.', '.zone-shortcut p')
    await appendFile(log, 'Generating level 40 area "G3_7"\r\n')
    await expectText('Level 10 Uncut Spirit Gem from Ignagduk. Bring her Ghastly Spear to Servi in town for a charm.', '.objective-loot')
    for (const [area, name, town, reward, claim] of [
      ['G1_3', 'Mud Burrow', 'G1_town', 'Uncut Support Gem', 'Speak to Renly if you defeated the Devourer.'],
      ['G2_4_3', 'Buried Shrines', 'G2_town', 'Uncut Support Gem', 'Bring the Essence of Water to Zarka.'],
      ['G3_9', 'The Molten Vault', 'G3_town', 'Level 11 Uncut Skill Gem and Reforging Bench', 'Bring the Hammer of Kamasa to Oswald if you recovered it.'],
      ['G4_2_2', "Journey's End", 'G4_town', 'Level 13 Uncut Skill Gem and passive points', 'Talk to Tujen after defeating Omniphobia. If you only have the Verisium, take it to Dannig first.'],
    ]) {
      await appendFile(log, `Generating level 40 area "${area}"\r\n`)
      await expectText(name, '.zone-block h1')
      await appendFile(log, `Generating level 40 area "${town}"\r\n`)
      await expectText(reward, '.quest-reward strong')
      await expectText(claim, '.quest-reward .reward-claim')
      await waitFor(`the ${town} reward and its controls to fit in the overlay`, async () => {
        const { card, claim, button, viewport, recap } = await evaluate(`(() => ({
          card: document.querySelector('.compact').getBoundingClientRect().bottom,
          claim: document.querySelector('.reward-claim').getBoundingClientRect().bottom,
          button: document.querySelector('.reward-claim-button')?.getBoundingClientRect().bottom ?? 0,
          viewport: innerHeight,
          recap: !!document.querySelector('.reward-list')
        }))()`)
        if (Math.max(claim, button) >= card || card > viewport || recap) {
          throw new Error(JSON.stringify({ card, claim, button, viewport, recap }))
        }
        return true
      })
    }
    await rename(log, log + '.' + process.pid + '.old')
    await expectText('File missing')
    await writeFile(log, 'Generating level 9 area "Smoke_Unknown"\r\n')
    await expectText('Smoke_Unknown')
    await expectText('No objective assigned')
  }
} finally {
  socket.close()
}
