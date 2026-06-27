## 2025-02-18 - Replacing N+1 findOne with In operator

**Learning:** When assigning multiple related entities (like panelists to programs) in bulk creation endpoints, mapping over arrays of IDs and executing `findOne` within a `Promise.all` creates an N+1 query problem. The application already imports TypeORM's `In` operator, which can be leveraged to batch these lookups.

**Action:** Replace `Promise.all(ids.map(id => repository.findOne({ where: { id } })))` with `await repository.find({ where: { id: In(ids) } })` to execute a single, efficient database query. Ensure that the TypeORM `In` helper is imported.
