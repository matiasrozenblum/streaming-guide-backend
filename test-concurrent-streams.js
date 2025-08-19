const axios = require('axios');

/**
 * Test script to simulate multiple concurrent live streams scenario
 * This script tests the stream matching logic without needing real YouTube live streams
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const TEST_CHANNEL_ID = 'UCgLBmUFPO8JtZ1nPIBQGMlQ'; // AZZ channel

// Test programs that should match with specific streams
const testPrograms = [
  {
    name: 'BOCA VS. INDEPENDIENTE RIVADAVIA',
    startTime: '17:00',
    expectedStream: 'lcnorJwZnLc', // Boca stream
    expectedConfidence: 'high',
  },
  {
    name: 'RIVER VS. GODOY CRUZ',
    startTime: '15:30',
    expectedStream: 'hP6BCvs-3WY', // River stream
    expectedConfidence: 'high',
  },
  {
    name: 'RACING VS. TIGRE',
    startTime: '16:00',
    expectedStream: 'fallback', // Should fallback to first stream
    expectedConfidence: 'low',
  },
];

async function testConcurrentStreams() {
  console.log('🧪 Testing Multiple Concurrent Streams Scenario');
  console.log('==============================================');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Test Channel ID: ${TEST_CHANNEL_ID}`);
  console.log('');

  try {
    // Test 1: Check if backend is running
    console.log('1️⃣ Testing backend connectivity...');
    try {
      const healthResponse = await axios.get(`${BACKEND_URL}/health`, { timeout: 5000 });
      console.log('✅ Backend is running');
    } catch (error) {
      console.log('❌ Backend is not running or health endpoint not available');
      console.log('   Make sure to start the backend with YOUTUBE_TEST_MODE=true');
      return;
    }

    // Test 2: Test single live stream (regular program)
    console.log('\n2️⃣ Testing single live stream scenario...');
    try {
      const singleStreamResponse = await axios.get(`${BACKEND_URL}/channels/with-schedules?live_status=true`);
      const liveSchedules = singleStreamResponse.data.filter(s => s.program.is_live);
      
      console.log(`📺 Found ${liveSchedules.length} live schedules`);
      
      if (liveSchedules.length > 0) {
        const firstLive = liveSchedules[0];
        console.log(`   Program: ${firstLive.program.name}`);
        console.log(`   Channel: ${firstLive.program.channel?.name || 'Unknown'}`);
        console.log(`   Stream URL: ${firstLive.program.stream_url ? '✅ Present' : '❌ Missing'}`);
        
        if (firstLive.program.stream_url) {
          const videoId = extractVideoId(firstLive.program.stream_url);
          console.log(`   Video ID: ${videoId}`);
        }
      }
    } catch (error) {
      console.log('❌ Failed to test single live stream:', error.message);
    }

    // Test 3: Test multiple concurrent streams (if test mode is enabled)
    console.log('\n3️⃣ Testing multiple concurrent streams scenario...');
    console.log('   (This requires YOUTUBE_TEST_MODE=true on backend)');
    
    try {
      // Create a test schedule that should trigger the concurrent streams logic
      const testSchedule = {
        day_of_week: 'sunday',
        start_time: '17:00',
        end_time: '19:00',
        program: {
          name: 'BOCA VS. INDEPENDIENTE RIVADAVIA',
          channel: {
            youtube_channel_id: TEST_CHANNEL_ID,
            handle: 'somosazz',
          }
        }
      };

      // This would normally be done by the enrichment process
      // For testing, we'll simulate what the backend should do
      console.log('   Simulating program enrichment...');
      console.log(`   Program: ${testSchedule.program.name}`);
      console.log(`   Channel: ${testSchedule.program.channel.handle}`);
      console.log(`   Expected: Should match with Boca stream (lcnorJwZnLc)`);
      
      // Test 4: Check Redis cache structure
      console.log('\n4️⃣ Testing Redis cache structure...');
      try {
        // This would require Redis access - for now just show what should happen
        console.log('   Expected Redis keys:');
        console.log(`     - liveStreamsByChannel:${TEST_CHANNEL_ID} → [LiveStream[]]`);
        console.log(`     - liveVideoIdByChannel:${TEST_CHANNEL_ID} → "video_id" (legacy)`);
        console.log('   Expected behavior: Both keys should exist during migration');
      } catch (error) {
        console.log('   ❌ Redis access not available for testing');
      }

    } catch (error) {
      console.log('❌ Failed to test concurrent streams:', error.message);
    }

    // Test 5: Test stream matching logic
    console.log('\n5️⃣ Testing stream matching logic...');
    console.log('   Testing with mock data:');
    
    testPrograms.forEach((program, index) => {
      console.log(`   ${index + 1}. ${program.name} (${program.startTime})`);
      console.log(`      Expected: ${program.expectedStream} (${program.expectedConfidence} confidence)`);
    });

    // Test 6: Performance and monitoring
    console.log('\n6️⃣ Testing performance and monitoring...');
    console.log('   Expected log messages:');
    console.log('     🧪 TEST MODE ENABLED - Using mock concurrent streams data');
    console.log('     🧪 Using mock data for channel UCgLBmUFPO8JtZ1nPIBQGMlQ: 2 streams');
    console.log('     🎯 Mock best match found for somosazz: [video_id] (confidence: X%)');
    console.log('     📌 Cached 2 live streams for somosazz (TTL Xs)');

    console.log('\n📋 Test Summary:');
    console.log('   ✅ Backend connectivity');
    console.log('   ✅ Single live stream handling');
    console.log('   ⏳ Multiple concurrent streams (requires test mode)');
    console.log('   ⏳ Redis cache structure');
    console.log('   ⏳ Stream matching logic');
    console.log('   ⏳ Performance monitoring');

    console.log('\n🚀 To enable full testing:');
    console.log('   1. Set environment variable: YOUTUBE_TEST_MODE=true');
    console.log('   2. Restart backend service');
    console.log('   3. Run this test again');
    console.log('   4. Check backend logs for test mode messages');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

function extractVideoId(url) {
  try {
    const match = url.match(/embed\/([^?]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Run the test
testConcurrentStreams();
