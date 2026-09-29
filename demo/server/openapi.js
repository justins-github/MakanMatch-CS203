// OpenAPI description of the engine's HTTP API, served by routes/docs.js as
// Swagger UI (the same paths the two Spring services use). openapi.test.js fails
// if a route in routes/ isn't described here, or a path here isn't served.
import { REVIEW_TAGS, SENTIMENTS } from './learn.js'
import { MOODS } from './routes/recommendations.js'

const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema) => ({ 'application/json': { schema } })
const ok = (description, schema) => ({ 200: { description, content: json(schema) } })
const nullable = (schema) => ({ ...schema, nullable: true })
const number01 = { type: 'number', minimum: 0, maximum: 1 }

// Everything under /api except health and context: a bearer token (the global
// security below), an optional act-as header, and the failures requireAuth adds.
function signedIn({ parameters = [], responses, ...operation }) {
  return {
    ...operation,
    parameters: [...parameters, { $ref: '#/components/parameters/ActAs' }],
    responses: {
      ...responses,
      401: { $ref: '#/components/responses/Unauthorized' },
      503: { $ref: '#/components/responses/Unavailable' },
    },
  }
}

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'MakanMatch Engine',
    version: 'v1',
    description:
      'Recommendations, venue search, reviews, rankings and the learned Taste DNA. ' +
      '/api/health and /api/context are public; everything else needs an access token from ' +
      'account-service: call POST /api/auth/login there (:8082), copy accessToken from the ' +
      'response, press Authorize and paste it.',
  },
  tags: [
    { name: 'Context', description: 'Liveness and the live weather context' },
    { name: 'Recommendations', description: 'For You: top matches or one Surprise pick' },
    { name: 'Venues', description: 'Personalised venue search' },
    { name: 'Reviews', description: 'Dishes, rankings and reviews that train your Taste DNA' },
    { name: 'Profile', description: 'Your Taste DNA' },
  ],
  security: [{ bearer: [] }],
  paths: {
    '/api/health': {
      get: {
        tags: ['Context'],
        summary: 'Liveness check',
        security: [],
        responses: ok('The engine is up', ref('Ok')),
      },
    },
    '/api/context': {
      get: {
        tags: ['Context'],
        summary: 'Current rain context near campus (data.gov.sg two-hour forecast, cached 5 min)',
        security: [],
        parameters: [{ $ref: '#/components/parameters/Rain' }],
        responses: ok('The weather context', ref('WeatherContext')),
      },
    },
    '/api/recommendations': {
      get: signedIn({
        tags: ['Recommendations'],
        summary: 'Top 10 walkable matches for the caller, or one experimental Surprise pick',
        description: 'Venues their owners report as closed, or that are shut right now, are left out and listed in ownerReports.',
        parameters: [
          { name: 'mode', in: 'query', description: 'find = top 10; surprise = one pick from a cuisine you rarely eat', schema: { type: 'string', enum: ['find', 'surprise'], default: 'find' } },
          { name: 'mood', in: 'query', schema: { type: 'string', enum: MOODS, default: 'none' } },
          { name: 'exclude', in: 'query', description: 'Comma-separated venue ids a Surprise pick must skip', schema: { type: 'string' }, example: 'sg-001,sg-002' },
          { $ref: '#/components/parameters/Rain' },
        ],
        responses: ok('Ranked venues', ref('Recommendations')),
      }),
    },
    '/api/venues/search': {
      get: signedIn({
        tags: ['Venues'],
        summary: 'Typeahead venue search, ranked by text match blended with the caller\'s match %',
        parameters: [
          { name: 'q', in: 'query', description: 'Search text (echoed back so the client can drop stale responses)', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 8 } },
        ],
        responses: ok('Matching venues', ref('VenueSearch')),
      }),
    },
    '/api/dishes': {
      get: signedIn({
        tags: ['Reviews'],
        summary: 'A venue\'s dishes with the AI\'s predicted score for the caller',
        description: 'Dishes come from catalog-service; if it is unreachable, the curated seed dishes are returned with degraded: true.',
        parameters: [{ name: 'venueId', in: 'query', required: true, schema: { type: 'string' }, example: 'sg-001' }],
        responses: {
          ...ok('The venue\'s dishes', ref('VenueDishes')),
          400: { $ref: '#/components/responses/BadRequest' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      }),
    },
    '/api/rankings': {
      get: signedIn({
        tags: ['Reviews'],
        summary: 'The caller\'s personal ranked dish list, best first',
        responses: ok('Ranked dishes', { type: 'array', items: ref('RankingEntry') }),
      }),
    },
    '/api/reviews/beli': {
      post: signedIn({
        tags: ['Reviews'],
        summary: 'Post a Beli-style review: sentiment, head-to-head duels, free text and rank position',
        requestBody: { required: true, content: json(ref('BeliReviewRequest')) },
        responses: {
          ...ok('The review, where it landed and how the Taste DNA moved', ref('BeliReviewResult')),
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      }),
    },
    '/api/reviews': {
      post: signedIn({
        tags: ['Reviews'],
        summary: 'Post a 1-5 star review (kept for API clients; the app uses /api/reviews/beli)',
        requestBody: { required: true, content: json(ref('RatingReviewRequest')) },
        responses: {
          ...ok('The review and how the Taste DNA moved', ref('RatingReviewResult')),
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      }),
    },
    '/api/reset': {
      post: signedIn({
        tags: ['Reviews'],
        summary: 'Forget the caller\'s Taste DNA, reviews and rankings (never anyone else\'s)',
        responses: ok('Reset', ref('Ok')),
      }),
    },
    '/api/profile': {
      get: signedIn({
        tags: ['Profile'],
        summary: 'The caller\'s Taste DNA and prediction accuracy',
        responses: ok('Taste DNA', ref('TasteDna')),
      }),
    },
  },
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      ActAs: {
        name: 'X-Act-As',
        in: 'header',
        description: 'Admins only: user, owner or admin. account-service decides whether it applies.',
        schema: { type: 'string', enum: ['user', 'owner', 'admin'] },
      },
      Rain: {
        name: 'rain',
        in: 'query',
        description: '1 = simulate rain for demos (the context is labelled simulated: true)',
        schema: { type: 'string', enum: ['1'] },
      },
    },
    responses: {
      BadRequest: { description: 'Invalid input', content: json(ref('Error')) },
      Unauthorized: { description: 'No token, or it has expired, or the account is no longer valid', content: json(ref('Error')) },
      Forbidden: { description: 'Owners can\'t review venues they manage', content: json(ref('Error')) },
      NotFound: { description: 'No such venue', content: json(ref('Error')) },
      Unavailable: { description: 'account-service or catalog-service is unreachable', content: json(ref('Error')) },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'string', example: 'Please sign in' } },
      },
      Ok: {
        type: 'object',
        properties: { ok: { type: 'boolean', example: true } },
      },
      WeatherContext: {
        type: 'object',
        properties: {
          raining: { type: 'boolean' },
          areaForecasts: { type: 'object', additionalProperties: { type: 'string' }, example: { Bedok: 'Light Rain', City: 'Cloudy' } },
          summary: { type: 'string', example: 'Light Rain over Bedok (next 2h)' },
          source: { type: 'string', enum: ['live', 'fallback'] },
          fetchedAt: { type: 'string', format: 'date-time' },
          simulated: { type: 'boolean', description: 'Present (true) only when ?rain=1 forced the rain' },
        },
      },
      Accuracy: {
        type: 'object',
        description: 'How close the AI\'s predictions have been to the caller\'s own scores',
        properties: {
          running: nullable({ type: 'integer', minimum: 0, maximum: 100, description: 'null until the first review' }),
          count: { type: 'integer', description: 'Reviews the accuracy is based on' },
        },
      },
      Venue: {
        type: 'object',
        description: 'A registry venue with the caller\'s match. Registry fields beyond these (lat, lon, phone, website...) are passed through.',
        additionalProperties: true,
        properties: {
          id: { type: 'string', example: 'sg-001' },
          name: { type: 'string' },
          cuisine: nullable({ type: 'string' }),
          area: nullable({ type: 'string' }),
          address: nullable({ type: 'string' }),
          distanceMin: { type: 'number', description: 'Walking minutes from campus' },
          matchScore: { type: 'integer', minimum: 0, maximum: 100 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          novelty: number01,
          why: { type: 'array', items: { type: 'string' }, example: ['You love Japanese', 'Matches your spice level'] },
          experimental: { type: 'boolean', description: 'true for a Surprise pick' },
          hours: {
            type: 'object',
            description: 'Present when the owner has set opening hours',
            properties: { openNow: { type: 'boolean' }, next: nullable({ type: 'string' }), label: { type: 'string', example: 'Open now · closes 9:30pm' } },
          },
          ownerUpdate: {
            type: 'object',
            description: 'Present when the owner has reported something (the address above is already the current one)',
            properties: {
              status: { type: 'string' },
              currentAddress: nullable({ type: 'string' }),
              note: nullable({ type: 'string' }),
              reportedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      Recommendations: {
        type: 'object',
        properties: {
          context: ref('WeatherContext'),
          mood: { type: 'string', enum: MOODS },
          mode: { type: 'string', enum: ['find', 'surprise'] },
          venues: { type: 'array', items: ref('Venue'), description: 'Up to 10 for find, at most 1 for surprise' },
          ownerReports: {
            type: 'object',
            properties: {
              available: { type: 'boolean', description: 'false when catalog-service was unreachable (nothing was left out for being closed)' },
              closedNearby: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    status: { type: 'string', enum: ['CLOSED', 'TEMPORARILY_CLOSED'] },
                    note: nullable({ type: 'string' }),
                    reportedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
              shutNow: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { id: { type: 'string' }, name: { type: 'string' }, next: nullable({ type: 'string', example: 'opens 11am' }) },
                },
              },
            },
          },
        },
      },
      VenueSearch: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                area: nullable({ type: 'string' }),
                address: nullable({ type: 'string' }),
                cuisine: nullable({ type: 'string' }),
                distanceMin: { type: 'number' },
                matchScore: { type: 'integer', minimum: 0, maximum: 100 },
                yourScore: nullable({ type: 'number', minimum: 1, maximum: 10, description: 'Mean of your latest 1-10 dish scores here' }),
                highlight: {
                  type: 'array',
                  description: 'Character ranges of the name that matched q',
                  items: { type: 'object', properties: { start: { type: 'integer' }, len: { type: 'integer' } } },
                },
              },
            },
          },
        },
      },
      Dish: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          venueId: { type: 'string' },
          venueName: { type: 'string' },
          cuisine: nullable({ type: 'string' }),
          name: { type: 'string' },
          price: nullable({ type: 'number', description: 'S$' }),
          priceTier: { type: 'integer', enum: [0, 1, 2], description: '0 cheap, 1 mid, 2 pricey' },
          spice: number01,
          richness: number01,
          novelty: number01,
          tags: { type: 'array', items: { type: 'string' } },
          source: { type: 'string', example: 'SEED' },
          officialPrice: nullable({ type: 'number' }),
          communityPrice: nullable({ type: 'number' }),
          priceConflict: { type: 'boolean' },
          predicted: { type: 'integer', minimum: 0, maximum: 100 },
          predictedScore10: { type: 'number', minimum: 0, maximum: 10 },
          rated: { allOf: [ref('Review')], nullable: true, description: 'The caller\'s latest review of this dish' },
        },
      },
      VenueDishes: {
        type: 'object',
        properties: {
          accuracy: ref('Accuracy'),
          degraded: { type: 'boolean', description: 'true when catalog-service was unreachable and seed dishes were used' },
          youManageThisVenue: { type: 'boolean' },
          dishes: { type: 'array', items: ref('Dish') },
        },
      },
      RankingEntry: {
        type: 'object',
        properties: {
          rank: { type: 'integer', minimum: 1 },
          dishId: { type: 'string' },
          name: { type: 'string' },
          venueName: { type: 'string' },
          score10: nullable({ type: 'number', minimum: 1, maximum: 10 }),
        },
      },
      BeliReviewRequest: {
        type: 'object',
        required: ['dishId', 'sentiment', 'insertIndex'],
        properties: {
          dishId: { type: 'string' },
          sentiment: { type: 'string', enum: SENTIMENTS },
          insertIndex: { type: 'integer', minimum: 0, description: 'Where the dish goes in your ranked list (0 = best)' },
          duels: {
            type: 'array',
            maxItems: 5,
            description: 'Head-to-head comparisons against dishes you ranked before',
            items: { type: 'object', required: ['winnerId', 'loserId'], properties: { winnerId: { type: 'string' }, loserId: { type: 'string' } } },
          },
          text: { type: 'string', maxLength: 1000, default: '' },
        },
      },
      RatingReviewRequest: {
        type: 'object',
        required: ['dishId', 'rating'],
        properties: {
          dishId: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          tags: { type: 'array', items: { type: 'string', enum: REVIEW_TAGS }, default: [] },
        },
      },
      Review: {
        type: 'object',
        properties: {
          dishId: { type: 'string' },
          dishName: { type: 'string' },
          venueId: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          sentiment: { type: 'string', enum: SENTIMENTS, description: 'Beli reviews only' },
          tags: { type: 'array', items: { type: 'string', enum: REVIEW_TAGS } },
          text: { type: 'string' },
          score10: { type: 'number', minimum: 1, maximum: 10, description: 'Beli reviews only' },
          predicted: { type: 'integer', minimum: 0, maximum: 100 },
          actual: { type: 'integer', minimum: 0, maximum: 100 },
          at: { type: 'string', format: 'date-time' },
        },
      },
      TasteDelta: {
        type: 'object',
        description: 'One Taste DNA dimension the review moved',
        properties: {
          dimension: { type: 'string', example: 'Spice' },
          from: { type: 'number' },
          to: { type: 'number' },
          reason: { type: 'string' },
        },
      },
      TasteProfile: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cuisineAffinity: { type: 'object', additionalProperties: number01, example: { thai: 0.75, indian: 0.5 } },
          spicePref: number01,
          richnessPref: number01,
          priceComfort: { type: 'number', minimum: 0, maximum: 2 },
          adventurousness: number01,
          recentlyEaten: { type: 'array', items: { type: 'string' } },
        },
      },
      RatingReviewResult: {
        type: 'object',
        properties: {
          review: ref('Review'),
          deltas: { type: 'array', items: ref('TasteDelta') },
          prediction: { type: 'object', properties: { predicted: { type: 'integer' }, actual: { type: 'integer' } } },
          accuracy: ref('Accuracy'),
          profile: ref('TasteProfile'),
        },
      },
      BeliReviewResult: {
        type: 'object',
        properties: {
          review: ref('Review'),
          deltas: { type: 'array', items: ref('TasteDelta') },
          score10: { type: 'number', minimum: 1, maximum: 10 },
          rank: { type: 'object', properties: { index: { type: 'integer' }, total: { type: 'integer' } } },
          prediction: {
            type: 'object',
            properties: { predicted: { type: 'integer' }, actual: { type: 'integer' }, predictedScore10: { type: 'number' } },
          },
          accuracy: ref('Accuracy'),
          rankings: { type: 'array', items: { type: 'string' }, description: 'Your dish ids, best first' },
          profile: ref('TasteProfile'),
        },
      },
      TasteDna: {
        type: 'object',
        properties: {
          user: ref('TasteProfile'),
          dimensions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', enum: ['cuisine', 'price', 'spice', 'richness', 'location', 'adventurousness'] },
                label: { type: 'string', example: 'Cuisine breadth' },
                value: number01,
              },
            },
          },
          accuracy: ref('Accuracy'),
        },
      },
    },
  },
}
