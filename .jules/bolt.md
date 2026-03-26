## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-03-24 - [N+1 Redis Query Avoidance in Webhook Subscriptions]
**Learning:** Found another instance of N+1 Redis query patterns inside the `getSubscriptionsForStreamer` method of `WebhookSubscriptionService`. It was calling `redisService.get(key)` inside a loop for each service (and twice for Twitch: online and offline), leading to multiple round-trips to Redis.
**Action:** Consistently hunt for `get` calls inside loops or mapped collections and gather all cache keys upfront to resolve them with a single `redisService.mget` round-trip.
