/**
 * date_utils.js
 * ------------------------------------------------------------------
 * Calendar helpers shared by every mart. All client reporting weeks
 * run Monday to Sunday (see "4th Apr - 10th Apr" rows in the Weekly
 * sheet), so week math is centralised here instead of being repeated
 * as MOD(EXTRACT(DAYOFWEEK ...)) arithmetic in each model.
 */

const WEEK_START = dataform.projectConfig.vars.week_start_day || "MONDAY";

// Monday of the week the date falls in.
function weekStart(dateCol) {
  return `DATE_TRUNC(${dateCol}, WEEK(${WEEK_START}))`;
}

// Sunday of the same week.
function weekEnd(dateCol) {
  return `DATE_ADD(DATE_TRUNC(${dateCol}, WEEK(${WEEK_START})), INTERVAL 6 DAY)`;
}

// First day of the month.
function monthStart(dateCol) {
  return `DATE_TRUNC(${dateCol}, MONTH)`;
}

// Days a reporting period has actually covered so far. Denominator for
// "average unique visitors per day" (AUV) - a closed month divides by its
// calendar days, the running month/week only by the days elapsed.
function daysElapsed(periodStartCol, periodEndCol) {
  return `DATE_DIFF(LEAST(${periodEndCol}, CURRENT_DATE()), ${periodStartCol}, DAY) + 1`;
}

// Rolling incremental window. Single knob (vars.lookback_days) so every
// incremental model reprocesses the same trailing slice.
function lookbackDate() {
  const days = dataform.projectConfig.vars.lookback_days || "3";
  return `DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`;
}

// Same window expressed as a YYYYMMDD string for _TABLE_SUFFIX pruning.
function lookbackSuffix() {
  const days = dataform.projectConfig.vars.lookback_days || "3";
  return `FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY))`;
}

module.exports = { weekStart, weekEnd, monthStart, daysElapsed, lookbackDate, lookbackSuffix };
