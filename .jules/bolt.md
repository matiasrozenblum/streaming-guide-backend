## 2024-06-25 - [Batch Operations with Redis]
**Learning:** Sequential `mget` and `del` operations in a loop can cause O(N) network bottlenecks in Redis, especially when processing bulk keys obtained from streams (like `scanStream`).
**Action:** Always batch keys using chunk sizes (e.g. 500) and use `redisService.mget` and `redisService.del(string[])` to retrieve and delete chunks in singular network calls. When doing this, ensure that unit test file mocks are updated properly (e.g., adding `mget: jest.fn()` and mocking responses array appropriately).
