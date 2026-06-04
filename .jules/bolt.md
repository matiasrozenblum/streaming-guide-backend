## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2024-06-04 - [Optimize Redis MGET for notFoundAttempts in enrichWithCachedLiveStatus]
**Learning:** Sequential Redis GET operations in a loop within `enrichWithCachedLiveStatus` (`OptimizedSchedulesService`) create an N+1 query pattern, severely impacting performance for retrieving not-found attempts and fetching canFetchLive configurations. While `getSchedulesWithOptimizedLiveStatusV2` addresses this fully for the main path, the older `enrichWithCachedLiveStatus` was still susceptible to this bottleneck.
**Action:** Replaced sequential `redisService.get` calls with a single batched `redisService.mget` call, and parallelized the `configService.canFetchLive` loop using `Promise.all` + `.map()`, achieving an immediate speedup while preserving the exact fallback logic structure.
