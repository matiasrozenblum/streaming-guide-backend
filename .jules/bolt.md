## 2024-10-24 - [Redis mget performance bottleneck]
**Learning:** Promise.all() around config checks (which rely on Redis under the hood) create massive N+1 query structures when looping over dozens of channels to check flags and holiday states.
**Action:** Replicate or share batched checking mechanisms like the optimized V2 patterns when doing bulk updates/fetches on Redis caches. Replace any `for` loop executing sequential `redis.get` with batched `redis.mget` calls.
