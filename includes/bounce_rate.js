/**
 * bounce_rate.js
 * ------------------------------------------------------------------
 * Single home for bounce logic. We currently report bounce rate two
 * ways and the business has not picked a winner yet, so both live
 * here behind one interface. When one method is retired, delete its
 * function and every mart updates on the next compile - no SQL edits.
 *
 * Method "flag"  : GA4's own session_engaged param. A session is a
 * bounce when no event in it carried session_engaged = '1'.
 * Method "3cond" : computed engagement, mirrors GA4's definition of an
 * engaged session. A session is a bounce when ALL of
 * these fail:
 * - lasted >= 10 seconds
 * - had >= 2 page_views
 * - had >= 1 purchase
 * - had >= 1 custom conversion event (e.g., lead conversion)
 *
 * Usage pattern: the flags are aggregate expressions evaluated while
 * grouping events to one row per session (int_ga4_sessions). Marts then
 * just AVG/SUM the stored flags via bounceRatePct().
 */

// Session-level bounce flag, "flag" method.
// Expects the raw string value of the session_engaged event param.
function bouncedByFlag(sessionEngagedCol) {
  return `CASE
    WHEN MAX(CASE WHEN ${sessionEngagedCol} = '1' THEN 1 ELSE 0 END) = 1 THEN 0
    ELSE 1
  END`;
}

// Session-level bounce flag, "3cond" method.
// Expects event timestamp + event name columns, aggregates over the session.
// Accepts an optional array of custom event names to include as engagement criteria.
function bouncedByConditions(eventTimestampCol, eventNameCol, customEvents = []) {
  // Format array ['a', 'b'] into SQL syntax: 'a', 'b'
  const formattedEvents = customEvents.map(e => `'${e}'`).join(', ');
  
  // Dynamically build the IN clause if custom events are provided
  const customEventsSQL = customEvents.length > 0 
    ? `OR COUNTIF(${eventNameCol} IN (${formattedEvents})) > 0`
    : '';

  return `CASE
    WHEN TIMESTAMP_DIFF(MAX(${eventTimestampCol}), MIN(${eventTimestampCol}), SECOND) >= 10
      OR COUNTIF(${eventNameCol} = 'page_view') >= 2
      OR COUNTIF(${eventNameCol} = 'purchase') > 0
      ${customEventsSQL}
    THEN 0
    ELSE 1
  END`;
}

// Turns stored 0/1 session flags into a percentage at any grain.
// numeratorCol = bounce flag column, denominatorExpr = session count expression.
function bounceRatePct(bouncedFlagCol, denominatorExpr, decimals = 2) {
  return `ROUND(SAFE_DIVIDE(SUM(${bouncedFlagCol}), ${denominatorExpr}) * 100, ${decimals})`;
}

module.exports = { bouncedByFlag, bouncedByConditions, bounceRatePct };