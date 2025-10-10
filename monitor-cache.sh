#!/bin/bash

# Cache Performance Monitoring Script
# Usage: ./monitor-cache.sh [log-file]

LOG_FILE="${1:-/dev/stdin}"

echo "🔍 Cache Performance Monitor"
echo "=============================="
echo ""

# If reading from file, use tail -f for live monitoring
if [ "$LOG_FILE" != "/dev/stdin" ]; then
  echo "📊 Monitoring $LOG_FILE (Press Ctrl+C to stop)"
  echo ""
  
  # Initial stats
  echo "📈 Current Statistics:"
  echo ""
  
  CACHE_HITS=$(grep -c "SCHEDULES-CACHE.*HIT" "$LOG_FILE" 2>/dev/null || echo "0")
  CACHE_MISSES=$(grep -c "SCHEDULES-CACHE.*MISS" "$LOG_FILE" 2>/dev/null || echo "0")
  DB_QUERIES=$(grep -c "SCHEDULES-DB.*Starting query" "$LOG_FILE" 2>/dev/null || echo "0")
  LOCKS_ACQUIRED=$(grep -c "Lock acquired" "$LOG_FILE" 2>/dev/null || echo "0")
  LOCKS_WAITED=$(grep -c "Lock held by another request" "$LOG_FILE" 2>/dev/null || echo "0")
  CACHE_WARMS=$(grep -c "CACHE-WARM.*completed" "$LOG_FILE" 2>/dev/null || echo "0")
  
  TOTAL_REQUESTS=$((CACHE_HITS + CACHE_MISSES))
  
  if [ $TOTAL_REQUESTS -gt 0 ]; then
    HIT_RATIO=$(awk "BEGIN {printf \"%.2f\", ($CACHE_HITS / $TOTAL_REQUESTS) * 100}")
    echo "✅ Cache Hit Ratio: ${HIT_RATIO}% ($CACHE_HITS hits / $TOTAL_REQUESTS requests)"
  else
    echo "⏳ Waiting for requests..."
  fi
  
  echo "❌ Cache Misses: $CACHE_MISSES"
  echo "🗄️  Database Queries: $DB_QUERIES"
  echo "🔒 Locks Acquired: $LOCKS_ACQUIRED"
  echo "⏱️  Locks Waited: $LOCKS_WAITED"
  echo "🔥 Cache Warms: $CACHE_WARMS"
  echo ""
  
  # Check for problems
  SLOW_QUERIES=$(grep -c "Slow database query" "$LOG_FILE" 2>/dev/null || echo "0")
  TIMEOUTS=$(grep -c "timeout" "$LOG_FILE" 2>/dev/null || echo "0")
  
  if [ $SLOW_QUERIES -gt 0 ]; then
    echo "⚠️  WARNING: $SLOW_QUERIES slow queries detected!"
  fi
  
  if [ $TIMEOUTS -gt 0 ]; then
    echo "🚨 ERROR: $TIMEOUTS timeouts detected!"
  fi
  
  echo ""
  echo "📝 Live Log Stream (last 50 cache-related lines):"
  echo "=================================================="
  tail -f "$LOG_FILE" | grep --line-buffered -E "SCHEDULES-CACHE|SCHEDULES-DB|CACHE-WARM|Lock"
else
  # Pipe mode - just filter relevant logs
  grep --line-buffered -E "SCHEDULES-CACHE|SCHEDULES-DB|CACHE-WARM|Lock" | while IFS= read -r line; do
    if echo "$line" | grep -q "HIT"; then
      echo "✅ $line"
    elif echo "$line" | grep -q "MISS"; then
      echo "❌ $line"
    elif echo "$line" | grep -q "Lock acquired"; then
      echo "🔒 $line"
    elif echo "$line" | grep -q "Lock held"; then
      echo "⏱️  $line"
    elif echo "$line" | grep -q "CACHE-WARM"; then
      echo "🔥 $line"
    else
      echo "$line"
    fi
  done
fi

