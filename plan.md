1. **Optimize `getWebhookStatus` in `src/streamers/streamers.service.ts`**
   - Currently, inside the loop over `streamer.services`, there are individual `redisService.get` calls for `stream.online`, `stream.offline`, and Kick webhooks.
   - This leads to N+1 Redis queries. We can batch `mget` all the keys in `getWebhookStatus` itself to prevent N+1 Redis queries.
   - Also, `this.webhookSubscriptionService.getTwitchEventSubSubscriptions()` is called inside the loop for EVERY twitch service. The method could fetch the API subscriptions once, outside the loop if any twitch service exists.

   Implementation:
   - Identify all Twitch and Kick keys needed by iterating through `streamer.services`.
   - Batch fetch all Redis cache values using `this.redisService.mget`.
   - If there are any Twitch services, fetch `apiSubscriptions = await this.webhookSubscriptionService.getTwitchEventSubSubscriptions()` once before processing the loop over services.

2. **Pre commit step**
   - Run `pre_commit_instructions` to ensure proper testing, verification, review, and reflection are done.

3. **Verify and submit**
   - Verify the PR locally using test suites and manually via code review.
   - Run `submit` with a good branch name and description.
