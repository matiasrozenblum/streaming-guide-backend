## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-03-24 - [N+1 Redis Query Avoidance in Weekly Overrides Cleanup]
**Learning:** Found N+1 Redis query patterns inside `WeeklyOverridesService` cleanup routines. Sequential `await this.redisService.get(key)` inside loops max out connection overhead, and `await this.redisService.del(key)` in a loop incurs heavy penalties. Also learned that when swapping `get` for `mget` in services, the corresponding test mock `mget: jest.fn().mockResolvedValue([])` is strictly required to prevent test crashes when tests iterate over the result.
**Action:** Replace `for` loops of `.get()` with chunked `this.redisService.mget(keys)` to prevent call stack limits, and batch delete keys using `this.redisService.del(keysArray)` instead of single-key loops. Ensure test mocks reflect array return types.
