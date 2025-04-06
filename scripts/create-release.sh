#!/bin/bash

set -e

# Step 1: Ensure we're on develop
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [[ "$CURRENT_BRANCH" != "develop" ]]; then
  echo "🚫 This script must be run from the 'develop' branch."
  exit 1
fi

# Step 2: Pull latest changes
git pull origin develop

# Step 3: Bump version manually or infer last tag
echo "🔢 Current version tags:"
git tag -l | sort -V

read -p "👉 Enter new version (e.g., 1.2.3): " VERSION
RELEASE_BRANCH="release/v$VERSION"
TAG="v$VERSION"

# Step 4: Update CHANGELOG.md
echo "📝 Updating CHANGELOG.md..."

DATE=$(date +"%Y-%m-%d")
echo -e "\n## v$VERSION - $DATE\n\n- Describe los cambios acá.\n" >> CHANGELOG.md

git add CHANGELOG.md
git commit -m "docs: update changelog for v$VERSION"

# Step 5: Create release branch from develop
git checkout -b "$RELEASE_BRANCH"
git push -u origin "$RELEASE_BRANCH"

echo "✅ Branch '$RELEASE_BRANCH' created and pushed to origin."

# Step 6: Create and push tag
git tag "$TAG"
git push origin "$TAG"

echo "🏷  Git tag '$TAG' created and pushed."

# Step 7: Create Pull Request via GitHub CLI
if command -v gh &> /dev/null; then
  echo "🚀 Creating PR to main..."

  gh pr create \
    --base main \
    --head "$RELEASE_BRANCH" \
    --title "Release v$VERSION" \
    --body "Versión v$VERSION lista para ser publicada. 🚀\n\n> Incluye cambios listados en el CHANGELOG.md."

  echo "✅ Pull Request created!"
else
  echo "⚠️ GitHub CLI (gh) not installed. Skipping PR creation."
  echo "👉 You can install it from https://cli.github.com/"
fi

# Step 8: Return to develop
git checkout develop
