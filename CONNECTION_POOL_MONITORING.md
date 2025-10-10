# Database Connection Pool Monitoring

## 🎯 Overview

The Connection Pool Monitor tracks database connection usage in real-time to help validate that the cache optimization is working and detect connection issues early.

## 📊 Automatic Logging (Every Minute)

Once deployed, you'll see logs like this every minute:

### ✅ Healthy State (After Cache Optimization)
```bash
[DB-POOL] 📊 Status: Active: 2/50 (4.0%) | Idle: 3 | Waiting: 0 | Total: 5
[DB-POOL] 📊 Status: Active: 1/50 (2.0%) | Idle: 4 | Waiting: 0 | Total: 5
[DB-POOL] 📊 Status: Active: 3/50 (6.0%) | Idle: 2 | Waiting: 0 | Total: 5
```

**Indicators:**
- ✅ Active connections: 1-5 (very low, cache is working!)
- ✅ Utilization: 2-10% (excellent)
- ✅ Waiting: 0 (no requests waiting for connections)

### ⚠️ High Load (Before Optimization or Problems)
```bash
⚠️  [DB-POOL] High utilization detected: 42/50 connections in use (84.0%)
🚨 [DB-POOL] 3 requests waiting for database connections!
```

**Indicators:**
- ⚠️ Active connections: 40+ (cache not working or traffic spike)
- ⚠️ Utilization: >80% (needs investigation)
- 🚨 Waiting: >0 (immediate problem - connection pool exhausted)

## 🔍 Metrics Explained

| Metric | Description | Good Value | Bad Value |
|--------|-------------|------------|-----------|
| **Active** | Connections currently executing queries | 1-10 | 40+ |
| **Idle** | Available connections in pool | 40-49 | 0-5 |
| **Waiting** | Requests waiting for a connection | 0 | >0 |
| **Total** | Total connections created | 5-10 | 50 |
| **Utilization %** | Active / Max pool size | <10% | >80% |

## 🌐 API Endpoint

### Check Pool Status On-Demand

```bash
# Get current pool status
curl http://localhost:8080/db-pool-status

# Or in staging
curl https://staging.laguiadelstreaming.com/db-pool-status
```

**Response:**
```json
{
  "status": "ok",
  "pool": {
    "total": 5,
    "idle": 3,
    "waiting": 0,
    "active": 2,
    "max": 50,
    "utilizationPercent": "4.0"
  },
  "health": {
    "isHealthy": true,
    "utilizationPercent": "4.0",
    "hasWaitingRequests": false
  },
  "timestamp": "2025-10-10T12:00:00.000Z"
}
```

### Integration with Monitoring Tools

You can set up automated monitoring:

```bash
# Check every 30 seconds and alert if unhealthy
while true; do
  STATUS=$(curl -s http://localhost:8080/db-pool-status | jq -r '.health.isHealthy')
  if [ "$STATUS" != "true" ]; then
    echo "🚨 ALERT: Database pool unhealthy!"
    # Send alert to Slack, PagerDuty, etc.
  fi
  sleep 30
done
```

## 📈 Interpreting Results

### Scenario 1: Cache Working Perfectly ✅
```
Active: 2/50 (4%)  - Only cache warming and CRUD operations hit DB
Idle: 48           - Almost all connections available
Waiting: 0         - No requests waiting
```

### Scenario 2: Cache Miss or Heavy CRUD ⚠️
```
Active: 15/50 (30%)  - Multiple requests hitting DB
Idle: 35             - Still plenty available
Waiting: 0           - Capacity to handle load
```

### Scenario 3: Problem - Cache Not Working 🚨
```
Active: 45/50 (90%)  - Too many DB queries
Idle: 5              - Almost no connections available
Waiting: 10          - Requests waiting, timeouts likely
```

**Action Required:**
1. Check cache hit ratio: `grep "SCHEDULES-CACHE.*HIT" logs | wc -l`
2. Check for cache misses: `grep "SCHEDULES-CACHE.*MISS" logs | wc -l`
3. Verify cache warming is working: `grep "CACHE-WARM" logs`

### Scenario 4: Traffic Spike (Normal) ⚡
```
Active: 25/50 (50%)  - Temporary spike
Idle: 25             - Adequate capacity
Waiting: 0           - Handling load well
```

**Action:** Monitor for 5 minutes. Should return to 5-10% utilization if cache is working.

## 🔧 Troubleshooting

### High Utilization Despite Cache

If you see consistently high connection usage (>30%) after cache optimization:

1. **Check cache hit ratio:**
```bash
grep "SCHEDULES-CACHE" logs.txt | grep "HIT" | wc -l
grep "SCHEDULES-CACHE" logs.txt | grep "MISS" | wc -l
# Should be >95% hits
```

2. **Verify cache warming:**
```bash
grep "CACHE-WARM.*completed" logs.txt
# Should see one after each CRUD operation
```

3. **Check for slow queries:**
```bash
grep "Slow database query" logs.txt
# Should be rare
```

4. **Look for connection leaks:**
```bash
# If Total keeps growing over time, investigate
[DB-POOL] Total: 10
[DB-POOL] Total: 15
[DB-POOL] Total: 25  # Growing = potential leak
```

### Requests Waiting for Connections

If you see `Waiting: >0` consistently:

1. **Immediate:** Check if it's a temporary spike or sustained issue
2. **Short-term:** Increase pool size temporarily (max: 70-80)
3. **Long-term:** Investigate why cache isn't preventing DB queries

## 📊 Expected Behavior Timeline

### Before Cache Optimization
```
00:00 - Active: 18/20 (90%) | Waiting: 5 | Idle: 2
00:01 - Active: 20/20 (100%) | Waiting: 12 | Idle: 0  🚨
00:02 - Active: 19/20 (95%) | Waiting: 8 | Idle: 1
```

### After Cache Optimization
```
00:00 - Active: 2/50 (4%) | Waiting: 0 | Idle: 48  ✅
00:01 - Active: 3/50 (6%) | Waiting: 0 | Idle: 47  ✅
00:02 - Active: 1/50 (2%) | Waiting: 0 | Idle: 49  ✅
```

### After CRUD Operation (Cache Warming)
```
10:00 - Admin updates schedule
10:00 - Active: 1/50 (2%) - CRUD operation
10:00 - Active: 2/50 (4%) - Cache warming starts (async)
10:00 - Active: 3/50 (6%) - Cache warming in progress
10:01 - Active: 1/50 (2%) - Cache warming complete, back to normal
```

## 🎯 Success Metrics

After deploying the cache optimization, monitor for 1 hour and verify:

- ✅ Average utilization: <10%
- ✅ Peak utilization: <30%
- ✅ Waiting requests: 0 (99% of the time)
- ✅ Active connections: 1-10 (typical)
- ✅ Total connections: stabilizes at 5-15

## 🚀 Quick Commands

```bash
# Watch pool status in real-time
watch -n 5 'curl -s http://localhost:8080/db-pool-status | jq'

# Monitor logs for pool alerts
tail -f logs.txt | grep "DB-POOL"

# Get average utilization over last 100 logs
grep "DB-POOL.*Status" logs.txt | tail -100 | \
  grep -oP 'Active: \K\d+(?=/)' | \
  awk '{sum+=$1; count++} END {print "Avg active:", sum/count}'

# Check for any pool warnings
grep -E "High utilization|waiting for" logs.txt
```

---

**Created:** October 10, 2025  
**Purpose:** Validate cache optimization effectiveness  
**Expected Result:** 90%+ reduction in connection pool usage

