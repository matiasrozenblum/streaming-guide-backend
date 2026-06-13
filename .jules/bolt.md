## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2025-03-24 - [N+1 Await Overhead Avoidance in Schedule Enrichment]
**Learning:** Found sequential `await` patterns inside `enrichSchedules` method of `SchedulesService`. It was using a `for...of` loop over `channelGroups` sequentially awaiting `enrichSchedulesForChannel`. This creates a severe performance bottleneck bounded by N (amount of channel groups).
**Action:** Always replace sequential asynchronous operations wrapped in `for...of` loops mapped over independent entity lists with `Promise.all(Array.from(map.entries()).map(...))` to ensure optimal concurrency and batch processing.
