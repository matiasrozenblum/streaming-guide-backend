## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.
## 2024-05-24 - Redis MGET Batching for YoutubeLiveService

**Learning:** When retrieving multiple sets of tracking data for channels from Redis inside loops (e.g. `getBatchLiveStreams`), sequential `.get` calls heavily impact overall response times due to N+1 query latency.
**Action:** Use `Array.map` to generate arrays of keys based on channel handles before the loop, and use `Promise.all` with `RedisService.mget` to perform batch lookups, ensuring we maintain exact caching/escalation state by using the array index inside the iteration.
