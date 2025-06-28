import fetch from 'node-fetch';

// Note: This should be a PRIVATE API key from PostHog, not the public key used in frontend
// Get it from: PostHog Project Settings > Project API Keys > Private API Key
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';

if (!POSTHOG_API_KEY) {
  console.warn('⚠️  POSTHOG_API_KEY environment variable is not set. YouTube click data will not be available in reports.');
}

export type PostHogClickEvent = {
  event: string;
  properties: {
    channel_name?: string;
    program_name?: string;
    user_gender?: string;
    user_age?: number;
    user_id?: string;
    [key: string]: any;
  };
  timestamp: string;
};

export async function fetchYouTubeClicks({
  from,
  to,
  eventType,
  breakdownBy = 'channel_name',
  limit = 10000,
}: {
  from: string;
  to: string;
  eventType: 'click_youtube_live' | 'click_youtube_deferred';
  breakdownBy?: 'channel_name' | 'program_name';
  limit?: number;
}): Promise<PostHogClickEvent[]> {
  if (!POSTHOG_API_KEY) {
    console.warn(`⚠️  Skipping PostHog API call for ${eventType} - no API key configured`);
    return [];
  }

  try {
    // PostHog API: /api/projects/:project_id/events
    // We'll use /api/event for querying events
    // Docs: https://posthog.com/docs/api/events
    const url = `${POSTHOG_API_HOST}/api/projects/@current/events?event=${eventType}&after=${from}T00:00:00Z&before=${to}T23:59:59Z&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${POSTHOG_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(`PostHog API error: 401 Unauthorized - Please check your POSTHOG_API_KEY environment variable. Make sure you're using a PRIVATE API key, not the public key.`);
      }
      throw new Error(`PostHog API error: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    // data.results is an array of events
    return data.results as PostHogClickEvent[];
  } catch (error) {
    console.error(`❌ Error fetching PostHog data for ${eventType}:`, error);
    // Return empty array instead of throwing to prevent report generation from failing
    return [];
  }
}

export async function aggregateClicksBy(
  events: PostHogClickEvent[],
  groupBy: 'channel_name' | 'program_name',
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const ev of events) {
    const key = ev.properties[groupBy] || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
} 