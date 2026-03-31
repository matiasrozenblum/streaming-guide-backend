## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-03-31 - [N+1 Redis Query and External API Calls in Streamer Webhooks]
**Learning:** Found N+1 Redis query patterns and unnecessary external API calls inside the `getWebhookStatus` method of `StreamersService`. It executed `await this.redisService.get` in loops for online/offline Twitch events and Kick services, creating N+1 queries. Additionally, it fetched Twitch EventSub subscriptions via API repeatedly inside the loop for every Twitch service found on a streamer.
**Action:** Batch fetch Redis keys using `mget` outside the loop, build a Map for quick cache lookup, and fetch API data (like Twitch EventSub subscriptions) only once outside the loop if at least one matching service exists.
