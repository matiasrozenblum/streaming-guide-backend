## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-04-10 - [N+1 Network Query Avoidance in Webhook Subscription Verification]
**Learning:** Found N+1 network query patterns inside the `verifyKickSubscriptions` method of `WebhookSubscriptionService`. For every stored subscription key, it executed `await this.getKickSubscriptions(userId)` sequentially within a loop. This leads to extremely slow performance when there are many Kick subscriptions.
**Action:** Replace the sequential `for` loop with `Promise.all` containing an inner `map` loop for concurrency. Ensure each concurrent task uses a `try-catch` block to prevent individual failures from terminating the whole batch.
