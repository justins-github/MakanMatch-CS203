# Context-service agent notes

## Configuration

- `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` configure OneMap credentials.
- `CATALOG_SERVICE_URL` configures the catalog-service HTTP base URL and defaults to `http://localhost:8083`.
- Secrets live only in the local, gitignored `.env`; use `.env.example` as the placeholder template and never commit `.env`.
- context-service has no database access. Venue and menu data are obtained from catalog-service over HTTP.
