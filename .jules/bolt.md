## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.
## 2025-04-17 - [N+1 Redis Query Avoidance with MGET and Chunking]
**Learning:** Found sequential Redis  and  patterns inside the  and  methods. Also, when transitioning to , large volumes of keys retrieved via  could blow up the stack or overload the connection if requested all at once.
**Action:** Replace sequential  calls with batched  retrievals processed in chunks (e.g., 500 keys at a time) to avoid call stack limits. Consolidate keys to delete and invoke a single .

## 2025-04-17 - [N+1 Redis Query Avoidance with MGET and Chunking]
**Learning:** Found sequential Redis `get` and `del` patterns inside the `deleteOverridesForProgram` and `cleanupExpiredOverrides` methods. Also, when transitioning to `mget`, large volumes of keys retrieved via `scanStream` could blow up the stack or overload the connection if requested all at once.
**Action:** Replace sequential `get` calls with batched `mget` retrievals processed in chunks (e.g., 500 keys at a time) to avoid call stack limits. Consolidate keys to delete and invoke a single `this.redisService.del(array)`.
