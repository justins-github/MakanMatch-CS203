import test from 'node:test'
import assert from 'node:assert/strict'
import { createOneMapClient, titleCase } from './oneMapClient.js'

const BEDOK_MRT = {
  SEARCHVAL: 'BEDOK MRT STATION (EW5)', BLK_NO: '315', ROAD_NAME: 'NEW UPPER CHANGI ROAD', POSTAL: '467347',
  LATITUDE: '1.323979968681596', LONGITUDE: '103.9299844950654',
}
const EXIT_A = { SEARCHVAL: 'BEDOK MRT STATION EXIT A', BLK_NO: '', ROAD_NAME: 'NIL', POSTAL: 'NIL', LATITUDE: '1.3243', LONGITUDE: '103.9301' }

// A fetch that always answers `body` (a string is parsed like a real response would be).
function answering(body, { ok = true } = {}) {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return { ok, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) }
  }
  return { fetchImpl, calls }
}

test('OneMap capitals become readable labels', () => {
  assert.equal(titleCase('BEDOK MRT STATION (EW5)'), 'Bedok MRT Station (EW5)')
  assert.equal(titleCase('SINGAPORE MANAGEMENT UNIVERSITY (ADMIN BLDG)'), 'Singapore Management University (Admin Bldg)')
})

test('results become labelled points with a street and postcode line, without repeats', async () => {
  const { fetchImpl } = answering({ results: [BEDOK_MRT, EXIT_A, BEDOK_MRT] })
  const places = await createOneMapClient({ fetchImpl }).search('bedok mrt')
  assert.deepEqual(places, [
    { label: 'Bedok MRT Station (EW5)', detail: '315 New Upper Changi Road · S467347', lat: 1.323979968681596, lon: 103.9299844950654 },
    { label: 'Bedok MRT Station Exit A', detail: null, lat: 1.3243, lon: 103.9301 },
  ])
})

test('points outside Singapore are dropped', async () => {
  const { fetchImpl } = answering({ results: [{ ...BEDOK_MRT, LATITUDE: '0', LONGITUDE: '0' }] })
  assert.deepEqual(await createOneMapClient({ fetchImpl }).search('nowhere'), [])
})

test('an outage, an error status or an HTML page all come back as null, never thrown', async () => {
  const down = async () => { throw new Error('ECONNREFUSED') }
  assert.equal(await createOneMapClient({ fetchImpl: down }).search('bedok'), null)
  assert.equal(await createOneMapClient(answering({}, { ok: false })).search('bedok'), null)
  assert.equal(await createOneMapClient(answering('<html>busy</html>')).search('bedok'), null)
  assert.equal(await createOneMapClient(answering({ error: 'x' })).search('bedok'), null)
})

test('the same search within 10 minutes is answered from the cache', async () => {
  let clock = 0
  const { fetchImpl, calls } = answering({ results: [BEDOK_MRT] })
  const oneMap = createOneMapClient({ fetchImpl, now: () => clock })
  await oneMap.search('Bedok  MRT')
  await oneMap.search('bedok mrt')
  assert.equal(calls.length, 1)
  assert.match(calls[0], /searchVal=bedok\+mrt/)
  clock += 11 * 60 * 1000
  await oneMap.search('bedok mrt')
  assert.equal(calls.length, 2)
})
