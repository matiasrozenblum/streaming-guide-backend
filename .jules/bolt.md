## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2026-07-09 - [N+1 Redis Query Avoidance in Config Service / Push Scheduler]
**Learning:** Found N+1 Redis query patterns inside the `handleNotificationsCron` method of `PushScheduler`. For every unique channel handle being checked, it ran `await this.configService.canFetchLive(handle)` concurrently wrapped in `Promise.all`. Under the hood, this executes individual `GET` commands to Redis for config keys (`youtube.fetch_enabled` and `youtube.fetch_override_holiday`) as well as holiday logic. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` calling individual `canFetchLive` calls with a single `canFetchLiveBulk` method that leverages `RedisService.mget` to batch the retrieval of multiple handles in a single round-trip, following the same optimization pattern found in `OptimizedSchedulesService`.
