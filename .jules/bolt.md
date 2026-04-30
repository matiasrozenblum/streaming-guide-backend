## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-05-18 - [N+1 Redis Query Avoidance in Overrides Deletion]
**Learning:** The `deleteOverridesForProgram` function fetched each Redis key sequentially using `await this.redisService.get(key)` and deleted them sequentially using `await this.redisService.del(key)` in a large iteration loop, causing severe latency and connection overhead due to N+1 Redis network round-trips.
**Action:** Use chunking to batch fetch using `await this.redisService.mget(keys)` and consolidate deletions into a single `await this.redisService.del(keysToDelete)` call to minimize network I/O operations.
