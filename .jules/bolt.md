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

## 2026-09-06 - [Otra vez cuatro PRs para el mismo hallazgo]
**Learning:** De los 6 PRs abiertos (#406-#411), #406/#408 y #407/#410 eran el mismo cambio en `ProgramsService.addPanelist/removePanelist` re-descubierto cuatro veces. Ademas #407 y #410 volvieron a reformatear `src/migrations/*` a lineas largas, rompiendo prettier y el job `lint` - exactamente lo que ya estaba anotado en la entrada del 2026-08-18. Las fechas de las entradas tambien salieron mal (2023-10-27, 2024-05-30).
**Action:** Antes de abrir un PR: (1) `gh pr list` y comparar el diff con lo ya abierto; (2) correr `npm run lint:ci` y no commitear archivos fuera del alcance del hallazgo - `npm run lint` corre con `--fix` sobre todo el repo; (3) fechar la entrada con la fecha real de hoy.

## 2026-09-06 - [Batch de saves y del en propagacion de panelistas]
**Learning:** `ProgramsService.addPanelist` y `removePanelist` propagaban el cambio a los programas del mismo `link_group_id` con un `save()` y un `del()` por iteracion (N+1 de DB y de Redis). `removePanelist` ademas guardaba e invalidaba cache de programas que no habian cambiado.
**Action:** Acumular las entidades modificadas en un array y hacer un unico `repository.save(array)` + un unico `redisService.del(keys)` fuera del loop, y solo encolar la entidad si realmente cambio (comparar longitud antes/despues del filter).

## 2026-09-06 - [mget tipado en vez de pipeline crudo]
**Learning:** `WeeklyOverridesService` usaba `(this.redisService as any).client.pipeline()` en tres lugares para leer N claves, con parseo manual de JSON y manejo de tuplas `[err, value]`. El cast a `any` esquivaba el tipado y duplicaba logica que `RedisService.mget<T>()` ya provee.
**Action:** Usar `redisService.mget<T>(keys)`, que devuelve `(T | null)[]` en el mismo orden. Al migrar, `mget` quedo con `JSON.parse` tolerante por clave: antes un valor corrupto solo salteaba esa clave y ahora no debe tumbar el batch entero.

## 2026-09-06 - [Push concurrente en StreamerSubscriptionService]
**Learning:** `notifySubscribers` mandaba las push notifications con `await` dentro de un triple loop, serializando una llamada de red por suscripcion. `PushService.sendNotificationToDevices` ya resolvia esto con IIAFEs + `Promise.all`.
**Action:** Encolar cada envio como funcion async auto-invocada con su propio try/catch y esperar todo con `Promise.allSettled`, siguiendo el patron que ya existia en `push.service.ts`.
