## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-03-24 - [N+1 Redis Query Avoidance when Deleting Weekly Overrides]
**Learning:** In `WeeklyOverridesService`, an N+1 query pattern was identified when fetching overrides inside the `deleteOverridesForProgram` loop using individual `await this.redisService.get(key)` calls. This forced Redis to handle multiple sequential network round-trips.
**Action:** Replaced sequential `get` calls with a single batched `mget` round-trip. Similarly, batched the cleanup logic to use a single array-based `this.redisService.del(keysToDelete)` call, dropping network latency from $O(N)$ to $O(1)$. Always check if arrays are empty (`keys.length > 0`) before issuing batched Redis commands.
