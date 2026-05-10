## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-05-10 - [N+1 Redis Query Avoidance in Live Status Background]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatusForChannels` method of `LiveStatusBackgroundService`. For every requested handle, it runs `await this.getCachedLiveStatus(handle)` sequentially, causing multiple round-trips to Redis. It also awaited `shouldUpdateCache` sequentially inside a loop.
**Action:** Replace sequential `getCachedLiveStatus` calls with a single `this.redisService.mget` call to batch the retrieval. Parallelize the asynchronous `shouldUpdateCache` evaluations using `Promise.all` across the fetched records.
