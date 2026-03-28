## 2024-05-14 - Optimize Bulk Banner Updates
**Learning:** Found N+1 query patterns when saving `banners` iteratively inside `banners.service.ts` auto-enabling logic.
**Action:** Consolidate iterative `.save()` operations inside loops across the codebase (e.g. `bannersRepository.save()` in `BannersService`) into a single batch `save(entities)` call to avoid multiple database round trips.
