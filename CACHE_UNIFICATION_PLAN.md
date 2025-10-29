# Cache Unification Plan: liveStreamsByChannel → liveStatusByHandle

## Current State Analysis

### Two Cache Keys:
1. **`liveStreamsByChannel:${handle}`** - Contains `LiveStreamsResult`
   - Structure: `{ streams: LiveStream[], primaryVideoId: string, streamCount: number }`
   - TTL: Block-based (from schedules)
   
2. **`liveStatusByHandle:${handle}`** - Contains `LiveStatusCache`
   - Structure: `{ channelId, handle, isLive, streamUrl, videoId, lastUpdated, ttl, blockEndTime, validationCooldown, lastValidation, streams, streamCount }`
   - TTL: Block-based (from schedules)
   - **Already includes streams data!** ✅

### Key Insight
`LiveStatusCache` **already includes** all data from `LiveStreamsResult` plus metadata:
- `streams` ✅
- `streamCount` ✅  
- Plus: `isLive`, `streamUrl`, `videoId`, cooldowns, etc.

## Usage Locations

### `liveStreamsByChannel` WRITE locations:
1. `youtube-live.service.ts:471` - `getBatchLiveStreams` (after batch fetch)
2. `youtube-live.service.ts:539` - `getBatchLiveStreams` (after individual fetch)
3. `youtube-live.service.ts:660+` - `getLiveStreamsInternal` (after search API)
4. `schedules.service.ts:399` - `enrichSchedulesForChannel` (batch results)

### `liveStreamsByChannel` READ locations:
1. `youtube-live.service.ts:139` - `getLiveVideoId` (cache check)
2. `youtube-live.service.ts:293` - `getBatchLiveStreams` (cache check)
3. `youtube-live.service.ts:616` - `getLiveStreamsInternal` (cache check)
4. `youtube-live.service.ts:1022` - `validateCachedVideoId` (validation)
5. `live-status-background.service.ts:342` - `updateChannelLiveStatus` (sync check)
6. `live-status-background.service.ts:180` - `getLiveStatusForChannels` (fallback sync)
7. `schedules.service.ts:402` - `enrichSchedulesForChannel` (cache check)

### `liveStreamsByChannel` DELETE locations:
1. `youtube-live.service.ts:93` - `getLiveVideoId` (when not live)
2. `youtube-live.service.ts:272` - `getLiveStreamsMain` spec (when not live)
3. `youtube-live.service.ts:657` - `getLiveStreamsInternal` (when not live)
4. `live-status-background.service.ts:362` - `updateChannelLiveStatus` (when validation fails)

### `liveStatusByHandle` WRITE locations:
1. `live-status-background.service.ts:325` - `updateChannelLiveStatus` (not live)
2. `live-status-background.service.ts:347` - `updateChannelLiveStatus` (from streams)
3. `live-status-background.service.ts:389` - `updateChannelLiveStatus` (from API)
4. `live-status-background.service.ts:205` - `getLiveStatusForChannels` (sync from streams)

### `liveStatusByHandle` READ locations:
1. `live-status-background.service.ts:151` - `getCachedLiveStatus`
2. `live-status-background.service.ts:172` - `getLiveStatusForChannels`
3. `live-status-background.service.ts:339` - `updateChannelLiveStatus`
4. `optimized-schedules.service.ts:96` - `enrichWithCachedLiveStatus`

### `liveStatusByHandle` DELETE locations:
1. `live-status-background.service.ts:363` - `updateChannelLiveStatus` (when validation fails)
2. `channels.service.ts:497` - `invalidateLiveStatusCaches` (handle/ID change)

## Unification Strategy

### Phase 1: Extend LiveStatusCache to match all use cases
- Ensure `LiveStatusCache` can represent all states (including `null` for not-found)
- Add helper methods to convert between formats

### Phase 2: Update all WRITE locations
- Replace `liveStreamsByChannel` writes with `liveStatusByHandle` writes
- Ensure all metadata (cooldowns, blockEndTime) is preserved

### Phase 3: Update all READ locations
- Replace `liveStreamsByChannel` reads with `liveStatusByHandle` reads
- Add fallback logic for backward compatibility during migration

### Phase 4: Remove old cache key
- Remove all `liveStreamsByChannel` references
- Clean up old cache entries

## Invalidation Strategy

### When to invalidate `liveStatusByHandle`:
1. ✅ Channel handle changes → Delete old handle cache
2. ✅ YouTube channel ID changes → Delete handle cache (wrong ID was cached)
3. ✅ Video ID validation fails → Delete cache (fetch new streams)
4. ✅ Program ends → Mark as not live (don't delete, just update)

### Current invalidation locations:
- `channels.service.ts:invalidateLiveStatusCaches` - Both keys deleted together ✅

## Migration Benefits

1. **Single Source of Truth** - One cache entry with all data
2. **Eliminates Sync Issues** - No more mismatch between two caches
3. **Simpler Logic** - One cache key to manage
4. **Better Metadata** - Cooldowns, blockEndTime always available

