/**
 * schema_00_sources.js
 * ------------------------------------------------------------------
 * Column documentation for definitions/00_sources - the raw GA4 export
 * declarations. One entry per model, dbt schema.yml style: each .sqlx
 * pulls its description and columns from here, so docs live in exactly
 * one place per folder and land in BigQuery table metadata on deploy.
 * Only the raw columns the pipeline actually reads are documented.
 */

const ga4_daily_events = {
  description:
    "GA4 daily export shards, one table per day. Declared as events_2* (not events_*) so the wildcard can never swallow the events_intraday_* shards and double count streaming rows. Shards are finalised by Google up to ~72h after the date - the staging model re-reads a trailing window to pick up restatements.",
  columns: {
    event_date: "Date of the event as a YYYYMMDD string (matches the table suffix except for late-arriving hits)",
    event_timestamp: "Microseconds since epoch (UTC) when the event was collected",
    event_name: "GA4 event name, e.g. page_view, view_item, purchase",
    user_pseudo_id: "Device/browser scoped pseudonymous user id; NULL when consent denies analytics storage",
    event_params: "Repeated key/value record of event parameters; the same key can arrive typed as string, int or double",
    event_bundle_sequence_id: "Id of the upload bundle the event arrived in - several events share one bundle and one timestamp",
    batch_event_index: "Position of the event inside its batch; part of what makes a GA4 row physically unique",
    batch_page_id: "Id of the page the batch was collected from",
    batch_ordering_id: "Ordering id of the batch within the page",
    device: "Device struct: category, browser, OS, web_info (hostname)",
    geo: "Geo struct resolved from IP: city, region, country, continent",
    traffic_source: "User-scoped first-touch attribution struct (not used by the marts - session attribution comes from session_traffic_source_last_click)",
    session_traffic_source_last_click: "Session-scoped last-click attribution struct incl. cross_channel_campaign.primary_channel_group (GA4 default channel group)",
    ecommerce: "Order header struct on purchase events: transaction_id, purchase_revenue, purchase_revenue_in_usd, total_item_quantity",
    items: "Repeated item record on commerce events: id, name, category, price, quantity, revenue",
    platform: "Collection platform: WEB, ANDROID or IOS",
    stream_id: "Numeric id of the GA4 data stream"
  }
};

const ga4_intraday_events = {
  description:
    "GA4 streaming (intraday) shards, same schema as the daily export. Google drops a shard once its daily table lands, but a shard can outlive its date if the daily export is delayed or skipped - so staging takes intraday rows for every date that has no daily shard yet, not just today. Streaming rows may contain occasional duplicates; staging dedupes them on the full physical key.",
  columns: {
    event_date: "Date of the event as a YYYYMMDD string",
    event_timestamp: "Microseconds since epoch (UTC) when the event was collected",
    event_name: "GA4 event name",
    user_pseudo_id: "Device/browser scoped pseudonymous user id"
  }
};

module.exports = { ga4_daily_events, ga4_intraday_events };
