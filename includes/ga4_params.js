/**
 * ga4_params.js
 * ------------------------------------------------------------------
 * Extractors for the GA4 event_params / item_params key-value arrays.
 * Each call renders the usual correlated subquery, so staging stays a
 * readable column list instead of 30 copies of UNNEST boilerplate.
 *
 * epAny() matters more than it looks: GTM setups routinely send the
 * same param typed differently across tags (session_engaged arrives
 * as string '1' AND as int 1 in this property), so single-type reads
 * silently drop values.
 */

function epString(key, alias) {
  return `(SELECT value.string_value FROM UNNEST(event_params) WHERE key = '${key}') AS ${alias || key}`;
}

function epInt(key, alias) {
  return `(SELECT value.int_value FROM UNNEST(event_params) WHERE key = '${key}') AS ${alias || key}`;
}

// String first, then int, then double - everything normalised to STRING.
function epAny(key, alias) {
  return `(SELECT COALESCE(
    value.string_value,
    CAST(value.int_value AS STRING),
    CAST(value.double_value AS STRING)
  ) FROM UNNEST(event_params) WHERE key = '${key}') AS ${alias || key}`;
}

function itemParamString(key, alias) {
  return `(SELECT value.string_value FROM UNNEST(item.item_params) WHERE key = '${key}') AS ${alias || key}`;
}

module.exports = { epString, epInt, epAny, itemParamString };
