import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { openApiSpec } from './openapi.js'
import { contextRoutes } from './routes/context.js'
import { docsRoutes } from './routes/docs.js'
import { profileRoutes } from './routes/profile.js'
import { recommendationRoutes } from './routes/recommendations.js'
import { reviewRoutes } from './routes/reviews.js'
import { venueRoutes } from './routes/venues.js'

// Every API router index.js mounts; the handlers never run, so no dependencies.
const apiRouters = [contextRoutes, recommendationRoutes, venueRoutes, reviewRoutes, profileRoutes].map((routes) => routes({}))

const served = apiRouters
  .flatMap((router) => router.stack.filter((layer) => layer.route))
  .flatMap(({ route }) => Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${route.path.replace(/:(\w+)/g, '{$1}')}`))
  .sort()

const documented = Object.entries(openApiSpec.paths)
  .flatMap(([path, operations]) => Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`))
  .sort()

test('the spec documents exactly the routes the engine serves', () => {
  assert.deepEqual(documented, served)
})

test('every $ref in the spec points at a component that exists', () => {
  const refs = JSON.stringify(openApiSpec).match(/"\$ref":"[^"]+"/g).map((s) => s.slice(8, -1))
  for (const ref of new Set(refs)) {
    const target = ref.replace('#/', '').split('/').reduce((node, key) => node?.[key], openApiSpec)
    assert.ok(target, `${ref} does not resolve`)
  }
})

test('only /api/health and /api/context are public', () => {
  const publicPaths = Object.entries(openApiSpec.paths)
    .filter(([, operations]) => Object.values(operations).some((op) => op.security?.length === 0))
    .map(([path]) => path)
  assert.deepEqual(publicPaths.sort(), ['/api/context', '/api/health'])
})

test('the docs routes serve the spec and Swagger UI', async () => {
  const app = express().use(docsRoutes({ spec: openApiSpec }))
  const server = app.listen(0)
  const base = `http://localhost:${server.address().port}`
  try {
    const spec = await fetch(`${base}/v3/api-docs`)
    assert.equal(spec.status, 200)
    assert.equal((await spec.json()).info.title, openApiSpec.info.title)

    const legacy = await fetch(`${base}/swagger-ui.html`, { redirect: 'manual' })
    assert.equal(legacy.status, 302)
    assert.equal(legacy.headers.get('location'), '/swagger-ui/')

    const ui = await fetch(`${base}/swagger-ui/`)
    assert.equal(ui.status, 200)
    assert.match(await ui.text(), /swagger-ui/i)
  } finally {
    server.close()
  }
})
