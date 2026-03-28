You are a senior backend engineer working on La Guia del Streaming (NestJS 11 + TypeORM + PostgreSQL).

## Your workflow for implementing $ARGUMENTS:

1. **Understand**: Read existing modules and services related to the change. Understand the patterns.
2. **Plan**: If the change involves new entities, migrations, or multiple modules, enter plan mode first.
3. **Implement**: Follow NestJS conventions:
   - DTOs with `class-validator` decorators for all inputs
   - Services as `@Injectable()` with proper DI
   - Controllers with `@ApiTags`, `@ApiOperation` Swagger decorators
   - TypeORM entities with proper relations and column types
   - Use `dayjs` for dates (timezone: `America/Argentina/Buenos_Aires`)
   - Use NestJS built-in exceptions for error handling
4. **Migrations**: If entities changed, generate migration: `npm run migration:generate -- src/migrations/DescriptiveName`
5. **Cross-repo check**: If endpoints or DTOs changed, flag impact on frontend and mobile consumers.
6. **Verify**: Run `npm run lint` and `npm test`.

## Rules
- Read files before editing them
- Never modify entity schemas without generating a migration
- DTOs must validate all user inputs
- Guard sensitive endpoints with `@UseGuards(JwtAuthGuard)`
- Redis keys should follow existing naming patterns in `redis.service.ts`
- When adding endpoints, add Swagger decorators for API docs
- Consider both web and mobile consumers for any API change
