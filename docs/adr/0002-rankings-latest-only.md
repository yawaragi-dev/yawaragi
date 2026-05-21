# Rankings: latest snapshot only

The `rankings` table stores only the current month's positions. Each nightly ingest overwrites previous rankings via a transactional `DELETE` + `INSERT` within the per-snapshot ingest transaction. The `year_month` column records which Sakenowa snapshot is currently loaded, but no prior months are retained.

We chose this rather than accumulating snapshots because Sakenowa publishes only the current month — there is no historical API. The three flagship features (label-scan, chat recommender, taste profile) need *current* popularity as a weak signal; "trending up", "gaining momentum" type analytics are speculative product surface, not yet earned. Accumulating snapshots now would add a uniqueness key, index pressure, and storage growth for use cases that don't exist.

## Consequences

The choice is a one-way door for history we don't capture — once a month passes without ingestion, that snapshot is unrecoverable from our side (and from Sakenowa too, since they don't expose it). Migration path if we later want time-series: change the uniqueness key from `(sake_id, is_overall, prefecture_id)` to `(sake_id, is_overall, prefecture_id, year_month)` and stop overwriting on ingest. From that point forward we accumulate; past months remain lost.
