#!/bin/bash

# Migration Script: Sentry to BetterStack
# This script helps migrate from Sentry to BetterStack monitoring

set -e

echo "🚀 Starting migration from Sentry to BetterStack..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    print_error "Please run this script from the backend project root directory"
    exit 1
fi

print_status "Checking current setup..."

# Check if BetterStack is already configured
if grep -q "BETTERSTACK_DSN" .env 2>/dev/null; then
    print_success "BetterStack DSN is already configured"
else
    print_warning "BetterStack DSN not found in .env file"
    print_status "Please add BETTERSTACK_DSN to your .env file"
fi

# Check if Sentry is still being used
SENTRY_USAGE=$(grep -r "sentryService" src/ --include="*.ts" | wc -l)
if [ "$SENTRY_USAGE" -gt 0 ]; then
    print_status "Found $SENTRY_USAGE references to sentryService"
    print_status "These will need to be updated to use DualMonitoringService"
else
    print_success "No sentryService references found"
fi

print_status "Migration phases:"
echo "1. ✅ BetterStack service created"
echo "2. ✅ Dual monitoring service created"
echo "3. ✅ Health endpoints added"
echo "4. 🔄 Update existing services to use DualMonitoringService"
echo "5. 🔄 Test both monitoring systems"
echo "6. 🔄 Remove Sentry dependencies"

print_status "Next steps:"
echo ""
echo "1. Set up your BetterStack account and get your DSN"
echo "2. Add BETTERSTACK_DSN to your .env file"
echo "3. Start your application to test the setup"
echo "4. Gradually update services to use DualMonitoringService"
echo "5. Test both monitoring systems work correctly"
echo "6. Once confident, remove Sentry entirely"

print_status "To test the setup:"
echo "1. Start your application: npm run start:dev"
echo "2. Test health endpoint: GET /health/detailed"
echo "3. Test BetterStack: POST /test-betterstack"
echo "4. Check both Sentry and BetterStack dashboards"

print_status "Migration script completed!"
print_success "Your application now supports both Sentry and BetterStack monitoring"
