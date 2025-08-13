# BetterStack Integration Setup Guide

This guide will help you set up BetterStack to replace both Sentry (error monitoring) and Spike (uptime monitoring) with a single service.

## What BetterStack Provides

- **Error Monitoring**: Replaces Sentry functionality
- **Uptime Monitoring**: Replaces Spike functionality  
- **Free Tier**: Up to 10 monitors
- **Mobile App**: On-the-go incident management
- **Slack/Teams Integration**: Direct notifications

## Step 1: Create BetterStack Account

1. Go to [BetterStack.com](https://betterstack.com)
2. Sign up for a free account
3. Verify your email address

## Step 2: Get Your DSN (Data Source Name)

1. In BetterStack dashboard, go to **Settings** → **Data Sources**
2. Click **Add Data Source**
3. Select **Node.js** as your platform
4. Copy the DSN (it looks like: `https://your-key@your-org.ingest.betterstack.com/your-project`)

## Step 3: Configure Environment Variables

Add this to your `.env` file:

```bash
# BetterStack (Error Monitoring + Uptime Monitoring)
BETTERSTACK_DSN=https://your-key@your-org.ingest.betterstack.com/your-project
```

## Step 4: Set Up Uptime Monitors

### Critical API Endpoints to Monitor

1. **Health Check Endpoint**
   - URL: `https://your-domain.com/health` (if exists)
   - Expected Status: 200
   - Check Frequency: Every 1 minute

2. **Main API Endpoint**
   - URL: `https://your-domain.com/api/schedules`
   - Expected Status: 200
   - Check Frequency: Every 2 minutes

3. **Authentication Endpoint**
   - URL: `https://your-domain.com/api/auth/login`
   - Expected Status: 200 (or 401 for invalid credentials)
   - Check Frequency: Every 5 minutes

4. **Database Health**
   - URL: `https://your-domain.com/api/health/db` (if exists)
   - Expected Status: 200
   - Check Frequency: Every 1 minute

### How to Create Monitors

1. In BetterStack dashboard, go to **Monitors**
2. Click **Add Monitor**
3. Select **HTTP(s)** monitor type
4. Configure:
   - **Name**: Descriptive name (e.g., "API Health Check")
   - **URL**: Your endpoint URL
   - **Expected Status**: 200
   - **Check Frequency**: Every 1-5 minutes
   - **Timeout**: 10 seconds
   - **Retries**: 2

## Step 5: Configure Alerting

### Slack Integration (Recommended)

1. In BetterStack dashboard, go to **Integrations**
2. Click **Add Integration**
3. Select **Slack**
4. Follow the OAuth flow to connect your Slack workspace
5. Configure notification preferences:
   - **Incident Creation**: ✅ Enabled
   - **Incident Updates**: ✅ Enabled
   - **Incident Resolution**: ✅ Enabled

### Microsoft Teams Integration

1. In BetterStack dashboard, go to **Integrations**
2. Click **Add Integration**
3. Select **Microsoft Teams**
4. Follow the setup instructions
5. Configure notification preferences

## Step 6: Set Up Escalation Policies

1. Go to **Escalation Policies**
2. Click **Add Escalation Policy**
3. Configure:
   - **Name**: "Default Escalation"
   - **Escalation Steps**:
     - Step 1: Notify team via Slack (0 minutes)
     - Step 2: Escalate to on-call person (5 minutes)
     - Step 3: Escalate to manager (15 minutes)

## Step 7: Configure On-Call Schedule

1. Go to **Who's On-Call?**
2. Click **Add Schedule**
3. Configure:
   - **Name**: "Primary On-Call"
   - **Time Zone**: Your team's timezone
   - **Rotation**: Weekly rotation
   - **Team Members**: Add your team members

## Step 8: Test Your Setup

### Test Error Monitoring

1. Trigger a test error in your application
2. Check BetterStack dashboard for the error
3. Verify you receive Slack/Teams notification

### Test Uptime Monitoring

1. Temporarily break one of your endpoints
2. Check BetterStack dashboard for incident creation
3. Verify you receive Slack/Teams notification
4. Fix the endpoint and verify incident resolution

## Step 9: Monitor and Optimize

### Key Metrics to Watch

- **Uptime Percentage**: Should be >99.9%
- **Response Time**: Should be <2 seconds
- **Error Rate**: Should be <1%

### Common Issues and Solutions

1. **False Positives**: Adjust timeout and retry settings
2. **Missing Notifications**: Check integration configuration
3. **High Response Times**: Investigate performance bottlenecks

## Step 10: Migration Strategy

### Phase 1: Parallel Monitoring (Current)
- Both Sentry and BetterStack are active
- All errors and performance issues are sent to both services
- Verify BetterStack is working correctly

### Phase 2: BetterStack Only
- Once confident in BetterStack setup
- Remove Sentry dependencies
- Update code to use only BetterStack

## Environment Variables Reference

```bash
# Required
BETTERSTACK_DSN=https://your-key@your-org.ingest.betterstack.com/your-project

# Optional (for advanced configuration)
BETTERSTACK_ENVIRONMENT=production
BETTERSTACK_TRACES_SAMPLE_RATE=1.0
```

## Support and Resources

- [BetterStack Documentation](https://docs.betterstack.com)
- [BetterStack Status Page](https://status.betterstack.com)
- [BetterStack Community](https://community.betterstack.com)

## Next Steps

1. Complete the BetterStack account setup
2. Configure your first monitor
3. Test the integration
4. Gradually add more monitors as needed
5. Configure team notifications
6. Monitor and optimize your setup
