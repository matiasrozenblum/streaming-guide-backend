import fetch from 'node-fetch';

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || 'phc_ioX3gwDuENT8MoUWSacARsCFVE6bSbKaEh5u7Mie5oK';
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://app.posthog.com';

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
    throw new Error(`PostHog API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // data.results is an array of events
  return data.results as PostHogClickEvent[];
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