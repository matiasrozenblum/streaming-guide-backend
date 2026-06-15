## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.
## 2024-06-15 - [Batched Redis Cache Invalidation]
**Learning:** Sequential cache invalidation in loops (e.g. `await redisService.del(key)` inside a `for` loop) creates significant N+1 network overhead. Both `ioredis` and `node-redis` natively support bulk deletion by passing an array of keys directly to the `del` command, but doing so requires guarding against empty arrays to prevent throwing client errors.
**Action:** Always batch cache invalidation requests using `await redisService.del(arrayOfKeys)` when invalidating multiple items, strictly wrapping the call in an `if (arrayOfKeys.length > 0)` condition to preserve safety.
