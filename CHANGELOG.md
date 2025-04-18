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

## [0.1.9] - 2025-04-17

### Removed
- Removed program start_time and end_time fields

### Fixed
- Fixed youtube-live.service live program fetch

## [0.1.8] - 2025-04-17

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

