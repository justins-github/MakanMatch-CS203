import test from 'node:test'
import assert from 'node:assert/strict'
import { keywordReading } from './reviewText.js'

const spiceDown = (reading) => reading.signals.some((s) => s.dimension === 'spice' && s.direction === 'down')

test('an intensified "spicy" is a complaint from someone who did not love it', () => {
  assert.ok(spiceDown(keywordReading('SUPER SPICY', 'disliked')))
  assert.ok(spiceDown(keywordReading('It was so spicy, could not finish', 'fine')))
  for (const word of ['very', 'crazy', 'insanely', 'extremely']) {
    assert.ok(spiceDown(keywordReading(`${word} hot`, 'disliked')), word)
  }
})

test('a negated intensifier is not a complaint about heat: "not very spicy" means milder', () => {
  for (const text of ['not very spicy', 'Not so hot, which I liked', "it isn't very spicy"]) {
    assert.ok(!spiceDown(keywordReading(text, 'fine')), text)
  }
})

test('someone who loved it is not complaining when they say "super spicy"', () => {
  assert.ok(!spiceDown(keywordReading('super spicy, love it', 'loved')))
})

test('without a sentiment, an intensified "spicy" says nothing, as before', () => {
  assert.ok(!spiceDown(keywordReading('SUPER SPICY')))
})

test('plain complaints read the same with or without a sentiment', () => {
  assert.ok(spiceDown(keywordReading('way too spicy')))
  assert.ok(spiceDown(keywordReading('way too spicy', 'loved')))
})
