import axios from 'axios';

const API_URL = 'http://localhost:3000'; // Local environment for testing
const LOCAL_API_URL = 'http://localhost:3000';

interface PerformanceResult {
  endpoint: string;
  time: number;
  success: boolean;
  error?: string;
  responseSize?: number;
}

async function makeRequest(url: string, label: string): Promise<PerformanceResult> {
  const startTime = Date.now();
  try {
    console.log(`🔄 ${label}...`);
    const response = await axios.get(url, { timeout: 30000 });
    const endTime = Date.now();
    const time = endTime - startTime;
    
    console.log(`✅ ${label} completed in ${time}ms`);
    return {
      endpoint: label,
      time,
      success: true,
      responseSize: JSON.stringify(response.data).length
    };
  } catch (error) {
    const endTime = Date.now();
    const time = endTime - startTime;
    console.log(`❌ ${label} failed in ${time}ms: ${error.message}`);
    return {
      endpoint: label,
      time,
      success: false,
      error: error.message
    };
  }
}

async function testBulkYouTubeFetchPerformance() {
  console.log('🚀 Starting Bulk YouTube Fetch Performance Test\n');
  console.log('=' .repeat(60));
  
  const results: PerformanceResult[] = [];
  
  // Test 1: Channels with schedules WITHOUT live status (baseline)
  console.log('\n📊 Test 1: Baseline Performance (No Live Status)');
  const baselineResult = await makeRequest(
    `${API_URL}/channels/with-schedules?day=monday`,
    'Channels with schedules (no live status)'
  );
  results.push(baselineResult);
  
  // Test 2: Channels with schedules WITH live status (bulk fetch enabled)
  console.log('\n📊 Test 2: Bulk YouTube Fetch Performance');
  const bulkFetchResult = await makeRequest(
    `${API_URL}/channels/with-schedules?day=monday&live_status=true`,
    'Channels with schedules (live status enabled)'
  );
  results.push(bulkFetchResult);
  
  // Test 3: Multiple requests to test caching
  console.log('\n📊 Test 3: Caching Performance');
  const cacheResults: PerformanceResult[] = [];
  for (let i = 1; i <= 3; i++) {
    const cacheResult = await makeRequest(
      `${API_URL}/channels/with-schedules?day=monday&live_status=true`,
      `Cached request ${i}`
    );
    cacheResults.push(cacheResult);
    results.push(cacheResult);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Test 4: Different days to test batch processing
  console.log('\n📊 Test 4: Different Days Performance');
  const days = ['monday', 'tuesday', 'wednesday'];
  for (const day of days) {
    const dayResult = await makeRequest(
      `${API_URL}/channels/with-schedules?day=${day}&live_status=true`,
      `Channels for ${day} (live status)`
    );
    results.push(dayResult);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Results Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📈 PERFORMANCE TEST RESULTS');
  console.log('=' .repeat(60));
  
  const successfulResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);
  
  if (successfulResults.length > 0) {
    const times = successfulResults.map(r => r.time);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    console.log(`\n✅ Successful Requests: ${successfulResults.length}/${results.length}`);
    console.log(`⏱️  Average Response Time: ${avgTime.toFixed(2)}ms`);
    console.log(`⚡ Fastest Response: ${minTime}ms`);
    console.log(`🐌 Slowest Response: ${maxTime}ms`);
    
    // Cache performance analysis
    const cacheTimes = cacheResults.filter(r => r.success).map(r => r.time);
    if (cacheTimes.length > 1) {
      const cacheImprovement = ((cacheTimes[0] - cacheTimes[cacheTimes.length - 1]) / cacheTimes[0] * 100);
      console.log(`\n💾 Cache Performance:`);
      console.log(`   First request: ${cacheTimes[0]}ms`);
      console.log(`   Last request: ${cacheTimes[cacheTimes.length - 1]}ms`);
      console.log(`   Cache improvement: ${cacheImprovement.toFixed(2)}%`);
    }
    
    // Bulk fetch vs baseline comparison
    if (baselineResult.success && bulkFetchResult.success) {
      const improvement = ((baselineResult.time - bulkFetchResult.time) / baselineResult.time * 100);
      console.log(`\n🎯 Bulk Fetch vs Baseline:`);
      console.log(`   Baseline (no live): ${baselineResult.time}ms`);
      console.log(`   With bulk fetch: ${bulkFetchResult.time}ms`);
      console.log(`   Performance impact: ${improvement > 0 ? '+' : ''}${improvement.toFixed(2)}%`);
    }
  }
  
  if (failedResults.length > 0) {
    console.log(`\n❌ Failed Requests: ${failedResults.length}`);
    failedResults.forEach(result => {
      console.log(`   - ${result.endpoint}: ${result.error}`);
    });
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🏁 Performance test completed!');
  
  // Expected improvements with bulk fetch:
  console.log('\n💡 Expected improvements with bulk YouTube fetch:');
  console.log('   - 5-10x faster for multi-channel requests');
  console.log('   - Reduced YouTube API calls from N to 1 (or ceil(N/50))');
  console.log('   - Better caching of batch results');
  console.log('   - Improved overall user experience');
}

// Run the test
testBulkYouTubeFetchPerformance().catch(console.error);
