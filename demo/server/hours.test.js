import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOpeningHours, openState } from './hours.js'

// 2026-09-28 is a Monday. Times are Singapore time.
const sg = (local) => new Date(`${local}:00+08:00`)
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// week({ MONDAY: [['11:00', '14:30'], ['17:30', '21:00']] }) -> the catalog's 7-day shape
function week(byDay) {
  return DAYS.map((day) => ({ day, sessions: (byDay[day] ?? []).map(([opens, closes]) => ({ opens, closes })) }))
}
const everyDay = (...sessions) => week(Object.fromEntries(DAYS.map((d) => [d, sessions])))

const HAWKER = week({
  MONDAY: [['11:00', '14:30'], ['17:30', '21:00']],
  TUESDAY: [['11:00', '14:30']],
  SATURDAY: [['11:00', '21:00']],
})

test('hours nobody set are unknown, not closed', () => {
  assert.equal(openState([], sg('2026-09-28T12:00')), null)
  assert.equal(openState(undefined, sg('2026-09-28T12:00')), null)
})

test('open during a session, with the closing time', () => {
  assert.deepEqual(openState(HAWKER, sg('2026-09-28T12:00')), {
    openNow: true,
    next: 'closes 2:30pm',
    label: 'Open now · closes 2:30pm',
  })
})

test('closed on the afternoon break, opening again later today', () => {
  assert.deepEqual(openState(HAWKER, sg('2026-09-28T15:00')), {
    openNow: false,
    next: 'opens 5:30pm',
    label: 'Closed now · opens 5:30pm',
  })
})

test('closed for the night, opening tomorrow', () => {
  assert.equal(openState(HAWKER, sg('2026-09-28T22:00')).next, 'opens tomorrow 11am')
})

test('closed days are skipped to the next opening, wrapping past Sunday', () => {
  assert.equal(openState(HAWKER, sg('2026-09-30T12:00')).next, 'opens Sat 11am')
  assert.equal(openState(HAWKER, sg('2026-10-03T22:00')).next, 'opens Mon 11am')
})

test('a session past midnight keeps the venue open into the next day', () => {
  const supper = week({ FRIDAY: [['18:00', '02:00']] })
  assert.equal(openState(supper, sg('2026-10-03T01:00')).label, 'Open now · closes 2am')
  assert.equal(openState(supper, sg('2026-10-03T03:00')).openNow, false)
})

test('Sunday night runs into Monday morning', () => {
  const supper = week({ SUNDAY: [['18:00', '02:00']] })
  assert.equal(openState(supper, sg('2026-09-28T01:00')).openNow, true)
})

test('back-to-back sessions read as one', () => {
  const split = week({ MONDAY: [['11:00', '14:00'], ['14:00', '21:00']] })
  assert.equal(openState(split, sg('2026-09-28T13:00')).next, 'closes 9pm')
})

test('open round the clock', () => {
  assert.deepEqual(openState(everyDay(['00:00', '00:00']), sg('2026-09-28T03:00')), {
    openNow: true,
    next: null,
    label: 'Open 24 hours',
  })
})

test('a day open 24 hours closes at midnight', () => {
  const saturday = week({ SATURDAY: [['00:00', '00:00']] })
  assert.equal(openState(saturday, sg('2026-10-03T10:00')).next, 'closes 12am')
})

test('noon and times on the hour read naturally', () => {
  const lunch = everyDay(['12:00', '15:00'])
  assert.equal(openState(lunch, sg('2026-09-28T09:00')).next, 'opens 12pm')
})

test('venues shut right now drop out; open ones carry their hours; unknown ones are untouched', () => {
  const venues = [
    { id: 'lunch-only', name: 'Lunch Only' },
    { id: 'open-late', name: 'Open Late' },
    { id: 'no-hours', name: 'No Hours' },
  ]
  const hoursByVenue = new Map([
    ['lunch-only', everyDay(['11:00', '14:30'])],
    ['open-late', everyDay(['17:00', '02:00'])],
  ])

  const { open, shutNow } = applyOpeningHours(venues, hoursByVenue, sg('2026-09-28T20:00'))

  assert.deepEqual(open.map((v) => v.id), ['open-late', 'no-hours'])
  assert.deepEqual(open[0].hours, { openNow: true, next: 'closes 2am', label: 'Open now · closes 2am' })
  assert.equal(open[1].hours, undefined)
  assert.deepEqual(shutNow, [{ id: 'lunch-only', name: 'Lunch Only', next: 'opens tomorrow 11am' }])
})
