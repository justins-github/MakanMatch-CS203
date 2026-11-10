import test from 'node:test'
import assert from 'node:assert/strict'
import { createCatalogClient } from './catalogClient.js'

const MONDAY_LUNCH = [{ day: 'MONDAY', sessions: [{ opens: '11:00', closes: '14:30' }] }]

// A catalog that answers /api/catalog/venue-hours from `rows` and counts calls.
function fakeCatalog(rows) {
  const calls = []
  let down = false
  const fetchImpl = async (url) => {
    calls.push(url)
    if (down) throw new Error('ECONNREFUSED')
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { fetchImpl, calls, goDown: () => (down = true) }
}

test('venue hours come keyed by venue, fetched once per minute', async () => {
  const catalog = fakeCatalog([{ venueId: 'moona-thai', week: MONDAY_LUNCH, updatedAt: '2026-09-28T00:00:00Z' }])
  let clock = 0
  const client = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: catalog.fetchImpl, now: () => clock })

  const hours = await client.venueHours()
  assert.deepEqual(hours.get('moona-thai'), MONDAY_LUNCH)

  clock = 59_000
  await client.venueHours()
  assert.deepEqual(catalog.calls, ['http://catalog/api/catalog/venue-hours'])

  clock = 61_000
  await client.venueHours()
  assert.equal(catalog.calls.length, 2)
})

test('when the catalog goes down, the last hours keep being served', async () => {
  const catalog = fakeCatalog([{ venueId: 'moona-thai', week: MONDAY_LUNCH, updatedAt: null }])
  let clock = 0
  const client = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: catalog.fetchImpl, now: () => clock })
  await client.venueHours()

  catalog.goDown()
  clock = 120_000
  assert.deepEqual((await client.venueHours()).get('moona-thai'), MONDAY_LUNCH)
})

test('with no copy yet, a catalog outage is an error', async () => {
  const catalog = fakeCatalog([])
  catalog.goDown()
  const client = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: catalog.fetchImpl })
  await assert.rejects(client.venueHours(), { status: 503 })
})

test('what changed at a venue since a visit is fetched once a minute at most', async () => {
  const catalog = fakeCatalog({ since: '2026-10-12T04:00:00.000Z', prices: [], added: [], removed: [], updates: [] })
  let clock = 0
  const client = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: catalog.fetchImpl, now: () => clock })
  await client.venueChanges('turks-kebab', '2026-10-12T04:00:00.000Z')
  await client.venueChanges('turks-kebab', '2026-10-12T04:00:00.000Z')
  assert.equal(catalog.calls.length, 1)
  await client.venueChanges('turks-kebab', '2026-10-20T04:00:00.000Z')
  assert.equal(catalog.calls.length, 2, 'a newer visit is a different question')
  clock = 61_000
  await client.venueChanges('turks-kebab', '2026-10-12T04:00:00.000Z')
  assert.equal(catalog.calls.length, 3)
  assert.equal(catalog.calls[0], 'http://catalog/api/catalog/venues/turks-kebab/changes?since=2026-10-12T04%3A00%3A00.000Z')
})

test('venues without a usable typical price are left out', async () => {
  const catalog = fakeCatalog([{ venueId: 'a', typicalPrice: 8.5 }, { venueId: 'b', typicalPrice: null }, { venueId: 'c' }])
  const client = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: catalog.fetchImpl })
  assert.deepEqual([...(await client.venuePrices())], [['a', 8.5]])
})

// Answers after `ms`, unless the caller stops waiting first (as fetch does when its signal aborts).
const slowFetch = (ms, body) => (_url, { signal }) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200 })), ms)
  signal.addEventListener('abort', () => {
    clearTimeout(timer)
    reject(signal.reason)
  })
})

test('gives up on a catalog slower than timeoutMs', async () => {
  const client = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: slowFetch(300, []), timeoutMs: 20 })
  await assert.rejects(client.menu('moona-thai'), { status: 503 })
})

// The warm-up (routes/warm.js) only needs to know the service is awake.
test('ping: any answer means the catalog is awake', async () => {
  const catalog = fakeCatalog([])
  const client = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: catalog.fetchImpl })
  assert.equal(await client.ping(), true)
  assert.deepEqual(catalog.calls, ['http://catalog/api/catalog/venue-status'])
})

test('ping: an unreachable or too-slow catalog is false, not an error', async () => {
  const catalog = fakeCatalog([])
  catalog.goDown()
  const down = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: catalog.fetchImpl })
  assert.equal(await down.ping(), false)
  const slow = createCatalogClient({ baseUrl: 'http://catalog', fetchImpl: slowFetch(300, []), timeoutMs: 20 })
  assert.equal(await slow.ping(), false)
})
