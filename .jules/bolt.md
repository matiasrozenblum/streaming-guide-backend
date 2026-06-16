## 2023-10-27 - Redis MGET optimizations for loops

**Learning:** When retrieving tracking or status keys from Redis iteratively within a loop (e.g. tracking `notFoundAttempts` or checking caches inside a `Promise.all`), NestJS services hit an N+1 performance bottleneck. Redis client operations inside loop iterations create sequential round-trip delays, increasing total response time linearly with the number of looped items.

**Action:** Consolidate iterative Redis reads into a single `RedisService.mget` call using a mapped array of keys before entering the loop or Map assignments. Always check if the array of keys `length > 0` before making the `mget` request to avoid passing an empty array to Redis.
