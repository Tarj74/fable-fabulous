# Damas / APeak GA4 Reporting — Modeling Guide

Internal training doc for the data engineering team. Covers the full rebuild in
`fable-fabulous-outcome/`: why the old models were replaced, how the new ones
work end to end, the conventions to follow when extending them, and how the
numbers were validated. Read it top to bottom once; afterwards the README is
enough for day-to-day work.

---

## 1. The problem we were solving

The first-cut project (one folder up) worked, but every gold model re-derived
everything from `flattened_events` on its own: sessions were rebuilt five
times with copy-pasted CTEs, bounce logic existed in five flavours, orders
were counted four different ways, and a fix in one report never reached the
others. On top of that, profiling the live export surfaced real correctness
bugs:

| Found in the old pipeline | Effect |
|---|---|
| `events_*` wildcard in merged_events also matches `events_intraday_*` | streaming rows ingested twice, then "deduped" away |
| MERGE uniqueKey = user + event + timestamp + bundle | 12% of GA4 rows legitimately collide on it → MERGE crashes ("must match at most one source row"), and when it didn't crash it silently dropped ~13k events |
| Intraday only read for `CURRENT_DATE()` | yesterday's data missing every morning until the daily shard lands (~midday); skipped exports (2026-06-01) lost forever |
| Orders counted four different ways across marts | the same metric disagreed between reports; now one definition lives in `sql_metrics.distinctOrders()` |
| `session_engaged` read as string only | 1,939 events send it as int → engagement missed → bounce inflated (City B even reported 101.56% bounce) |
| Sessions rebuilt per report window | sessions clipped at month edges; device/city rows did not sum to totals (Desktop 934 + Mobile 31 = 965 vs total 949) |
| Hardcoded `EXTRACT(YEAR) = 2026` in prod_working | report silently dies on Jan 1 |
| Weekly "Visitors" = "Unique Visitors" | the client workbook treats Visitors as **sessions** and Unique Visitors as **users** (it literally labels them Sessions/Users in the Depth sheet) |

Every one of these is verifiable against the raw export — the numbers above
came from profiling `analytics_523093574`, not guesswork.

## 2. Architecture in one picture

```
analytics_523093574 (GA4 export)
  events_2*  events_intraday_*          declarations only, never queried directly
        \      /
     stg_ga4_events                     1 row per event, slim + typed + cleaned
      /        |        \
int_ga4_   int_ga4_   int_user_         sessions / deduped orders / first-visit dim
sessions   transactions  first_visit
      \        |        /
   8 gold marts (one per client sheet)  bq_gold_apeak.gold_*
```

Principles, in priority order:

1. **One definition, one home.** Sessions exist once (`int_ga4_sessions`),
   the order definition once (`sql_metrics.distinctOrders()`), bounce logic
   once (`includes/bounce_rate.js`), week math once
   (`includes/date_utils.js`). Marts only join and aggregate.
2. **Raw is read once.** Only `stg_ga4_events` touches the export, and it
   projects only the structs it needs — BigQuery bills per column, and
   `user_properties`/`privacy_info`/`user_ltv` never enter the pipeline.
3. **Marts mirror sheets.** Each gold table feeds exactly one tab, with the
   sheet's own semantics (decoded from the client workbook, section 6).

## 3. Layer walkthrough

### 00_sources — declarations
`events_2*` (not `events_*`!) and `events_intraday_*`. The `2` matters: a plain
`events_*` wildcard also matches the intraday tables. Side effect to remember:
**with `events_2*`, `_TABLE_SUFFIX` loses the leading 2** — every suffix
comparison in staging is written `CONCAT('2', _TABLE_SUFFIX)`.

### 01_staging — stg_ga4_events
One row per event. The important decisions:

- **Daily wins, intraday fills.** A date's rows come from its daily shard if
  one exists; otherwise from intraday. That covers three real cases: today
  (no daily yet), yesterday before ~midday (daily not landed), and a date
  whose daily export never arrived at all.
- **Delete+insert, not MERGE.** Each run deletes the trailing
  `vars.lookback_days` window and re-inserts it. Idempotent, replays
  restated shards wholesale, and immune to the no-unique-key problem. The
  only true GA4 row identity needs the `batch_*` columns — and you never
  need row identity if you replace whole partitions.
- **Cleaning happens here, once.** `session_engaged` coalesced across
  string/int typings; `page_type` case-normalised; geo blanks **and the
  literal '(not set)'** folded to `Unknown`; `device_class` derived
  (Desktop / Mobile / Tablet, app platforms → `Mobile App`); `page_path`
  extracted; items trimmed to the six fields the product mart uses.

### 02_intermediate

**int_ga4_sessions** — one row per session (`user_pseudo_id x ga_session_id`).
Carries both bounce flags, duration, per-session event counters
(pageviews, view_item, add_to_cart, ...) and single-valued dimensions.
Two subtleties worth teaching:

- *Window-edge sessions:* the scan window is one day wider than the delete
  window, and only sessions that **started** inside the delete window are
  re-inserted — so a session straddling midnight at the window edge never
  duplicates.
- *Dimension attribution:* `MAX()` per session, but with known values
  preferred over `Unknown`/`Unassigned` (`COALESCE(MAX(NULLIF(...)))`).
  Without that, a session carrying both 'Ahmedabad' and 'Unknown' lands in
  Unknown purely on alphabetical order. A session belongs to exactly one
  city/device/channel — that is why our per-dimension rows sum to totals and
  the old ones didn't.

**Orders and revenue convention** (lives in the marts, definition in
`sql_metrics.distinctOrders()`): orders = distinct transaction ids among the
scope's purchase events; revenue and quantity = the sums those events
reported. Counting per period/dimension — *not* deduped across them — is
deliberate: it is exactly how GA4's own reports and the team's raw QA queries
count, so the gold layer reconciles with both by construction. The duplicate
oddities this property carries (ids re-fired weeks later, `T_12345_FUTURE`
carrying two payloads on one id) therefore never silently change a number;
they are surfaced by `assert_transaction_revenue_consistency` where the team
can see and chase them at the source.

**int_user_first_visit** — one row per user with their `first_visit` date and
week. Drives the weekly new/repeat split. Users without a `first_visit` event
existed before tracking and stay "repeat" — that is GA4's own semantics.
This is the one model where MERGE on a uniqueKey *is* used, because
`first_visit` genuinely fires once per device ever.

### 03_marts — one gold table per sheet

| Sheet | Table | Grain | Watch out for |
|---|---|---|---|
| Weekly | gold_weekly_performance | week | Visitors = sessions, Unique Visitors = users (section 6) |
| Channel | gold_channel_performance | month x channel + Total | contributions divide by the sum of channel rows (always total 100%) |
| Device | gold_device_performance | month x device_class + Total | `traffic` = users per the workbook; `sessions` is its own column |
| City Working | gold_city_performance | month x city + Total | conversion = orders/users; contribution = user share; AUV = users/day |
| Prod Working | gold_product_performance | period x item_category + Grand Total | closed months at month grain, running month at week grain — rollover is automatic |
| PLP Views | gold_plp_views_weekly | week x PLP slug + Grand Total | organic/paid/total matrix |
| Custom Page Views | gold_custom_page_views_weekly | week x page_type + Grand Total | same matrix, same builder |
| Depth cities working | gold_city_browsing_depth_weekly | week x city + Grand Total | reads only int_ga4_sessions — no event scan |

Patterns to recognise inside them:

- **GROUPING SETS** produces dimension rows *and* the Total row from one scan
  — no `UNION ALL` re-reads. Gotcha learned the hard way: if the output alias
  equals the source column (`... AS device_class` grouped by `device_class`),
  BigQuery resolves GROUP BY to the alias and errors — qualify the source
  column with a table alias.
- **Contribution denominators**: channel contributions divide by the SUM of
  the channel rows (windowed `SUM(IF(dim='Total',0,x))`) so they always add
  to 100% even when a user or order id appears in several channels; device
  and city shares divide by the Total row's distinct figures per the client
  workbook. Both are deliberate - check the mart before "unifying" them.
- **The two page marts are one builder** (`includes/page_views_mart.js`).
  `ref()`/`when()` only exist inside `.sqlx` templating, so the marts resolve
  those and pass rendered strings into the builder.
- **Incremental = delete+insert per period.** Weekly marts delete weeks the
  lookback touches; monthly marts the current month; the product mart deletes
  from the Monday of the week the running month started in, which also makes
  the month-rollover (weekly rows collapsing into a month row) automatic.

## 4. The includes library

| File | What it owns | When you touch it |
|---|---|---|
| bounce_rate.js | both bounce definitions + the % helper | when the business retires one method — delete its function and the columns that call it |
| date_utils.js | week/month truncation, AUV day counts, lookback window | never, ideally — change `vars.week_start_day` / `vars.lookback_days` instead |
| sql_metrics.js | pct/ratio rounding, session key, the orders definition | when a new shared metric shape appears |
| channel_groups.js | organic/paid bucketing; legacy Damas channel CASE | swap `legacyDamasChannel()` in if analysts want the Adobe-era buckets |
| ga4_params.js | event_params extractors (string+int+double coalesced) | when staging needs a new param |
| page_views_mart.js | the weekly page-matrix SQL shape | when both page marts need the same change |
| schema_*.js | column docs per definitions folder (section 7) | every time a column is added or its meaning changes |

Bounce, spelled out once more because it is the most asked question:

- **flag** method: a session bounced if no event carried `session_engaged='1'`.
- **3cond** method: bounced if it lasted <10s AND had <2 page_views AND no
  purchase (this mirrors GA4's own "engaged session" definition).

Every mart publishes both columns (`bounce_rate_flag_pct`,
`bounce_rate_3cond_pct`) until the business picks one.

## 5. Week start — read this before comparing numbers

Reporting weeks are controlled by **one variable**: `vars.week_start_day` in
`workflow_settings.yaml`. Every weekly model derives from it through
`date_utils.weekStart()` — there is no other week math in the project.

Where the confusion came from: the old codebase was split. The old weekly
model used Monday arithmetic, while old prod_working and the old var said
Sunday. The client workbook's own rows ("4th Apr - 10th Apr", "05th Dec to
11th Dec") and both QA windows (2026-05-18→24, 2026-03-16→22) are
Monday→Sunday, which is why the new project shipped with MONDAY — and why the
QA cross-check differences are *not* explained by week start (the QA's own
windows were Monday-based and were matched exactly).

If the team standardises on Sunday instead: change the var to `SUNDAY`,
recompile, then **full-refresh `int_user_first_visit` and the weekly marts**
— they store precomputed week columns that must be re-based. One line, one
refresh, every weekly report follows.

## 6. Sheet semantics decoded from the client workbook

These were reverse-engineered from the 2022 Damas workbook and verified
numerically (each claim reproduces the workbook's own cells):

- **Weekly:** "Visitors" are sessions (new = the user's first ever session,
  `ga_session_number = 1`); "Unique Visitors" are users (new = `first_visit`
  falls in this week). The Depth sheet labels them Sessions/Users outright,
  and the 12-18 Dec row reproduces both totals exactly.
- **Conversion** is orders / *unique visitors* everywhere (City April:
  3375 / 3456584 = 0.0976% — matches the sheet cell).
- **City contribution** is the city's share of month *unique visitors*
  (Delhi April: 498790 / 3456584 = 14.43% — matches), not revenue share.
  Device contribution *is* revenue share. Channel has both (traffic and
  order contribution). Don't "fix" one to match another — they differ by
  design.
- **AUV** = average unique visitors per day of the period (April total:
  3456584 / 30 = 115219.47 — matches). Not "average unit value": the old
  models had this wrong. Closed months divide by calendar days, the running
  period by days elapsed (`date_utils.daysElapsed`).
- **Device rows** are Desktop / Mobile / Mobile App — an app stream lands as
  Mobile App automatically via `device_class`. "Traffic" counts users.
- **Prod Working** grain is item *category* (Earrings, Finger Ring, ...).
  The replica QA was done per SKU — those numbers validate against the
  silver layer at SKU grain; the gold mart stays category per the workbook.

## 7. Column documentation (the schema files)

Same idea as one dbt `schema.yml` per folder: each definitions folder has a
`schema_<folder>.js` include carrying the description and per-column docs of
every model in it. Config blocks just point at it:

```js
config {
  description: schema_03_marts.gold_weekly_performance.description,
  columns: schema_03_marts.gold_weekly_performance.columns,
  ...
}
```

Dataform writes these into BigQuery table/column metadata on deploy, so the
BQ console is always documented. **House rule: a PR adding a column must touch
the folder's schema file in the same commit.** 282 columns are documented
today; keep it at 100%.

## 8. Data quality assertions

`definitions/04_quality` carries eight GA4-specific checks, adapted from the
assertion set of GA4Dataform Community (the open-source package co-built with
Simo Ahava) plus export-gap/volume checks the dbt-ga4/OWOX community flags.
All run windowed (cheap), all validated against live data:

| Assertion | Catches |
|---|---|
| assert_ga4_export_freshness | export paused (1M events/day cap) or link broken |
| assert_ga4_export_continuity | a day with no daily shard and no intraday coverage |
| assert_staging_reconciles_raw | staging dropping or double-loading events |
| assert_user_pseudo_id_completeness | tagging/consent breakage (rate vs `quality_max_null_pseudo_id_pct`) |
| assert_transaction_id_completeness | purchases without a usable transaction id |
| assert_transaction_revenue_consistency | negative revenue; header vs items mismatch; one id shared by users/amounts |
| assert_session_engagement_coverage | missing session_engaged inflating flag-method bounce |
| assert_event_volume_collapse | 3 consecutive days under 5% of the 28-day median |

Plus per-model assertions in each config (uniqueKey, nonNull, rowConditions —
session durations >= 0, bounce between 0 and 100, splits summing to totals).
Thresholds live in `workflow_settings.yaml` as `quality_*` vars. Quality
assertions carry the `quality` tag (not `daily`), so a tag-filtered daily run
skips them while a full release run includes them.

## 9. Cost model

What keeps the bill small, in order of impact:

1. Staging projects only needed columns from raw (BQ bills bytes per column).
2. Everything downstream reads slim silver tables — never raw.
3. Incremental windows are partition-aligned: a daily run touches ~3 days of
   partitions, not history.
4. GROUPING SETS instead of UNION ALL halves mart scan counts; the depth mart
   reads only the session table (no event scan at all).
5. Partitioning (event_date / session_date / purchase_date / month / week)
   plus clustering on the dimensions analysts filter by.

## 10. How this was validated

Worth teaching because the method is reusable:

1. **Compile-level**: `npx @dataform/cli@3.0.26 compile` after every change
   (41 actions today).
2. **SQL-level, read-only**: every model's compiled SQL was executed against
   BigQuery with its upstream refs replaced by inlined CTE chains — full
   dependency chain, zero writes. This caught a reserved-word CTE (`rollup`)
   and the GROUPING SETS alias-shadowing bug before they ever reached prod.
3. **Data-level**: mart outputs reconciled against independently-written
   ground-truth queries on raw (sessions/users/orders/revenue per window) and
   against the team's QA workbook — 156 comparisons, 143 exact matches, the
   13 remaining differences each documented in
   `QA_crosscheck_new_models.xlsx` (bounce-flag data recovery and
   whole-session attribution, where the old figures were internally
   inconsistent).

## 11. Deployment / cutover runbook

1. Point a Dataform workspace (or the release config) at
   `fable-fabulous-outcome/`.
2. First run must be a **full refresh** — tables don't exist yet. The
   existing tables (`flattened_*`, `weekly`, `devices`, ...) are untouched;
   the new ones are `stg_/int_/gold_*`, so both stacks can coexist during
   cutover.
3. Subsequent runs: the existing scheduler invocation works as-is (the
   `daily` tag covers sources→marts; quality assertions run on full-repo
   invocations).
4. Repoint the Sheets connected-sheet tabs from `weekly` / `devices` /
   `city_working` to the `gold_*` tables.
5. Decide the one open business question: week start (section 5).
6. Once the sheet runs on gold_* for a comfortable period, drop the legacy
   tables and retire the old definitions folder.

## 12. FAQ

**Why is yesterday's data already present at 11:00 IST?** Because staging
takes intraday rows for any date whose daily shard hasn't landed. When the
daily shard arrives, the next run's delete+insert window replaces those rows
with the finalised ones.

**Why don't gold orders match `COUNT(*) FROM events WHERE event_name='purchase'`?**
Purchases re-fire, so raw purchase *events* overcount. Orders are distinct
transaction ids among the scope's purchase events — the same way GA4's
reports and the QA's raw queries count, which is why gold reconciles with
both.

**Why are there two bounce-rate columns everywhere?** Two definitions coexist
until the business picks one; both live in `includes/bounce_rate.js`. Killing
one is deleting a function and its columns.

**A mart needs a new dimension — where do I start?** Staging: is the column
extracted? Sessions: does it need session-level attribution? Then the mart.
Then the folder's schema file. Then compile.

**Why does the product mart show weeks for this month but months before?**
The period spine derives from the data: closed months collapse to month rows,
the running month reports Monday-Sunday weeks, and the rollover happens by
itself on the first run of a new month.
