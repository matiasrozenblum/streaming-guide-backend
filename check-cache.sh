#!/bin/bash

echo "🔍 Checking Redis Cache Keys..."
echo "================================"

# Connect to Redis and check for new cache keys
redis-cli -h localhost -p 6379 keys "liveStatus:background:*" | head -10

echo ""
echo "📊 Cache key patterns to look for:"
echo "- liveStatus:background:CHANNEL_ID (new system)"
echo "- liveStreamsByChannel:CHANNEL_ID (existing system)"
echo "- schedules:all:monday (existing system)"

echo ""
echo "🔍 Checking cache contents for one channel:"
redis-cli -h localhost -p 6379 keys "liveStatus:background:*" | head -1 | xargs -I {} redis-cli -h localhost -p 6379 get {}
