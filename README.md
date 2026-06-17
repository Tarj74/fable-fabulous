# fable-fabulous-outcome

Rebuilt Dataform project for the GA4 -> BigQuery -> Sheets reporting stack.
Replaces the first-cut models (flattened_events / inter_table / per-sheet gold
tables) with a layered design that each sheet reads from exactly one gold table.

## Layout

```
includes/
  bounce_rate.js            both bounce methods behind one interface (see below)
  channel_groups.js         organic/paid bucketing + legacy Damas channel CASE
  date_utils.js             Monday-Sunday week math, AUV day counts, lookback window
  ga4_params.js             event_params extractors (handles mixed-type params)
  sql_metrics.js            shared ratio/pct/session-key/order definitions
  page_views_mart.js        one SQL shape for the two page-matrix marts
  schema_00_sources.js      column docs for definitions/00_sources (see below)
  schema_01_staging.js      column docs for definitions/01_staging
  schema_02_intermediate.js column docs for definitions/02_intermediate
  schema_03_marts.js        column docs for definitions/03_marts

definitions/
  00_sources/          declarations: events_2* (daily), events_intraday_*
  01_staging/          stg_ga4_events - slim typed event layer, shards merged
  02_intermediate/     int_ga4_sessions, int_user_first_visit
  03_marts/            one gold_* table per sheet
  04_quality/          GA4-specific data quality assertions (see below)
```

## Column documentation

Same idea as dbt's one `schema.yml` per folder: every definitions folder has a
`schema_*.js` include holding the description and per-column docs of each model
in that folder. The .sqlx config blocks just point at it
(`description: schema_03_marts.gold_weekly_performance.description,
columns: ...columns`), so docs are edited in exactly one place and Dataform
writes them into BigQuery table/column metadata on deploy. Add a column to a
model -> document it in the folder's schema file, nothing else.

| Sheet | Gold table | Grain |
|---|---|---|
| Weekly | gold_weekly_performance | Mon-Sun week |
| Channel | gold_channel_performance | month x channel (+ Total row) |
| Device | gold_device_performance | month x device class (+ Total row) |
| Prod Working | gold_product_performance | closed months + current-month weeks, x item category |
| City Working | gold_city_performance | month x city (+ Total row) |
| PLP Views | gold_plp_views_weekly | week x PLP slug (+ Grand Total) |
| Custom Page Views | gold_custom_page_views_weekly | week x page_type (+ Grand Total) |
| Depth cities working | gold_city_browsing_depth_weekly | week x city (+ Grand Total) |

## Bounce rate

Two calculations coexist until the business picks one. Both live in
`includes/bounce_rate.js` and every mart carries both columns
(`bounce_rate_flag_pct`, `bounce_rate_3cond_pct`):

- **flag** - GA4's own `session_engaged` param; bounce = no event in the
  session carried `'1'`.
- **3cond** - computed engagement; bounce = the session lasted under 10s
  AND had fewer than 2 page_views AND no purchase.

Dropping a method later = delete its function + the columns that call it.
No mart logic changes.

## What got fixed vs the old models

- **Shard merge**: intraday rows now fill *every* date whose daily shard has
  not landed (the old "today only" rule lost yesterday's data each morning,
  plus whole days when an export was skipped, e.g. 2026-06-01).
- **No MERGE on a fake unique key**: GA4 batches several events into the same
  microsecond - 12% of rows collide on user+name+timestamp+bundle, which is
  what made `merged_events` fail and silently dropped events when it didn't.
  Incrementals here are delete+insert over the trailing window
  (`vars.lookback_days`).
- **GA4-aligned orders and revenue**: orders = distinct transaction ids among
  the period's purchase events, revenue/quantity = the sums those events
  reported. That is how GA4's own reports and the team's raw QA queries count,
  so gold reconciles with both by construction. The duplicate-id defects this
  property carries (re-fired ids, one id with two payloads) don't silently
  change numbers - they surface in assert_transaction_revenue_consistency.
- **Sheet semantics**: Visitors = sessions vs Unique Visitors = users in the
  weekly report; Device "Traffic" = users; City contribution = share of
  unique visitors; AUV = average unique visitors per day; conversion =
  orders / unique visitors. All verified against the client workbook.
- **One week definition everywhere**, driven by `vars.week_start_day`
  (`DATE_TRUNC(..., WEEK(<var>))`, no MOD arithmetic). The old code was split -
  weekly model on Monday, prod_working on Sunday. Shipped as MONDAY (matches
  the client workbook and the QA windows); flipping the var re-bases every
  weekly mart, then full-refresh int_user_first_visit + the weekly marts since
  they store precomputed week columns. Months are calendar months; product
  periods roll weekly rows into a month row automatically at month end.
- **session_engaged read as string and int** - the param arrives both ways;
  string-only reads undercounted engagement.

## Cost notes

- Staging reads only the raw structs it needs (BQ bills per column).
- Every downstream model reads slim silver tables, never the raw export.
- Session-level reports (depth, bounce, time on site) come from
  `int_ga4_sessions` without touching events again.
- Total rows are produced with GROUPING SETS - one scan, no UNION re-reads.
- Incremental windows are partition-aligned, so daily runs touch only the
  trailing days.

## Data quality assertions

Beyond the per-model uniqueKey / nonNull / rowConditions, `definitions/04_quality`
carries GA4-specific checks modelled on what the community runs in production -
chiefly the assertion set of GA4Dataform Community (the open-source Dataform
package co-built with Simo Ahava: timeliness, event/session uniqueness, session
duration validity, transaction id and user_pseudo_id completeness) plus the
export-gap and volume checks the dbt-ga4 / OWOX articles keep flagging:

| Assertion | Catches |
|---|---|
| assert_ga4_export_freshness | export paused (1M events/day cap) or link broken |
| assert_ga4_export_continuity | a day with no daily shard and no intraday coverage |
| assert_staging_reconciles_raw | staging dropping or double-loading events |
| assert_user_pseudo_id_completeness | tagging / consent-mode breakage (rate-based) |
| assert_transaction_id_completeness | purchases that can never be deduped or tied to orders |
| assert_transaction_revenue_consistency | negative revenue, header vs items mismatch, one id shared by several users/amounts |
| assert_session_engagement_coverage | missing session_engaged param inflating flag-method bounce |
| assert_event_volume_collapse | sustained tracking outage (3 days under 5% of median) |

Session duration validity lives as rowConditions on int_ga4_sessions
(duration >= 0, events > 0, pageviews <= events); session and event uniqueness
are the uniqueKey assertions on their tables. Thresholds sit in
workflow_settings.yaml (`quality_*` vars). Quality assertions are tagged
`quality` - a tag-filtered `daily` run skips them, a full release run includes
them. Note: assert_ga4_export_continuity reports genuinely missing days even
when the cause is zero traffic on a quiet dev property; on production traffic
that distinction disappears.

## Running

Daily tag covers everything: `daily`. First deployment needs a full refresh
(tables do not exist yet); afterwards the scheduler invocation stays as-is.
The Sheets refresh must be repointed at the gold_* tables when the team
cuts over.
