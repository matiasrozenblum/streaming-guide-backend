## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-05-18 - [N+1 DB Query Avoidance in bulk creation]
**Learning:** Found N+1 query patterns inside the `createBulk` method of `ProgramsService`. For every panelist ID provided, it iterates through them using a `.map()` wrapped in a `Promise.all()`, firing an individual `.findOne()` database call for each element. This causes overhead and inefficient concurrent querying when fetching related entities en-masse.
**Action:** Replaced the `Promise.all` + `.map()` + `.findOne()` construct with a single `.find({ where: { id: In(dto.panelist_ids) } })` operation leveraging TypeORM's `In` operator, which translates to an efficient `WHERE id IN (...)` SQL clause, retrieving all records in a single batched database round-trip.
