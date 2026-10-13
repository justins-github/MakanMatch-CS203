# Context Service

## Nearby places by walking time

`GET /api/places/nearby?lat=1.3521&lng=103.8198&maxWalkMin=20` returns fixture places whose OneMap walking route is within the requested limit, sorted by adjusted route time. The response includes `routingStatus` (`complete` or `partial`), places with `id`, `name`, `lat`, `lng`, `rawWalkMinutes`, and `adjustedWalkMinutes`, and a `weather` summary.

The endpoint accepts Singapore coordinates within latitude 1.13–1.47 and longitude 103.59–104.10. `maxWalkMin` must be an integer from 1 to 60.

The search first uses haversine distance and `onemap.walk-speed-m-per-min` (default `80` metres/minute) to shortlist candidates. It then routes no more than `places.max-routed` candidates (default `15`) with OneMap and filters/sorts by returned walking time. **Places outside the nearest N candidates are never routed, so a farther place that would have a shorter walking route cannot appear in results.** A route error skips that place and marks the overall response `partial`.

Configure OneMap credentials with `ONEMAP_EMAIL` and `ONEMAP_PASSWORD`. Optional settings are `ONEMAP_WALK_SPEED_M_PER_MIN` and `PLACES_MAX_ROUTED`.

```sh
curl 'http://localhost:8081/api/places/nearby?lat=1.3521&lng=103.8198&maxWalkMin=20'
```

Swagger UI is available at `/swagger-ui/index.html`.

## Weather context and rain-adjusted walking time

`GET /api/context/weather?lat=1.3521&lng=103.8198` returns the nearest NEA two-hour forecast area's text, the rule-based rain category, and its multiplier. `NEA_API_KEY` configures the optional `x-api-key` header; it may be left blank. Weather contexts are cached for five minutes.

Nearby-place filtering uses the raw route minutes multiplied by the classified rain factor, and tightens its prefilter radius using the same factor. Defaults are `1.25` for light rain/showers and `1.4` for thunder forecasts. These values are assumptions configurable with `WEATHER_RAIN_MULTIPLIER_LIGHT` and `WEATHER_RAIN_MULTIPLIER_HEAVY`. Thunder keywords take precedence over rain/showers. Other forecast text is classified as `NONE`. If NEA is unavailable or its response cannot be matched to an area, the request continues with multiplier `1.0` and weather status `unavailable`. This feature uses forecast text only; it does not use rainfall readings.

```sh
curl 'http://localhost:8081/api/context/weather?lat=1.3521&lng=103.8198'
```

Nearby results are then ranked by a configurable weather-based score. The score combines walk time with rain-only shelter and comfort bonuses; it is rule-based and independent from taste-profile data. `ranking.*` contains the category weights, bonuses, and sheltered/comfortable place-ID lists. Results include `weatherScore` and human-readable `reasons`. When weather is unavailable, ranking uses the NONE weight, applies no bonuses, and adds `Weather data unavailable`.

## Catalog service client and providers

The catalog integration uses HTTP only. Set `CATALOG_SERVICE_BASE_URL` (default `http://localhost:8083`).
`CatalogPlaceProvider` reads from an in-memory venue cache refreshed on startup and every 15 minutes;
`CatalogPriceProvider` requests dish-level prices only for a venue that a later feature has already shortlisted.
Venue status and opening-hours responses are cached for five minutes, and dish responses are cached per venue
for ten minutes. Catalog connection failures retain the last good venue cache (or an empty cache on first
startup) and are reported at `GET /debug/catalog-cache`.

Known limitation: the current catalog-service search endpoint requires a text `q` and caps each response at
25 rows; it has no page/offset or bulk-all-venues endpoint. The cache therefore uses the bootstrap query `an`
and cannot guarantee the complete venue registry. The health response exposes this cache as query-scoped until
catalog-service provides a bulk endpoint.
