/**
 * sql_metrics.js
 * ------------------------------------------------------------------
 * Small SQL builders for the ratio columns that repeat across marts.
 * Keeps rounding + divide-by-zero handling identical everywhere, so a
 * "conversion" in the city mart can never drift from the weekly one.
 */

// share expressed as % (conversion, contribution, funnel ratios)
function pct(numerator, denominator, decimals = 2) {
  return `ROUND(SAFE_DIVIDE(${numerator}, ${denominator}) * 100, ${decimals})`;
}

// plain ratio (ticket size, pages per session, AUV ...)
function ratio(numerator, denominator, decimals = 2) {
  return `ROUND(SAFE_DIVIDE(${numerator}, ${denominator}), ${decimals})`;
}

// session identifier used everywhere: ga_session_id is only unique per
// user, so the composite key is the real grain
function sessionKey(userCol = "user_pseudo_id", sessionIdCol = "ga_session_id") {
  return `CONCAT(${userCol}, '-', CAST(${sessionIdCol} AS STRING))`;
}

// orders must always mean "distinct non-empty transaction ids among the
// scope's purchase events" - one definition, every mart. Counting per
// period/dimension (not deduped across them) is deliberate: it is how GA4's
// own reports and the team's raw QA queries count, so gold reconciles with
// both. extraCondition narrows the count (e.g. to a user type).
function distinctOrders(eventNameCol, transactionIdCol, extraCondition = "TRUE") {
  return `COUNT(DISTINCT IF(
    ${eventNameCol} = 'purchase'
      AND ${transactionIdCol} IS NOT NULL
      AND ${transactionIdCol} != ''
      AND ${extraCondition},
    ${transactionIdCol}, NULL))`;
}

module.exports = { pct, ratio, sessionKey, distinctOrders };
