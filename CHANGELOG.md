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

## [1.16.1] - 2025-10-22

### Changed
- Now not-found mark has attempt tracking and escalation
- When escalation happens, program is marked not-found as a whole and email is sent.
- Back-to-back cron now increments attempt counter for not-found programs (escalation after exactly 3 attempts instead of 4).
- Fixed missing notFoundAttempts cache entries - now all cron types consistently call handleNotFoundEscalation.

## [1.16.0] - 2025-10-22

### Changed
- Multiple optimizations, as long as cache unifications

### Fixed
- Fixed programs not being able to be modified

## [1.15.0] - 2025-10-10

### Changed
- Now weekly overrides are created with the whole data needed

## [1.14.0] - 2025-10-10

### Changed
- Massive optimization changes to cache usage and database protection via locking and cache

### Removed
- Removed youtube api usage cache entries

## [1.13.1] - 2025-10-08

### Added
- Now categires can be hidden and reordered individually

### Fixed
- Fixed SSE

## [1.13.0] - 2025-10-06

### Added
- Added LiveStatusBackgroundService for optimized live status caching
- Added OptimizedSchedulesService for improved schedule fetching performance
- Added new optimized API endpoints: `/channels/with-schedules/today` and `/channels/with-schedules/week`
- Added strategic database indexes for improved query performance
- Added hybrid optimization system with background job processing every 2 minutes
- Added video ID validation with 15-minute cooldown to ensure freshness
- Added block-aware TTL calculation for accurate cache management
- Added comprehensive test coverage for new optimization services
- Added performance monitoring and logging with prefixes for better debugging

### Changed
- Optimized live status fetching with 99.9% performance improvement (15s → 0.02s)
- Reduced YouTube API quota usage by 93% through background processing
- Improved timezone handling with centralized utility functions
- Enhanced logging system with performance metrics and structured prefixes
- Updated ChannelsService to use OptimizedSchedulesService for better performance
- Modified live status parameter handling to support string-to-boolean conversion
- Improved cache invalidation strategy for CRUD operations on schedules

### Fixed
- Fixed timezone issues causing negative TTL errors
- Fixed video ID rotation detection for long-running streams
- Fixed block TTL calculation for back-to-back programs
- Fixed cache freshness validation for live video IDs

## [1.12.2] - 2025-10-06

### Fixed
- FIxed posthog bug
- Timezone debugging

## [1.12.1] - 2025-10-05

### Added
- Added youtube api usage metrics per channel

### Fixed
- Fixed cron not using batch fetch

## [1.12.0] - 2025-10-04

### Changed
- Mow batch fetching live youtubev video ids

## [1.11.0] - 2025-10-03

### Added
- Added categories for channels

## [1.10.3] - 2025-10-02

### Fixed
- Fixed title matching when only 1 live program
- Replaced SMTP with Sendgrid for email sending service

## [1.10.2] - 2025-10-01

### Fixed
- Fixed live stream storing and usage

## [1.10.1] - 2025-09-29

### Added
- Added background color and visibility on schedule only fields to channels

## [1.10.0] - 2025-09-27

### Added
- Added support for multiple live streams in parallel for one channel

## [1.9.1] - 2025-09-15

### Fixed
- Added negative TTL check and fallback

## [1.9.0] - 2025-08-25

### Added
- Now checking every minute for back-to-back programs and updating video id when changed

## [1.8.2] - 2025-08-23

### Added
- Added stream_url (playlist) to special programs

## [1.8.1] - 2025-08-19

### Fixed
- Fixed multiple emails being sent, 3 times each time

## [1.8.0] - 2025-08-19

### Added
- Now weekly overrides are modifiable

### Fixed
- Fixed weekly overrides expiration to aling with 00:00 monday bs as time
- Fixed cleanup process now running at 00:00 monday bs as time

## [1.7.7] - 2025-08-15

### Fixed
- Fixed performance alert test
- Fixed special programs logo mapping

## [1.7.6] - 2025-08-11

### Changed
- Made several changes to reports feature, adding by channel as well

### Fixed
- Fixed multiple device save oprations on sign up

## [1.7.5] - 2025-08-05

### Fixed
- Now not losing user role during social login

## [1.7.4] - 2025-08-04

### Fixed
- Removed reference to non existing table notification_preferences

## [1.7.3] - 2025-08-04

### Fixed
- Fixed is_live status
- Fixed caching mecahanism

## [1.7.2] - 2025-08-04

### Changed
- Optimized GET /channels/with-schedules

### Fixed
- Fixed social login response format

## [1.7.1] - 2025-08-03

### Changed
- Now users backoffice section has pagination

### Fixed
- Fixed gender charts not counting unknown

## [1.7.0] - 2025-08-03

### Added
- Added sentry integration for alerts
- Added performance monitoring
- Added several alerts for email, performance, errors, JWT, database errors

## [1.6.0] - 2025-07-29

### Added
- Added is_visible column to channel table

## [1.5.0] - 2025-07-26

### Added
- Added social sign up and login with google integration
- Added backend logic to complete incomplete user from social sign up

## [1.4.1] - 2025-07-11

### Fixed
- Fixed special programs live status not being calculated

## [1.4.0] - 2025-07-11

### Added
- Added Server Side Events to update frontend's client side for any change in any entity
- Added on-demand revalidation to update frontend's server side for any change in any entity

## [1.3.0] - 2025-06-29

### Added
- Added statistics logic
- Added integration with reports microservice

## [1.2.0] - 2025-06-22

### Added
- Added statistics backoffice logic
- Added devices and subscriptions to users backoffice logic

## [1.1.6] - 2025-06-21

### Added
- Added logic to bulk creat schedules
- Added logic to weekly override whole programs
- Added logic to add panelists to weekly overrides
- added statistics endpoints for users and subscriptions

## [1.1.5] - 2025-06-18

### Added
- Added new field style_override to program table in the database

## [1.1.4] - 2025-06-17

### Added
- Added new program weekly override type

## [1.1.3] - 2025-06-16

### Changed
- Refactored can fetch feature flag logic
- Now not notifying for channels that fetch is disabled

## [1.1.2] - 2025-06-15

### Changed
- Changed weekly updates cron execution time from 2 am to 11 pm on sundays

## [1.1.1] - 2025-06-14

### Changed
- Now updating user info on token refresh

## [1.1.0] - 2025-06-13

### Added
- Added weekly changes functionality for one-time changes for current and next week.
- Added clean cache endpoint for backoffice actions

### Removed
- Removed TypeORM logging in staging

## [1.0.5] - 2025-06-09

### Fixed
- Fixed subscription logic

## [1.0.4] - 2025-06-08

### Fixed
- Fixed formatting differences between DB and scrapers
- Unified scrapers proposed changes into only 1 email

## [1.0.3] - 2025-06-05

### Added
- Now returning channel order in get user subscriptions endpoint

### Changed
- Now get channel id endpoint is dynamic and reads from database

### Fixed
- Fixed back-to-back programs not updating cached video id

## [1.0.2] - 2025-06-04

### Fixed
- Now panelists are always ordered by id

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

