// Public API docs on the paths the Spring services use: Swagger UI at
// /swagger-ui.html, the raw OpenAPI JSON at /v3/api-docs.
import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'

export function docsRoutes({ spec }) {
  const router = Router()

  router.get('/v3/api-docs', (_req, res) => res.json(spec))
  router.get('/swagger-ui.html', (_req, res) => res.redirect('/swagger-ui/'))
  router.use('/swagger-ui', swaggerUi.serve, swaggerUi.setup(spec))

  return router
}
