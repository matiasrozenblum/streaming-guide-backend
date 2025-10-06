#!/bin/bash

echo "🧪 Testing Staging API Performance..."
echo "====================================="

# Test today's schedules with live status
echo "📅 Testing /channels/with-schedules/today?live_status=true"
time curl -s -w "\nTime: %{time_total}s\n" \
  "https://api-staging.laguiadelstreaming.com/channels/with-schedules/today?live_status=true" \
  | head -5

echo ""
echo "📅 Testing /channels/with-schedules/week?live_status=true"
time curl -s -w "\nTime: %{time_total}s\n" \
  "https://api-staging.laguiadelstreaming.com/channels/with-schedules/week?live_status=true" \
  | head -5

echo ""
echo "📅 Testing /channels/with-schedules/today?live_status=false"
time curl -s -w "\nTime: %{time_total}s\n" \
  "https://api-staging.laguiadelstreaming.com/channels/with-schedules/today?live_status=false" \
  | head -5

echo ""
echo "✅ Staging performance test completed!"
echo "Expected results:"
echo "- live_status=true should be ~2-3 seconds (new system)"
echo "- live_status=false should be ~2 seconds (same as before)"
echo "- If live_status=true takes 15+ seconds, it's still using the old system"
