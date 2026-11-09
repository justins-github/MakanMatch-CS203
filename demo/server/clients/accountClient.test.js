import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccountClient } from './accountClient.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// An account-service that answers with `respond` and remembers what it was asked.
function fakeAccounts(respond) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, authorization: options.headers.authorization })
    return respond()
  }
  return { client: createAccountClient({ baseUrl: 'http://accounts', fetchImpl }), calls }
}

const HAFIZ = { id: '22222222-2222-2222-2222-222222222222', displayName: 'Hafiz', username: 'hafiz_nospice' }

test('people asks with the caller\'s token and the ids, and gives back the cards', async () => {
  const { client, calls } = fakeAccounts(() => json([HAFIZ]))
  assert.deepEqual(await client.people('token', [HAFIZ.id, 'a b']), [HAFIZ])
  assert.deepEqual(calls, [{ url: `http://accounts/api/people?ids=${HAFIZ.id},a%20b`, authorization: 'Bearer token' }])
})

test('people is not cached, so someone disabled drops out straight away', async () => {
  const { client, calls } = fakeAccounts(() => json([HAFIZ]))
  await client.people('token', [HAFIZ.id])
  await client.people('token', [HAFIZ.id])
  assert.equal(calls.length, 2)
})

test('kakis asks with the caller\'s token and gives back the whole list', async () => {
  const lists = { kakis: [HAFIZ], incoming: [], outgoing: [] }
  const { client, calls } = fakeAccounts(() => json(lists))
  assert.deepEqual(await client.kakis('token'), lists)
  assert.deepEqual(calls, [{ url: 'http://accounts/api/kakis', authorization: 'Bearer token' }])
})

for (const [name, call] of [['people', (c) => c.people('t', [HAFIZ.id])], ['kakis', (c) => c.kakis('t')]]) {
  test(`${name}: an unreachable account service says so`, async () => {
    const client = createAccountClient({ baseUrl: 'http://accounts', fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
    await assert.rejects(call(client), { status: 503 })
  })

  test(`${name}: an error from the account service says so`, async () => {
    const { client } = fakeAccounts(() => json({}, 500))
    await assert.rejects(call(client), { status: 503 })
  })
}

// The admin's review bomb signs in as the seeded demo accounts.
test('signIn posts the username and password, and gives back the access token', async () => {
  const sent = []
  const fetchImpl = async (url, options) => {
    sent.push({ url, method: options.method, body: JSON.parse(options.body) })
    return json({ accessToken: 'token-hafiz', tokenType: 'bearer' })
  }
  const client = createAccountClient({ baseUrl: 'http://accounts', fetchImpl })
  assert.equal(await client.signIn('hafiz_nospice', 'pw'), 'token-hafiz')
  assert.deepEqual(sent, [{ url: 'http://accounts/api/auth/login', method: 'POST', body: { identifier: 'hafiz_nospice', password: 'pw' } }])
})

test('signIn with a wrong password or no such account is null', async () => {
  for (const status of [400, 401]) {
    const { client } = fakeAccounts(() => json({ detail: 'Invalid login' }, status))
    assert.equal(await client.signIn('nobody', 'pw'), null)
  }
})

test('signIn: an unreachable or failing account service says so', async () => {
  const down = createAccountClient({ baseUrl: 'http://accounts', fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
  await assert.rejects(down.signIn('hafiz_nospice', 'pw'), { status: 503 })
  const { client } = fakeAccounts(() => json({}, 429))
  await assert.rejects(client.signIn('hafiz_nospice', 'pw'), { status: 503 })
})
