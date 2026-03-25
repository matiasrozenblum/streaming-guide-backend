## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-03-25 - [N+1 Redis Query Avoidance in Webhook Subscriptions]
**Learning:** Found N+1 Redis query patterns inside the `renewExpiredKickSubscriptions` and `getSubscriptionsForStreamer` methods of `WebhookSubscriptionService`. Looping through keys and fetching their values individually with `redisService.get` creates significant connection overhead and poor performance.
**Action:** Replace sequential `get` calls in loops with a single `redisService.mget` call to batch fetch all keys simultaneously. For dynamic sets of keys within a loop (like iterating through streamer services), gather all required keys into an array first, execute the `mget`, and then process the results sequentially or via a mapping array.
