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
