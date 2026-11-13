import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { warmRoutes } from './warm.js'

// GET /api/warm on a throwaway engine whose services answer pings as given.
async function warm({ account, catalog, context = null }) {
  const app = express().use(warmRoutes({
    accounts: { ping: account }, catalog: { ping: catalog }, context: context && { ping: context },
  }))
  const server = app.listen(0)
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/warm`)
    return { status: res.status, body: await res.json() }
  } finally {
    server.close()
  }
}

test('pings both services and says which are awake', async () => {
  const got = await warm({ account: async () => true, catalog: async () => false })
  assert.deepEqual(got, { status: 200, body: { account: true, catalog: false } })
})

test('pings them at the same time, so two cold starts cost one wait', async () => {
  let waiting = 0
  let together = 0
  const ping = async () => {
    together = Math.max(together, ++waiting)
    await new Promise((resolve) => setTimeout(resolve, 20))
    waiting--
    return true
  }
  await warm({ account: ping, catalog: ping })
  assert.equal(together, 2)
})

test('wakes context-service too when the engine uses one', async () => {
  const got = await warm({ account: async () => true, catalog: async () => true, context: async () => false })
  assert.deepEqual(got, { status: 200, body: { account: true, catalog: true, context: false } })
})
