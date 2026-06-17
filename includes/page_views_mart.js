/**
 * page_views_mart.js
 * ------------------------------------------------------------------
 * The PLP Views and Custom Page Views sheets are the same report run
 * over a different page dimension (PLP slug vs page_type bucket), so
 * one builder renders both marts. Each output row is week x page with
 * the organic / paid / total matrix for unique visitors, page views,
 * page views per visit, both bounce rates and exit rate, plus a Grand
 * Total row per week.
 *
 * ref() / when() only exist inside .sqlx templating, so the callers
 * resolve those and hand the rendered strings in:
 *   stgEvents     - resolved name of stg_ga4_events
 *   sessions      - resolved name of int_ga4_sessions
 *   eventWindow   - rendered incremental filter ('' on full refresh)
 *   pageDimSql    - SQL expression for the page label
 *   pageFilterSql - extra WHERE on top of event_name = 'page_view', or 'TRUE'
 *   pageColumnName- output column name for the page dimension
 */
const bounce = require("./bounce_rate");
const dates = require("./date_utils");
const channels = require("./channel_groups");
const metrics = require("./sql_metrics");

function weeklyPageMatrix(opts) {
  return `
-- every page_view in the recompute window, flagged when it is the last
-- page_view of its session (that page took the exit)
WITH pageviews AS (

  SELECT
    ${dates.weekStart("event_date")}                                    AS week_start_date,
    ${opts.pageDimSql}                                                  AS page,
    user_pseudo_id,
    ${metrics.sessionKey()}                                             AS session_key,
    ${channels.organicPaidBucket("channel_group")}                      AS channel_bucket,
    ROW_NUMBER() OVER (
      PARTITION BY ${metrics.sessionKey()}
      ORDER BY event_timestamp DESC
    ) = 1                                                               AS is_session_exit
  FROM ${opts.stgEvents}
  WHERE event_name = 'page_view'
    AND ga_session_id IS NOT NULL
    AND ${opts.pageFilterSql}
    ${opts.eventWindow}
),

-- page view side of the matrix; GROUPING SETS adds the Grand Total row.
-- pv.page stays qualified so the output alias cannot shadow it in GROUP BY
view_rollup AS (

  SELECT
    pv.week_start_date,
    IF(GROUPING(pv.page) = 1, 'Grand Total', pv.page)                   AS page,

    COUNT(DISTINCT IF(pv.channel_bucket = 'organic', pv.user_pseudo_id, NULL)) AS unique_visitors_organic,
    COUNT(DISTINCT IF(pv.channel_bucket = 'paid', pv.user_pseudo_id, NULL))    AS unique_visitors_paid,
    COUNT(DISTINCT pv.user_pseudo_id)                                          AS unique_visitors_total,

    COUNTIF(pv.channel_bucket = 'organic')                               AS page_views_organic,
    COUNTIF(pv.channel_bucket = 'paid')                                  AS page_views_paid,
    COUNT(*)                                                             AS page_views_total,

    COUNT(DISTINCT IF(pv.channel_bucket = 'organic', pv.session_key, NULL))    AS sessions_organic,
    COUNT(DISTINCT IF(pv.channel_bucket = 'paid', pv.session_key, NULL))       AS sessions_paid,
    COUNT(DISTINCT pv.session_key)                                       AS sessions_total,

    COUNTIF(pv.is_session_exit AND pv.channel_bucket = 'organic')        AS exits_organic,
    COUNTIF(pv.is_session_exit AND pv.channel_bucket = 'paid')           AS exits_paid,
    COUNTIF(pv.is_session_exit)                                          AS exits_total

  FROM pageviews AS pv
  GROUP BY GROUPING SETS ((pv.week_start_date, pv.page), (pv.week_start_date))
),

-- bounce side: one row per session that saw the page, with its flags
page_sessions AS (

  SELECT
    pv.week_start_date,
    IF(GROUPING(pv.page) = 1, 'Grand Total', pv.page)                   AS page,
    pv.session_key,
    MAX(pv.channel_bucket)                                              AS channel_bucket,
    MAX(s.is_bounced_flag)                                              AS is_bounced_flag,
    MAX(s.is_bounced_3cond)                                             AS is_bounced_3cond
  FROM pageviews AS pv
  LEFT JOIN ${opts.sessions} AS s
    USING (session_key)
  GROUP BY GROUPING SETS (
    (pv.week_start_date, pv.page, pv.session_key),
    (pv.week_start_date, pv.session_key)
  )
),

bounce_rollup AS (

  SELECT
    week_start_date,
    page,
    ${bounce.bounceRatePct("IF(channel_bucket = 'organic', is_bounced_flag, NULL)",
                           "COUNTIF(channel_bucket = 'organic')")}      AS bounce_rate_flag_organic,
    ${bounce.bounceRatePct("IF(channel_bucket = 'paid', is_bounced_flag, NULL)",
                           "COUNTIF(channel_bucket = 'paid')")}         AS bounce_rate_flag_paid,
    ${bounce.bounceRatePct("is_bounced_flag", "COUNT(*)")}              AS bounce_rate_flag_total,
    ${bounce.bounceRatePct("IF(channel_bucket = 'organic', is_bounced_3cond, NULL)",
                           "COUNTIF(channel_bucket = 'organic')")}      AS bounce_rate_3cond_organic,
    ${bounce.bounceRatePct("IF(channel_bucket = 'paid', is_bounced_3cond, NULL)",
                           "COUNTIF(channel_bucket = 'paid')")}         AS bounce_rate_3cond_paid,
    ${bounce.bounceRatePct("is_bounced_3cond", "COUNT(*)")}             AS bounce_rate_3cond_total
  FROM page_sessions
  GROUP BY week_start_date, page
)

SELECT
  v.week_start_date,
  ${dates.weekEnd("v.week_start_date")}                                 AS week_end_date,
  v.page                                                                AS ${opts.pageColumnName},

  v.unique_visitors_organic,
  v.unique_visitors_paid,
  v.unique_visitors_total,

  v.page_views_organic,
  v.page_views_paid,
  v.page_views_total,

  ${metrics.ratio("v.page_views_organic", "NULLIF(v.sessions_organic, 0)")} AS page_views_per_visit_organic,
  ${metrics.ratio("v.page_views_paid", "NULLIF(v.sessions_paid, 0)")}       AS page_views_per_visit_paid,
  ${metrics.ratio("v.page_views_total", "NULLIF(v.sessions_total, 0)")}     AS page_views_per_visit_total,

  b.bounce_rate_flag_organic,
  b.bounce_rate_flag_paid,
  b.bounce_rate_flag_total,
  b.bounce_rate_3cond_organic,
  b.bounce_rate_3cond_paid,
  b.bounce_rate_3cond_total,

  ${metrics.pct("v.exits_organic", "v.page_views_organic")}             AS exit_rate_organic,
  ${metrics.pct("v.exits_paid", "v.page_views_paid")}                   AS exit_rate_paid,
  ${metrics.pct("v.exits_total", "v.page_views_total")}                 AS exit_rate_total,

  IF(v.page = 'Grand Total', 0, 1)                                      AS row_sort

FROM view_rollup AS v
LEFT JOIN bounce_rollup AS b
  ON v.week_start_date = b.week_start_date AND v.page = b.page
`;
}

module.exports = { weeklyPageMatrix };
