# Kick Subscription 403 Forbidden Troubleshooting

## Problem
The subscription endpoint `POST /api/v2/event-subscriptions` returns 403 Forbidden even though:
- ✅ User ID fetch works (public endpoint)
- ✅ App access token is set
- ✅ All required fields are provided

## Possible Causes

### 1. Invalid or Expired Token
The `KICK_APP_ACCESS_TOKEN` might be invalid or expired.

**Solution:**
- Get a new app access token from Kick
- Verify the token works by testing it manually

### 2. Missing Permissions/Scopes
The app access token might not have the required scopes for event subscriptions.

**Solution:**
- Check your Kick app settings in the dashboard
- Ensure the app has permissions for "Event Subscriptions" or "Webhooks"
- You might need to request additional scopes when creating the token

### 3. Webhook URL Not Verified
Kick might require the webhook URL to be verified/whitelisted in the app dashboard before allowing subscriptions.

**Solution:**
1. Go to your Kick app dashboard
2. Find the "Webhooks" or "Event Subscriptions" section
3. Add/verify your webhook URL: `https://streaming-guide-backend-staging.up.railway.app/webhooks/kick`
4. Kick might send a verification request - ensure your endpoint responds correctly

### 4. IP Address Blocking
Kick might be blocking requests from Railway's IP addresses.

**Solution:**
- Contact Kick support to whitelist your IP addresses
- Or use a proxy/VPN service (not recommended for production)

### 5. Wrong Endpoint or API Version
The endpoint might have changed or require different parameters.

**Solution:**
- Check Kick's latest API documentation
- Verify the endpoint URL is correct: `https://kick.com/api/v2/event-subscriptions`
- Check if there are any required headers we're missing

## Testing Steps

### Step 1: Test Token Validity
```bash
# Test if token works for a simple API call
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://kick.com/api/v2/channels/mernuel
```

### Step 2: Test Subscription Endpoint
```bash
# Use the test script
./scripts/test-kick-subscription.sh YOUR_TOKEN 27187238
```

Or manually:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: StreamingGuide/1.0" \
  -d '{
    "event": "livestream.status.updated",
    "user_id": 27187238,
    "webhook_url": "https://streaming-guide-backend-staging.up.railway.app/webhooks/kick"
  }' \
  https://kick.com/api/v2/event-subscriptions
```

### Step 3: Check Kick Dashboard
1. Log into your Kick developer dashboard
2. Check your app settings
3. Look for:
   - Webhook/Event Subscription settings
   - Required scopes/permissions
   - Webhook URL verification status
   - IP whitelist settings

### Step 4: Check Kick Documentation
- Review Kick's API documentation for event subscriptions
- Check for any recent changes or requirements
- Look for examples or sample code

## Environment Variables to Check

Make sure these are set correctly in Railway:

```bash
KICK_APP_ACCESS_TOKEN=your_token_here
KICK_CLIENT_ID=your_client_id
KICK_CLIENT_SECRET=your_client_secret
WEBHOOK_BASE_URL=https://streaming-guide-backend-staging.up.railway.app
```

## Getting a New Token

If the token is expired or invalid:

```bash
curl -X POST https://id.kick.com/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials'
```

## Next Steps

1. **Test the token manually** using the test script
2. **Check Kick dashboard** for webhook URL verification
3. **Review Kick API docs** for any missing requirements
4. **Contact Kick support** if the issue persists - they might need to:
   - Whitelist your IP addresses
   - Enable event subscriptions for your app
   - Provide additional permissions/scopes

## Alternative: Manual Subscription

If the API continues to fail, you might be able to create subscriptions manually through the Kick dashboard, though this is less ideal for automation.





