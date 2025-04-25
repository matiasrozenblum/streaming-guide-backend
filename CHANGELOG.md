# Changelog

Todas las modificaciones importantes de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/)
y este proyecto utiliza [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added

### Changed

### Removed

### Fixed

---

## [0.2.5] - 2025-04-22

### Changed
- Now using video id for all the channel's live stream without cuts

## [0.2.4] - 2025-04-22

### Added
- Added youtube fetch counters

## [0.2.3] - 2025-04-22

### Fixed
- Now storing failed fetches to youtube in cache to avoid re-fetching programs with no live stream.

## [0.2.2] - 2025-04-22

### Added
- Added on demand fetch when youtube video id is not found in cache.

### Changed
- Now fetching youtube every 1 hour, video id ttl updated to program duration.

## [0.2.1] - 2025-04-22

### Fixed
- Now not storing stream_url and video_id in schedules cache.

## [0.2.0] - 2025-04-22

### Changed
- Now using Redis Cache directly

## [0.1.20] - 2025-04-20

### Fixed
- Fixed youtube live cron

## [0.1.19] - 2025-04-20

### Changed
- Added new endpoints to better communicate with the frontend.

## [0.1.18] - 2025-04-20

### Fixed
- Fixed create schedule from proposed change

## [0.1.17] - 2025-04-20

### Fixed
- If a proposed change is to create a program, it is now created instead of updating nothing.

## [0.1.16] - 2025-04-20

### Added
- Now applying changes to tables when accepted

## [0.1.15] - 2025-04-20

### Changed
- Now scrapers dont directly modify the DB, instead they send an email with proposed changes.
- This proposed changes will then be accepted or rejected from the backoffice

### Fixed
- Fixed scrapers execution in Railway environment

## [0.1.14] - 2025-04-19

### Fixed
- Fixed JWT sign

## [0.1.13] - 2025-04-19

### Added
- Added update and delete functionality to configs

## [0.1.12] - 2025-04-19

### Changed
- Now Deletes cascade through relations

## [0.1.11] - 2025-04-18

### Added
- Added order column to channel table
- Now when creating a channel, order autoincrements by 1
- Added order to all channel endpoints's responses

### Changed
- Secured all controllers with JWT

## [0.1.10] - 2025-04-18

### Changed
- Renamed program column channelId to channel_id

### Fixed
- Now creating a program with channel id works as expected
- Now getting an existing program returns the channel id as well

## [0.1.9] - 2025-04-18

### Removed
- Removed program start_time and end_time fields

### Fixed
- Fixed youtube-live.service live program fetch

## [0.1.8] - 2025-04-18

### Fixed
- Fixed youtube api fetch, now caching response and fetching every 30 minutes for each live program

## [0.1.7] - 2025-04-17

### Added
- Added youtube live integration and stream url for live streamings

## [0.1.6] - 2025-04-15

### Fixed
- Fixed scrapers in railway environments
- Fixed program creation, description is now correctly handled as optional

## [0.1.5] - 2025-04-15

### Removed
- Removed pagination logic

### Fixed
- Fixed contract with frontend

## [0.1.4] - 2025-04-15

### Changed
- Improved loading time

## [0.1.3] - 2025-04-14

### Added
- Added logic to fetch program-panelist relations
- Added endpoint toclean cache for specific panelist

### Fixed
- Fixed panelists bio, now it is optional

## [0.1.1] - 2025-04-13

### Added
- Added login feature for backoffice

## [0.1.0] - 2025-04-06

### Added
- Added redis caché service for schedule GETs

### Removed
- Removed changelog modification from release script

## [0.0.9] - 2025-04-06

### Fixed
- Fixed cors and 502 errors in prod

## [0.0.8] - 2025-04-06

### Added
- Added coverage check to PRs

### Changed

### Removed

### Fixed
- Fixed failing tests

## [0.0.7] - 2025-04-06

### Changed
- Modified create-release.sh to update changelog accordingly

### Fixed
- Fixed scraper issue in prod

## [0.0.6] - 2025-04-06

### Added
- Added tests for all services and modules

## [0.0.5] - 2025-04-05

### Added
- Added changelog.
- Added pull request template.
- Added create-release script.

### Changed
- Modified .gitignore

## [0.0.4] - 2025-04-05

### Agregado
- Funcionalidad base del sitio con frontend en Next.js y backend en Nest.js.
- Scrapers de Luzu, Vorterix, Olga, Blender, Urbana, Gelatina, Bondi Live y La Casa Streaming.

## v0.0.6 - 2025-04-06

- Describe los cambios acá.


## v0.0.7 - 2025-04-06

- Describe los cambios acá.

