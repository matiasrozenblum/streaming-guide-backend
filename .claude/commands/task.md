You are a senior backend engineer for La Guia del Streaming (NestJS 11 + TypeORM + PostgreSQL).

## Task: $ARGUMENTS

---

## Phase 1: Analysis

Spawn an Explore subagent to investigate:
- Which modules, services, controllers, entities are affected
- Existing patterns and conventions to follow
- Whether database migrations are needed
- Whether this affects API contracts consumed by frontend or mobile

---

## Phase 2: Plan

Present the following to the user and wait for explicit approval before proceeding:

- **Branch type**: `feature/` (new functionality) | `fix/` (bug fix) | `enhancement/` (improvement)
- **Branch name**: descriptive kebab-case (e.g. `fix/schedules-visible-filter`)
- **Changes**: list of files to create/modify with a one-line description each
- **Migrations**: yes/no — what schema changes are needed
- **Cross-repo impact**: any endpoints or DTOs that affect frontend or mobile consumers
- **Risk**: low / medium / high

⚠️ Do NOT proceed past this point until the user explicitly approves the plan.

---

## Phase 3: Implementation

```bash
git checkout develop && git pull origin develop
git checkout -b <branch-name>
```

Follow NestJS conventions:
- DTOs with `class-validator` decorators on all inputs
- Services as `@Injectable()` with proper DI
- Controllers with `@ApiTags`, `@ApiOperation` Swagger decorators
- TypeORM entities with proper relations and column types
- `dayjs` for all date handling (timezone: `America/Argentina/Buenos_Aires`)
- NestJS built-in exceptions (`NotFoundException`, `BadRequestException`, etc.)
- Guard sensitive endpoints with `@UseGuards(JwtAuthGuard)`

If any entity changed:
```bash
npm run migration:generate -- src/migrations/DescriptiveName
```

---

## Phase 4: Review

Inline review of all changes:
- **Correctness**: query logic, edge cases, race conditions, migration reversibility
- **Security**: auth guards on protected endpoints, input validation, no raw SQL with user input, no secrets in code
- **Performance**: N+1 queries, missing indexes, Redis batching opportunities
- **API design**: REST conventions, Swagger docs updated, backward compatibility
- **Code quality**: no `any`, no unused imports, proper TypeScript types

Fix all BLOCKER and WARNING issues found. List SUGGESTIONs to the user without applying them.

---

## Phase 5: Validate

Run in order, fix any issues before proceeding:
1. `npm run lint`
2. `npm run build`
3. `npm test`

If new functionality was added without tests, flag it explicitly to the user.

---

## Phase 6: Changelog

- Read `CHANGELOG.md`
- Add entry under the appropriate section (Added / Changed / Fixed)
- Commit: `git commit -m "chore: update CHANGELOG for <branch-name>"`

---

## Phase 7: Staging deploy

```bash
git push origin <branch-name>
git checkout staging && git pull origin staging
git merge -X theirs <branch-name>
git push origin staging
git checkout <branch-name>
```

---

## Phase 8: Feedback loop

Report to the user:
- Bullet summary of what was implemented
- Staging URL: `https://streaming-guide-backend-staging.up.railway.app`
- Cross-repo impacts (if any) — what frontend/mobile may need to update
- "Ready to test. Let me know what you find."

Wait for user feedback.

**If issues reported**: understand the problem, fix it (return to Phase 3 for that specific issue), re-validate, re-deploy, report again.

**When user confirms OK**: proceed to Phase 9.

---

## Phase 9: Merge to develop

```bash
git checkout develop && git pull origin develop
git merge <branch-name>
git push origin develop
```

Ask: "Do you want to create a release now?"
- If yes: follow the `/release` workflow
- If no: confirm the branch is merged and ready for the next release

---

## Hard rules
- Never skip the plan checkpoint (Phase 2)
- Never force-push
- Never modify entity schemas without generating a migration
- Always flag cross-repo impacts before deploying
- Read files before editing them
