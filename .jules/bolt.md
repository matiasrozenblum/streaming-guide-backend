## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2024-05-15 - Batched Redis Deletions
**Learning:** In operations that retrieve or delete multiple Redis keys in loops (e.g. `deleteOverridesForProgram`, `cleanupExpiredOverrides`), using individual `get` and `del` creates N+1 query patterns that hit Redis repeatedly, causing significant slowdowns on large data sets. Redis clients like `ioredis` support taking arrays of keys for operations like `del` and `mget`.
**Action:** When finding loops running multiple Redis operations, batch them by collecting the keys, chunking them (to prevent payload/call stack limits), and using `mget` and `del([...keys])`.
