# Context Service

## Nearby places by walking time

`GET /api/places/nearby?lat=1.3521&lng=103.8198&maxWalkMin=20` returns fixture places whose OneMap walking route is within the requested limit, sorted by actual route time. The response includes `routingStatus` (`complete` or `partial`) and places with `id`, `name`, `lat`, `lng`, and numeric `walkMinutes`.

The endpoint accepts Singapore coordinates within latitude 1.13–1.47 and longitude 103.59–104.10. `maxWalkMin` must be an integer from 1 to 60.

The search first uses haversine distance and `onemap.walk-speed-m-per-min` (default `80` metres/minute) to shortlist candidates. It then routes no more than `places.max-routed` candidates (default `15`) with OneMap and filters/sorts by returned walking time. **Places outside the nearest N candidates are never routed, so a farther place that would have a shorter walking route cannot appear in results.** A route error skips that place and marks the overall response `partial`.

Configure OneMap credentials with `ONEMAP_EMAIL` and `ONEMAP_PASSWORD`. Optional settings are `ONEMAP_WALK_SPEED_M_PER_MIN` and `PLACES_MAX_ROUTED`.

```sh
curl 'http://localhost:8081/api/places/nearby?lat=1.3521&lng=103.8198&maxWalkMin=20'
```

Swagger UI is available at `/swagger-ui/index.html`.
