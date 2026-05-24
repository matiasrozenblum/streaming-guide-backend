## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2024-05-25 - [Concurrency Optimization in Discovery Service]
**Learning:** Sequential external API calls (e.g. YouTube Search API) within a loop create a significant performance bottleneck due to cumulative latency. When replacing `for...of` loops with concurrent execution (`Promise.all` + `.map`), it is crucial to handle individual task failures to avoid aborting the entire batch.
**Action:** Always prefer `Promise.all` with mapped async functions over sequential loops for independent I/O tasks. Wrap individual promises in `try...catch` blocks to swallow or selectively re-throw errors based on whether a partial batch success is desirable over a total batch failure.
