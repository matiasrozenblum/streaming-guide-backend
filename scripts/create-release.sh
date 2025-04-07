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

echo "📝 Moving content from [Unreleased] to [v$VERSION] in CHANGELOG.md..."

# Extract unreleased content
UNRELEASED_CONTENT=$(awk '/## \[Unreleased\]/ {flag=1; next} /^## \[/ {flag=0} flag' CHANGELOG.md)

# Create temporary file
TMP_FILE=$(mktemp)

# Extraer contenido de Unreleased y guardarlo en un archivo temporal
UNRELEASED_FILE=$(mktemp)
awk '/## \[Unreleased\]/ {flag=1; next} /^## \[/ {flag=0} flag' CHANGELOG.md > "$UNRELEASED_FILE"

# Crear archivo temporal para el changelog completo
TMP_FILE=$(mktemp)

awk -v version="$VERSION" -v date="$DATE" -v unreleased_file="$UNRELEASED_FILE" '
BEGIN {
  printed_release = 0
  while ((getline line < unreleased_file) > 0) {
    unreleased_lines = unreleased_lines line "\n"
  }
}
/^## \[Unreleased\]/ {
  print "## [Unreleased]\n"
  print "### Added\n"
  print "\n### Changed\n"
  print "\n### Removed\n"
  print "\n### Fixed\n"
  next
}
/^---$/ && !printed_release {
  print "\n## [v" version "] - " date
  printf "%s", unreleased_lines
  printed_release = 1
}
{ print }
' CHANGELOG.md > "$TMP_FILE"

mv "$TMP_FILE" CHANGELOG.md
rm "$UNRELEASED_FILE"

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
