## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.
## 2025-03-24 - [N+1 DB Query Avoidance in Program Bulk Creation]
**Learning:** Found N+1 query patterns inside the `createBulk` method of `ProgramsService`. For every assigned panelist, it executed an individual `findOne` within a `Promise.all` loop. This leads to connection overhead and poor database performance.
**Action:** Replace `Promise.all` + `findOne` with a single `.find({ where: { id: In(...) } })` using the `In` operator to batch database retrievals. Ensure any subsequent `.filter(Boolean)` operations are removed, and update corresponding `.spec.ts` mocks to include the `.find` method.
