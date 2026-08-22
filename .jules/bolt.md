## 2025-03-05 - [N+1 DB Query Avoidance in Scraper]
**Learning:** Found N+1 query patterns inside the `insertSchedule` method of `ScraperService`. For every scraped item, it runs `await this.programRepo.find` and then for each day `await this.scheduleRepo.findOne`. This leads to poor performance.
**Action:** Always pre-fetch existing records into a Map or Dictionary outside of the loops to avoid N+1 DB calls.

## 2025-03-24 - [N+1 Redis Query Avoidance in Streamer Live Status]
**Learning:** Found N+1 Redis query patterns inside the `getLiveStatuses` method of `StreamerLiveStatusService`. For every requested streamer, it runs `await this.getLiveStatus(id)` concurrently wrapped in `Promise.all`, which executes individual `GET` commands to Redis. This leads to connection overhead and poor performance.
**Action:** Replace `Promise.all` with individual `get` calls with a single `mget` command to batch the retrieval, mapping the responses back to the input array indices.

## 2026-07-10 - [N+1 DB Query Avoidance in Program Bulk Creation]
**Learning:** Found an N+1 query pattern inside the `createBulk` method of `ProgramsService`, where panelists were fetched one by one via `findOne` inside a `.map` wrapped in `Promise.all`.
**Action:** Replace iterative `findOne` calls with a single `find({ where: { id: In(ids) } })`. Note this also dedups the input ids and drops the now-redundant `.filter(Boolean)`.

## 2026-07-09 - [N+1 Redis Query Avoidance in Config Gating Checks]
**Learning:** Found an N+1 Redis pattern in `PushScheduler.handleNotificationsCron`: for every unique channel handle it awaited `configService.canFetchLive(handle)`, each of which issues its own `GET` commands.
**Action:** Added `ConfigService.canFetchLiveBulk(handles)`, which batches the cached reads via `mget`. Ante cualquier cache miss delega en `canFetchLive(handle)` para no alterar la precedencia de fallback (por canal -> global -> DB) ni el warming del cache.

## 2026-08-18 - [Un PR por hallazgo, no uno por dia]
**Learning:** Se acumularon 12 PRs abiertos que en realidad eran 3 cambios distintos: el mismo N+1 de `ProgramsService.createBulk` fue "descubierto" y re-parcheado 10 veces en dias consecutivos.
**Action:** Antes de abrir un PR, revisar los PRs abiertos existentes. Si el hallazgo ya tiene un PR, no abrir otro. Ademas: nunca reformatear archivos no relacionados (varios PRs des-formateaban `src/migrations/*` a lineas largas, rompiendo prettier).

## 2024-05-30 - [Optimize N+1 saves in programs service panelist methods]
**Learning:** In `ProgramsService.addPanelist` and `ProgramsService.removePanelist`, updating linked programs inside a `for...of` loop caused N+1 sequential database `save()` calls and Redis `del()` calls, leading to slow performance when updating multiple related programs.
**Action:** When applying identical mutations to multiple entities derived from a loop (like linked programs), accumulate the entities in an array (`othersToUpdate`) and use a single batched `save(othersToUpdate)`. Likewise, aggregate cache keys into an array (`cacheKeysToDel`) and use `RedisService.del(keysArray)` to process invalidations in one network round-trip.
