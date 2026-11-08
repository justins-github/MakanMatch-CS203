import test from 'node:test'
import assert from 'node:assert/strict'
import { relativeDay } from './when.js'

const NOW = new Date('2026-11-07T12:00:00+08:00')
const ago = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

test('recent days read as words', () => {
  assert.equal(relativeDay(ago(0.2), NOW), 'today')
  assert.equal(relativeDay(ago(1.5), NOW), 'yesterday')
  assert.equal(relativeDay(ago(2), NOW), '2 days ago')
  assert.equal(relativeDay(ago(29), NOW), '29 days ago')
})

test('anything older reads as a date', () => {
  assert.equal(relativeDay('2026-10-08T12:00:00+08:00', NOW), '8 Oct')
})

test('a clock slightly behind the server still says today', () => {
  assert.equal(relativeDay(ago(-0.1), NOW), 'today')
})
