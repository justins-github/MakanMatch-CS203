import test from 'node:test'
import assert from 'node:assert/strict'
import { signOut } from './signOut.js'

test('signs out here once the server has ended the session', async () => {
  const done = []
  await signOut({ endSession: async () => done.push('server'), clearLocal: () => done.push('here') })
  assert.deepEqual(done, ['server', 'here'])
})

// The refresh cookie can't be cleared from the page, so showing the login screen
// anyway would sign this person back in on the next reload.
test('stays signed in when the server could not end the session', async () => {
  let cleared = false
  const failing = signOut({
    endSession: async () => { throw new Error('Request failed (503)') },
    clearLocal: () => { cleared = true },
  })
  await assert.rejects(failing, /503/)
  assert.equal(cleared, false)
})

test('a deleted account signs out here whatever the server says', async () => {
  let cleared = false
  await signOut({
    endSession: async () => { throw new Error('Request failed (503)') },
    clearLocal: () => { cleared = true },
    force: true,
  })
  assert.equal(cleared, true)
})
