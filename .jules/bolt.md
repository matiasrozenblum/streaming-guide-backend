## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-05-18 - [N+1 Redis Query Avoidance in WeeklyOverridesService]
**Learning:** Found N+1 Redis query patterns inside \`deleteOverridesForProgram\` and \`cleanupExpiredOverrides\` in \`WeeklyOverridesService\`. Sequential \`this.redisService.get(key)\` and sequential \`this.redisService.del(key)\` in a loop cause significant network round-trip overhead. Also found manual pipelines requiring manual JSON parsing instead of the native custom \`mget\` method.
**Action:** Replace sequential \`get\` and \`del\` commands with strongly typed \`this.redisService.mget\` batched queries in chunks and single batched array \`del\` queries to eliminate network overhead.
