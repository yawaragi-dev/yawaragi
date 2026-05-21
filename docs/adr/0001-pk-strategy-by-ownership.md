# PK strategy: Sakenowa ids for upstream-sourced tables, UUIDs for user-owned

Sakenowa-derived tables (`sakes`, `breweries`, `prefectures`, `flavor_tags`, `flavor_profiles`, `rankings`, `brand_flavor_tags`) use Sakenowa's integer ids as their primary keys. User-owned tables (`users`, `ratings`, `taste_profiles`, `scanned_labels`) use UUIDs. Foreign keys cross the boundary with mixed types (e.g. `ratings.sake_id integer references sakes(id)`).

We chose this hybrid rather than a single PK strategy because Sakenowa-sourced data is replaceable from upstream and its natural identity is Sakenowa's id — using it directly eliminates a per-refresh lookup-and-map step, and the schema reads as a direct mirror of the source. User data needs the standard UUID properties (no public sequence leakage, no sentinel collisions, uncoupling from upstream lifecycles). The FK-crossing boundary maps exactly onto the data-ownership boundary.

## Considered Options

- **UUIDs everywhere** with `sakenowa_brand_id` etc. as unique secondary indexes — adds an ingest lookup/map step on every cross-endpoint join with no v1 benefit.
- **Sakenowa ids everywhere** — leaves no room for user-contributed sakes without reserving id ranges or risking collisions.

## Consequences

If we ever ingest from a second data source, merge upstream rows, or support user-contributed Sakes inside the `sakes` table (rather than a separate table), we will have to migrate the Sakenowa-sourced PKs to UUIDs. This is real work but considered acceptable cost for v1, and the migration path is well-trodden.
