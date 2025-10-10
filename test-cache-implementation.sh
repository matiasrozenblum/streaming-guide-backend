#!/bin/bash

# Test Cache Implementation Script
# This script tests the cache warming and thundering herd prevention

set -e

API_URL="${1:-http://localhost:8080}"
echo "🧪 Testing Cache Implementation"
echo "================================"
echo "API URL: $API_URL"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Single Request (Cache Population)
echo "📋 Test 1: Cache Population (First Request)"
echo "--------------------------------------------"
echo "Clearing cache first (if Redis available)..."
redis-cli FLUSHDB 2>/dev/null || echo "⚠️  Redis CLI not available, skipping cache clear"
echo ""

echo "Making first request (should miss cache)..."
START_TIME=$(date +%s%N)
curl -s "$API_URL/channels/with-schedules/week?live_status=true" > /tmp/test-response-1.json
END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo "✅ Request completed in ${DURATION}ms"
echo "💡 Expected: 1000-3000ms (database query)"
echo ""

# Test 2: Second Request (Cache Hit)
echo "📋 Test 2: Cache Hit (Second Request)"
echo "--------------------------------------"
sleep 1
echo "Making second request (should hit cache)..."
START_TIME=$(date +%s%N)
curl -s "$API_URL/channels/with-schedules/week?live_status=true" > /tmp/test-response-2.json
END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo "✅ Request completed in ${DURATION}ms"
if [ $DURATION -lt 200 ]; then
  echo -e "${GREEN}✅ PASS: Fast cache hit!${NC}"
else
  echo -e "${YELLOW}⚠️  WARN: Slower than expected (might not be cached)${NC}"
fi
echo ""

# Test 3: Concurrent Requests (Thundering Herd Prevention)
echo "📋 Test 3: Thundering Herd Prevention"
echo "--------------------------------------"
echo "Clearing cache..."
redis-cli FLUSHDB 2>/dev/null || echo "⚠️  Redis CLI not available"
echo ""

echo "Launching 10 concurrent requests..."
START_TIME=$(date +%s%N)
for i in {1..10}; do
  curl -s "$API_URL/channels/with-schedules/week" > /tmp/test-response-${i}.json &
done
wait
END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo "✅ All 10 requests completed in ${DURATION}ms"
echo "💡 Expected behavior:"
echo "   - All requests should complete successfully"
echo "   - Only 1 database query in logs (check with: grep 'SCHEDULES-DB.*Starting query' logs)"
echo "   - 9 requests should log 'Lock held by another request'"
echo ""

# Test 4: Data Integrity Check
echo "📋 Test 4: Data Integrity"
echo "-------------------------"
echo "Checking response structure..."

# Check if response has expected fields
if jq -e '.[0].channel.id' /tmp/test-response-2.json > /dev/null 2>&1; then
  echo -e "${GREEN}✅ PASS: Channel ID present${NC}"
else
  echo -e "${RED}❌ FAIL: Channel ID missing${NC}"
fi

if jq -e '.[0].channel.categories' /tmp/test-response-2.json > /dev/null 2>&1; then
  echo -e "${GREEN}✅ PASS: Categories present${NC}"
else
  echo -e "${YELLOW}⚠️  WARN: Categories missing or empty${NC}"
fi

if jq -e '.[0].schedules[0].program.panelists' /tmp/test-response-2.json > /dev/null 2>&1; then
  echo -e "${GREEN}✅ PASS: Panelists present${NC}"
else
  echo -e "${YELLOW}⚠️  WARN: Panelists missing or empty${NC}"
fi

# Count data
CHANNEL_COUNT=$(jq 'length' /tmp/test-response-2.json)
SCHEDULE_COUNT=$(jq '[.[].schedules[]] | length' /tmp/test-response-2.json)

echo ""
echo "📊 Data Summary:"
echo "   - Channels: $CHANNEL_COUNT"
echo "   - Schedules: $SCHEDULE_COUNT"
echo ""

# Test 5: Cache Warming After Update
echo "📋 Test 5: Cache Warming After CRUD"
echo "------------------------------------"
echo "⚠️  This requires admin authentication"
echo "💡 Manually test by:"
echo "   1. Update a schedule in backoffice"
echo "   2. Watch logs for:"
echo "      - '[CACHE-WARM] Starting cache warming...'"
echo "      - '[CACHE-WARM] Cache warming completed in XXXms'"
echo "   3. Make a request immediately after"
echo "   4. Should see '[SCHEDULES-CACHE] HIT' (warm cache)"
echo ""

# Summary
echo "======================================"
echo "🎉 Test Suite Complete!"
echo "======================================"
echo ""
echo "📊 What to check in logs:"
echo ""
echo "1. Cache Hit Ratio should be >95%:"
echo "   grep 'SCHEDULES-CACHE' logs.txt | grep -c 'HIT'"
echo "   grep 'SCHEDULES-CACHE' logs.txt | grep -c 'MISS'"
echo ""
echo "2. Lock usage (thundering herd prevention):"
echo "   grep 'Lock acquired' logs.txt"
echo "   grep 'Lock held by another request' logs.txt"
echo ""
echo "3. Cache warming after updates:"
echo "   grep 'CACHE-WARM' logs.txt"
echo ""
echo "4. Data completeness:"
echo "   grep 'Data completeness' logs.txt"
echo ""
echo "5. No timeouts or errors:"
echo "   grep -i 'timeout\\|error' logs.txt | grep -v 'error_type'"
echo ""
echo "📈 For continuous monitoring, run:"
echo "   ./monitor-cache.sh logs.txt"
echo ""

