/**
 * Utility function to generate service URLs from usernames
 * For Twitch and Kick, we can construct the URL from the username
 */
export function generateServiceUrl(service: 'twitch' | 'kick' | 'youtube', username: string): string {
  if (!username) {
    throw new Error(`Username is required for ${service} service`);
  }

  switch (service) {
    case 'twitch':
      return `https://www.twitch.tv/${username}`;
    case 'kick':
      return `https://kick.com/${username}`;
    case 'youtube':
      // YouTube URLs are more complex (videos, channels, etc.), so we don't auto-generate
      throw new Error('YouTube URLs cannot be auto-generated from username');
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

