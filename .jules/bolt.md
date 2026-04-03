## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-03-31 - [N+1 Redis Query Avoidance in Streamer Webhook Status]
**Learning:** Found N+1 Redis query patterns inside the `getWebhookStatus` method of `StreamersService`. Inside loops iterating over services and event types, individual `await this.redisService.get(redisKey)` were executed. This causes connection overhead and slows down API performance.
**Action:** Replace multiple sequential `get` calls inside loops with batch key collection and a single `this.redisService.mget(keys)` call to resolve Redis N+1 anti-patterns.
