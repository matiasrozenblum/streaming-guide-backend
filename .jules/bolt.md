## 2024-05-19 - [Optimize Redis reads in getLiveStatusForChannels]
**Learning:** Sequential `await redisService.get()` operations inside loops (like the `for (const handle of handles)` iteration in `LiveStatusBackgroundService.getLiveStatusForChannels`) create classic N+1 network latency bottlenecks, especially when fetching live status for dozens of channels simultaneously.
**Action:** Always pre-fetch batched keys using `await this.redisService.mget(cacheKeys)` before iterating, then map the O(1) indexed results inside the loop to maintain fast, constant-time I/O characteristics.
