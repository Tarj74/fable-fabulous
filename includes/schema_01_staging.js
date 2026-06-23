/**
 * schema_01_staging.js
 * ------------------------------------------------------------------
 * Column documentation for definitions/01_staging, dbt schema.yml
 * style - single source of truth consumed by the model config blocks.
 */

const stg_ga4_events = {
  description:
    "Staging layer - one row per GA4 event, daily and intraday shards merged. Daily shard wins for any date it exists; intraday fills every date still waiting for its daily export (not just today). Only the columns the marts actually use are read and kept, typed and cleaned. Refreshed with a delete+insert on the trailing window (vars.lookback_days), so restated shards replace cleanly without MERGE key gymnastics.",
  columns: {
    event_date: "Event date as DATE; partition column",
    event_timestamp: "Event collection time as TIMESTAMP (UTC)",
    event_name: "GA4 event name, e.g. page_view, view_item, add_to_cart, purchase",
    user_pseudo_id: "Device/browser scoped pseudonymous user id",
    ga_session_id: "Session id from event_params; only unique per user - combine with user_pseudo_id (see session_key in int_ga4_sessions)",
    ga_session_number: "How many sessions the user had had including this one; 1 = first ever session",
    session_engaged: "Raw session_engaged param normalised to STRING. Read from string AND int variants - the source sends both encodings",
    engagement_time_msec: "Foreground engagement time in milliseconds reported by this event",
    page_location: "Full page URL including query string",
    page_path: "URL path extracted from page_location ('/' when it cannot be parsed)",
    page_title: "Document title at collection time",
    page_type: "Site's page classification param, normalised to one casing: Home / PLP / PDP / Cart / Checkout / Others; NULL when the page is untagged",
    device_category: "GA4 device category: desktop, mobile or tablet",
    device_class: "Reporting device split: Desktop / Mobile / Tablet from device_category, app streams (ANDROID/IOS) become 'Mobile App'",
    platform: "Collection platform: WEB, ANDROID or IOS",
    hostname: "Hostname the hit was collected on; kept so dev/test traffic can be filtered later if the team decides to",
    geo_city: "City from IP geo; blank/NULL folded to 'Unknown'",
    geo_region: "Region/state from IP geo; blank/NULL folded to 'Unknown'",
    geo_country: "Country from IP geo; blank/NULL folded to 'Unknown'",
    channel_group: "GA4 default channel group of the session's last click (Direct, Organic Search, Referral, ...); NULL folded to 'Unassigned'",
    manual_source: "utm_source of the session's last click; only needed if the legacy Damas channel grouping is ever swapped in",
    manual_medium: "utm_medium of the session's last click; companion to manual_source",
    transaction_id: "Order id on purchase events; NULL on everything else",
    revenue_local: "Order revenue in the property currency (purchase events only; the source often leaves this NULL and fills the USD field)",
    revenue_usd: "Order revenue converted to USD by GA4",
    item_quantity: "Total units in the order (ecommerce.total_item_quantity)",
    items: {
      description: "Line items carried by commerce events, trimmed to what the product mart reads",
      columns: {
        item_id: "Product id",
        item_name: "Product display name",
        item_category: "Product category - the grain of the product mart; blank folded to '(not set)'",
        quantity: "Units of this item",
        item_revenue: "Item revenue in the property currency",
        item_revenue_in_usd: "Item revenue converted to USD"
      }
    },
    shard_type: "Which export the row came from: 'daily' or 'intraday' - intraday rows upgrade to daily on a later run"
  }
};

module.exports = { stg_ga4_events };
