Create a release for production deployment.

## Context
- Releases are cut from `develop` branch.
- A `release/X.Y.Z` branch is created with a PR to `main`.
- Merging the PR to `main` triggers automatic deploy on Railway (production).
- Version: $ARGUMENTS (e.g., `/release 1.25.0`)

## Steps

### 1. Validate state
- Confirm current branch is `develop`. If not, ask the user if you should switch.
- Run `git pull origin develop` to ensure latest code.
- Run `git tag -l | sort -V | tail -5` to show recent version tags.
- If no version was provided in $ARGUMENTS, ask the user what version to use.

### 2. Analyze changes for CHANGELOG
- Run `git log $(git describe --tags --abbrev=0)..HEAD --oneline` to see all commits since last release.
- Categorize changes into: Added, Changed, Fixed, Removed.
- Draft the CHANGELOG entry following the existing format in CHANGELOG.md.

### 3. Update CHANGELOG.md
- Read the current CHANGELOG.md.
- Add the new version entry right after the `---` separator line (after the [Unreleased] section).
- Keep the [Unreleased] section template intact (with empty Added/Changed/Removed/Fixed).
- Format:
  ```
  ## [X.Y.Z] - YYYY-MM-DD

  ### Added
  - ...

  ### Changed
  - ...

  ### Fixed
  - ...
  ```
- Show the CHANGELOG entry to the user for confirmation before writing.

### 4. Create release branch
- Run: `git checkout -b release/X.Y.Z`
- Commit the CHANGELOG update: `git commit -a -m "Release X.Y.Z"`
- Run: `git push -u origin release/X.Y.Z`

### 5. Create git tag
- Run: `git tag X.Y.Z && git push origin X.Y.Z`

### 6. Create PR to main
- Run:
  ```
  gh pr create --base main --head release/X.Y.Z --title "Release X.Y.Z" --body "<changelog entry>"
  ```
- Include the CHANGELOG entry as the PR body.

### 7. Return to develop
- Run: `git checkout develop`

### 8. Report
- Show the PR URL.
- Remind: "Merging this PR to main will trigger the production deploy on Railway."

## Important
- Always show the CHANGELOG entry and get user confirmation before committing.
- If any step fails, stop and explain. Do NOT force-push.
