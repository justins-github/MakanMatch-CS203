import test from 'node:test'
import assert from 'node:assert/strict'
import { startKeepWarm } from './keepWarm.js'

// A page that is on screen or not, and can be switched.
function fakePage(visibilityState = 'visible') {
  const listeners = new Set()
  return {
    visibilityState,
    addEventListener: (type, fn) => type === 'visibilitychange' && listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    show() {
      this.visibilityState = 'visible'
      listeners.forEach((fn) => fn())
    },
    hide() {
      this.visibilityState = 'hidden'
      listeners.forEach((fn) => fn())
    },
  }
}

function counting() {
  const ping = () => ping.count++
  ping.count = 0
  return ping
}

test('pings straight away, then again every interval while the page is on screen', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const ping = counting()
  startKeepWarm({ ping, doc: fakePage(), everyMs: 1000 })
  assert.equal(ping.count, 1)
  t.mock.timers.tick(3000)
  assert.equal(ping.count, 4)
})

test('a hidden page stops pinging, and pings again the moment it is shown', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const ping = counting()
  const page = fakePage()
  startKeepWarm({ ping, doc: page, everyMs: 1000 })
  page.hide()
  t.mock.timers.tick(5000)
  assert.equal(ping.count, 1)
  page.show()
  assert.equal(ping.count, 2)
})

test('stopping ends the pings', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const ping = counting()
  const page = fakePage()
  const stop = startKeepWarm({ ping, doc: page, everyMs: 1000 })
  stop()
  t.mock.timers.tick(5000)
  page.show()
  assert.equal(ping.count, 1)
})
