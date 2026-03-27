# La Guia del Streaming - Backend

## Project Overview
NestJS API backend serving both the web frontend and React Native mobile app.
Deployed on Railway (staging + production).

## Tech Stack
- **Framework**: NestJS 11, TypeScript, Express
- **Database**: PostgreSQL via TypeORM (entities + migrations)
- **Cache**: Redis via ioredis (live status caching, SSE events)
- **Auth**: Passport + JWT (access/refresh tokens)
- **Push**: Firebase Admin (FCM) + web-push (VAPID)
- **Scraping**: Puppeteer (schedule scrapers)
- **Monitoring**: Sentry, PostHog
- **Email**: SendGrid via @nestjs-modules/mailer

## Architecture
- Modular NestJS structure: each feature is a module in `src/`
- TypeORM entities define schema; changes require migrations (never auto-sync)
- Redis caches YouTube live status; SSE broadcasts via `/youtube/live-events`
- JWT auth with access + refresh tokens, social login (Google, Apple)
- Swagger API docs auto-generated from decorators

## Coding Conventions
- DTOs use `class-validator` decorators for input validation
- Services are `@Injectable()`, follow NestJS DI pattern
- Controllers use `@ApiTags`, `@ApiOperation` for Swagger docs
- Dates: use `dayjs` with timezone `America/Argentina/Buenos_Aires`
- Error handling: use NestJS built-in exceptions (`NotFoundException`, etc.)
- Database changes: always generate + run migrations, never modify entities without migration

## Key Paths
- `src/auth/` - JWT auth, social login, guards, strategies
- `src/channels/` - Channel CRUD, schedule aggregation, today/v2 endpoint
- `src/schedules/` - Optimized queries, Redis live status caching
- `src/push/` - FCM push notification dispatch
- `src/youtube/` - YouTube live polling, SSE broadcasting
- `src/streamers/` - Twitch/Kick streamer monitoring
- `src/redis/` - Redis service (get, set, mget)
- `src/migrations/` - TypeORM migrations

## Scripts
- `npm run start:dev` - Dev with hot reload
- `npm run build` - Compile TypeScript
- `npm run lint` - ESLint with auto-fix
- `npm test` - Jest unit tests
- `npm run test:e2e` - End-to-end tests
- `npm run migration:run` - Apply pending migrations
- `npm run migration:generate -- src/migrations/Name` - Generate migration from entity changes

## Cross-Repo Impact
- Frontend: `streaming-guide-frontend` (Next.js)
- Mobile: `streaming-guide-mobile` (React Native/Expo)
- Both consume the same API - changes to endpoints/DTOs affect both consumers
- Staging API: `https://streaming-guide-backend-staging.up.railway.app`
- When modifying API contracts, consider backward compatibility or coordinate updates
