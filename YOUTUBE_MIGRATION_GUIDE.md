# 🚀 YouTube Live Stream Cache Migration Guide

## Overview

This guide covers the migration from the legacy single video ID cache structure to the new multiple streams structure that supports concurrent live streams from the same YouTube channel.

## 🎯 What This Migration Solves

**Before (Legacy):**
- One live video ID per channel: `liveVideoIdByChannel:${channelId} → "single_video_id"`
- Only the first live stream was captured
- Multiple concurrent streams caused wrong stream URLs

**After (New):**
- Multiple live streams per channel: `liveStreamsByChannel:${channelId} → [LiveStream[]]`
- Intelligent stream matching based on program names and timing
- Support for unlimited concurrent live streams

## 🔄 Migration Strategy

### Phase 1: Deploy with Dual Cache (Zero Downtime)
- New system writes to both old and new cache keys
- Legacy system continues to work during transition
- Automatic migration of existing cache entries

### Phase 2: Switch to New System
- All requests use new cache structure
- Legacy cache entries expire naturally
- Monitor for any issues

### Phase 3: Cleanup (Optional)
- Remove legacy cache entries
- Clean up migration code

## 📋 Pre-Deployment Checklist

- [ ] Backend code deployed to staging
- [ ] Redis has sufficient memory for dual cache
- [ ] YouTube API quotas are adequate
- [ ] Monitoring and alerting configured
- [ ] Rollback plan prepared

## 🚀 Deployment Steps

### Step 1: Deploy Backend Code
```bash
# Deploy to staging first
git push origin main
# Verify deployment successful
```

### Step 2: Run Migration
```bash
# Check current status
npm run youtube:migrate -- --status

# Migrate all channels
npm run youtube:migrate -- --all

# Verify migration success
npm run youtube:migrate -- --status
```

### Step 3: Monitor System
- Watch for errors in logs
- Verify live streams are working correctly
- Check Redis memory usage

### Step 4: Production Deployment
```bash
# Deploy to production
git push origin main

# Run migration on production
npm run youtube:migrate -- --all
```

## 🔧 Migration Commands

### Check Migration Status
```bash
# Build the project first
npm run build

# Check status
node migrate-youtube-cache.js status
```

### Migrate All Channels
```bash
# Migrate all channels
node migrate-youtube-cache.js migrate
```

### Migrate Specific Channel
```bash
# For specific channels, use the migration utility in code
# or modify the migration script to accept channel ID parameter
```

### Clean Up Legacy Cache (After Verification)
```bash
# Clean up legacy cache
node migrate-youtube-cache.js cleanup
```

### Emergency Rollback
```bash
# Rollback migration
node migrate-youtube-cache.js rollback
```

## 📊 Expected Migration Results

### Successful Migration
```
🔄 Starting Redis cache migration...
📊 Found 15 legacy cache entries to migrate
✅ Migrated channel UCgLBmUFPO8JtZ1nPIBQGMlQ: hP6BCvs-3WY (TTL: 3600s)
✅ Migration completed: 15/15 channels migrated successfully
```

### Migration Status
```
📊 Migration Status:
Legacy entries: 0
New entries: 15
Migrated channels: 15
Pending channels: 0

📋 Channel Details:
✅ UCgLBmUFPO8JtZ1nPIBQGMlQ: migrated
✅ UCQW-S_sTfKC-q13-wyI8AkA: migrated
```

## 🚨 Troubleshooting

### Migration Fails
```bash
# Check Redis connection
redis-cli ping

# Check Redis memory
redis-cli info memory

# Check specific channel
npm run youtube:migrate -- --channel <channelId>
```

### Stream Matching Issues
- Verify program names are descriptive
- Check YouTube API responses
- Review confidence scores in logs

### Performance Issues
- Monitor Redis memory usage
- Check YouTube API quotas
- Review cron job timing

## 🔍 Monitoring & Verification

### Key Metrics to Watch
- Redis memory usage
- YouTube API response times
- Stream matching success rates
- Error rates in logs

### Log Messages to Monitor
```
🎯 Best match found for @somosazz: hP6BCvs-3WY (confidence: 95%)
📌 Cached 2 live streams for @somosazz (TTL 3600s)
✅ Migration completed for @somosazz: hP6BCvs-3WY
```

### Verification Tests
1. **Single Stream**: Verify existing functionality works
2. **Multiple Streams**: Test with AZZ channel (River vs Boca)
3. **Cache Persistence**: Verify streams persist across requests
4. **Fallback Logic**: Test when no good match found

## 🆘 Rollback Plan

### Emergency Rollback
```bash
# Rollback to legacy format
npm run youtube:migrate -- --rollback

# Verify rollback success
npm run youtube:migrate -- --status
```

### What Rollback Does
- Restores legacy cache structure
- Deletes new cache entries
- System returns to previous behavior

### Rollback Triggers
- High error rates
- Performance degradation
- Stream matching failures
- YouTube API issues

## 📈 Post-Migration Benefits

### For Users
- Correct live stream URLs for each program
- No more wrong stream when clicking YouTube button
- Better experience with concurrent streams

### For System
- More accurate stream matching
- Better cache utilization
- Future-proof for multiple streams
- Improved monitoring and debugging

### For Developers
- Better stream matching algorithms
- Comprehensive logging
- Easy troubleshooting
- Flexible architecture

## 🔮 Future Enhancements

### Potential Improvements
- Machine learning for stream matching
- User preference-based matching
- Advanced content analysis
- Real-time stream quality metrics

### Monitoring Enhancements
- Stream matching success dashboards
- YouTube API quota tracking
- Performance analytics
- User experience metrics

## 📞 Support

### During Migration
- Monitor logs closely
- Have rollback plan ready
- Test thoroughly in staging

### After Migration
- Monitor for 24-48 hours
- Watch for edge cases
- Collect user feedback

### Contact
- Backend team for technical issues
- DevOps for deployment support
- Product team for user experience

---

**Remember**: This migration is designed for zero-downtime deployment. The system will work with both old and new cache structures during the transition period.
