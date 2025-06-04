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

## [1.0.1] - 2025-06-04

### Changed
- Changed session handling with refresh token
- Improved subscription email template

## [1.0.0] - 2025-06-02

### Changed
- Now signing user name and email to JWT

### Removed
- Removed token requirement for GET /channels/with-schedules since it is now public.
- Removed all logic related to legacy login and friends and family stage for the official launch

## [0.4.7] - 2025-06-01

### Added
- Added gender and birth date to jwt signing

## [0.4.6] - 2025-05-31

### Added
- Added gender and birth date fields to users table and sign up process

## [0.4.5] - 2025-05-31

### Added
- Added new gender and birthdate fields for users and signup process

## [0.4.4] - 2025-05-27

### Fixed
- Fixed push unsubscriptions

## [0.4.3] - 2025-05-27

### Fixed
- Fixed push subscriptions generation again

## [0.4.2] - 2025-05-26

### Fixed
- Fixed push subscriptions generation

## [0.4.1] - 2025-05-25

### Fixed
- Fixed scrapers and email template time formatting

## [0.4.0] - 2025-05-25

### Added
- Added program subscriptions for users with favorites section and email & push notifications

## [0.3.7] - 2025-05-25

### Changed
- Updated update-user.dto.ts to be able to update a user's role

## [0.3.6] - 2025-05-19

### Removed
- Removed youtube fetch counters from cache

## [0.3.5] - 2025-05-18

### Fixed
- Fixed patch users validations for empty strings

## [0.3.4] - 2025-05-18

### Added
- Added reset password feature in the login flow

## [0.3.3] - 2025-05-18

### Fixed
- Fixed user endpoints jwt guards and roles

## [0.3.2] - 2025-05-17

### Fixed
- Fixed jwt strategy

## [0.3.1] - 2025-05-16

### Added
- Added uses table DB migration

### Fixed
- Fixed backoffice login token role

## [0.3.0] - 2025-05-16

### Added
- Added users CRUD

### Changed
- Now F&F login endpoint is /auth/login/legacy and /auth/login is the regular users's login

## [0.2.16] - 2025-05-02

### Fixed
- Fixed cron not filtering for is_live before fetching youtube

## [0.2.15] - 2025-05-02

### Added
- Added several tests for new services

## [0.2.14] - 2025-05-01

### Changed
- Now is_live depends on youtube_fetch feature flags as well

## [0.2.13] - 2025-05-01

### Added
- Added feature flags for turning youtube fech on and off

## [0.2.12] - 2025-04-28

### Added
- Added stats endpoint

## [0.2.11] - 2025-04-28

### Changed
- Replaced channel streaming_url field for handle field

## [0.2.10] - 2025-04-28

### Fixed
- Now consulting if cached video id is live instead of private

## [0.2.9] - 2025-04-27

### Changed
- Improved live periodic fetch

## [0.2.8] - 2025-04-26

### Added
- Now cleaning schedules and panelists cache when creating, updating or deleting entites from the backoffice

## [0.2.7] - 2025-04-26

### Changed
- Now storing channel video if until the end of the live transmission.
- Cron will not execute fetch for specific channel if that channel has a video id cached.

## [0.2.6] - 2025-04-25

### Changed
- Now storing channel video id until end of day, updating it by cron or on-demand

### Removed
- Removed video id cache entry by program since it's no longer used

## [0.2.5] - 2025-04-24

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

