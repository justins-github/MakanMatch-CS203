import test from 'node:test'
import assert from 'node:assert/strict'
import { createSliderVectors } from './tasteVectors.js'

// Two Japanese places, one Thai, one with no cuisine; each embedding points one way.
const venues = [
  { id: 'a', cuisine: 'japanese', gersId: 'g-a' },
  { id: 'b', cuisine: 'japanese', gersId: 'g-b' },
  { id: 'c', cuisine: 'thai', gersId: 'g-c' },
  { id: 'd', cuisine: null, gersId: 'g-d' },
]
const embeddings = new Map([['g-a', [1, 0, 0]], ['g-b', [1, 0, 0]], ['g-c', [0, 1, 0]], ['g-d', [0, 0, 1]]])
function source() {
  const asked = []
  return {
    asked,
    size: embeddings.size,
    vectorsFor: async (ids) => {
      asked.push(ids)
      return new Map(ids.filter((id) => embeddings.has(id)).map((id) => [id, embeddings.get(id)]))
    },
  }
}
const taste = (cuisineAffinity) => ({ cuisineAffinity })

test('with no cuisine above the middle, there is no slider vector', async () => {
  const vectorFor = createSliderVectors(source(), venues)
  assert.equal(await vectorFor(taste({ japanese: 0.5, thai: 0 })), null)
})

test('the slider vector points at the cuisines set high, weighted by how high', async () => {
  const vectorFor = createSliderVectors(source(), venues)
  const japaneseOnly = await vectorFor(taste({ japanese: 1, thai: 0 }))
  assert.deepEqual([...japaneseOnly].map((x) => Number(x.toFixed(3))), [1, 0, 0])
  // Japanese 1 is three times further above the middle than Thai 2/3.
  const both = await vectorFor(taste({ japanese: 1, thai: 2 / 3 }))
  assert.ok(both[0] > both[1] && both[1] > 0)
  assert.ok(Math.abs(both[0] / both[1] - 3) < 0.01, `${both[0]} / ${both[1]}`)
})

test('the same sliders are worked out once', async () => {
  const src = source()
  const vectorFor = createSliderVectors(src, venues)
  await vectorFor(taste({ japanese: 1 }))
  await vectorFor(taste({ japanese: 1 }))
  assert.equal(src.asked.length, 1)
})

test('without venue embeddings there is no slider vector', async () => {
  const vectorFor = createSliderVectors({ size: 0 }, venues)
  assert.equal(await vectorFor(taste({ japanese: 1 })), null)
})
