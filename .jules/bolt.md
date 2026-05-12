## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.
## 2024-05-12 - N+1 Issue resolving canFetchLive during enrichment
**Learning:** Found an N+1 query loop issue inside `OptimizedSchedulesService.enrichWithCachedLiveStatus` where multiple distinct cache-hitting operations were sequentially resolved using `await this.configService.canFetchLive(handle)`. This sequential resolution caused O(N) network calls directly inside a heavily-utilized service.
**Action:** Introduced a `canFetchLiveBulk(handles: string[])` method inside `ConfigService` which resolves cache hits using `RedisService.mget` dynamically instead. Refactored the looping check to utilize this single batch request, providing vast performance improvements and alleviating the bottleneck. Remember to use defined config getters like `getBoolean` rather than inventing manual ones during bulk refactors!
