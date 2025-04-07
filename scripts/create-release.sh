#!/bin/bash

set -e

# Ensure we're on develop
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
  echo "🚫 This script must be run from the 'develop' branch."
  exit 1
fi

# Pull latest changes
git pull origin develop

# Prompt for version
echo "🔢 Current version tags:"
git tag -l | sort -V

read -p "👉 Enter new version (e.g., 1.2.3): " VERSION
RELEASE_BRANCH="release/v$VERSION"
TAG="v$VERSION"
DATE=$(date +"%Y-%m-%d")

# Commit changelog changes
git add CHANGELOG.md
git commit -m "docs: update changelog for v$VERSION"

# Create release branch and tag
git checkout -b "$RELEASE_BRANCH"
git push -u origin "$RELEASE_BRANCH"
git tag "$TAG"
git push origin "$TAG"

echo "🏷  Tag '$TAG' created and pushed."

# Create PR if GitHub CLI is installed
if command -v gh &> /dev/null; then
  echo "🚀 Creating PR to main..."
  gh pr create \
    --base main \
    --head "$RELEASE_BRANCH" \
    --title "Release v$VERSION" \
    --body "Versión v$VERSION lista para ser publicada. 🚀\n\n> Incluye cambios listados en el CHANGELOG.md."
  echo "✅ Pull Request created!"
else
  echo "⚠️ GitHub CLI not found. PR not created."
fi

# Back to develop
git checkout develop
