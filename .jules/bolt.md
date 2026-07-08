## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2024-03-20 - [N+1 Query in Programs bulk creation]
**Learning:** TypeORM repository `findOne` calls inside a `Promise.all` with `.map()` mapping over an array of IDs creates a classic N+1 query problem, heavily degrading performance during bulk object creation (like assigning panelists to programs). When refactoring these to use `.find` with TypeORM's `In` operator, the corresponding mock methods in unit tests MUST be updated. Previously mocked `.findOne` calls need to be replaced with `.find` mocks resolving to empty arrays (e.g. `find: jest.fn().mockResolvedValue([])`), or the application tests will throw `TypeError: Cannot read properties of undefined` when iterating over the returned arrays, causing hard-to-diagnose test regressions. Also, any `.filter(Boolean)` checks after `Promise.all(findOne)` are obsolete when converting to a single `.find` query.
**Action:** Before optimizing `.map(findOne)` loops into `find({ where: { id: In(...) } })`, verify if `In` is imported, always ensure a non-empty array is passed to avoid SQL errors, and proactively identify and update all associated repository mocks in the `.spec.ts` files to use `find: jest.fn().mockResolvedValue([])` instead of `findOne`.
