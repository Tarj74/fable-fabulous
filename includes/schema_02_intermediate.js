/**
 * schema_02_intermediate.js
 * ------------------------------------------------------------------
 * Column documentation for definitions/02_intermediate, dbt schema.yml
 * style - single source of truth consumed by the model config blocks.
 */

const int_ga4_sessions = {
  description:
    "Intermediate layer - one row per session (user_pseudo_id x ga_session_id) with both bounce flags, engagement, per-session event counts and session-scoped dimensions. Every mart that needs visits, bounce rate, time on site or browsing depth reads this table instead of re-deriving sessions from raw events.",
  columns: {
    session_key: "user_pseudo_id + '-' + ga_session_id; the real session grain (ga_session_id alone repeats across users)",
    user_pseudo_id: "Owner of the session",
    ga_session_id: "GA4 session id within the user",
    session_number: "The user's session counter; 1 = first ever session, which is what splits new vs repeat visits",
    session_date: "Date of the session's first event; partition column",
    session_start: "Timestamp of the first event in the session",
    session_end: "Timestamp of the last event in the session",
    duration_seconds: "session_end - session_start in seconds",
    is_bounced_flag: "1 when no event in the session carried session_engaged = '1' (bounce method 'flag', see includes/bounce_rate.js)",
    is_bounced_3cond: "1 when the session lasted under 10s AND had fewer than 2 page_views AND no purchase (bounce method '3cond')",
    events: "Total events in the session",
    pageviews: "page_view events in the session",
    product_views: "view_item events in the session; drives the PDP-depth intent metrics",
    cart_additions: "add_to_cart events in the session",
    wishlist_additions: "add_to_wishlist events in the session",
    purchase_events: "purchase events in the session (marts count orders as distinct transaction ids, GA4-style)",
    engagement_time_msec: "Summed engagement_time_msec across the session's events",
    device_category: "GA4 device category, session scoped (MAX over events - constant within a session, skips NULLs)",
    device_class: "Reporting device split: Desktop / Mobile / Tablet / Mobile App",
    channel_group: "GA4 default channel group of the session's last click",
    manual_source: "utm_source of the session's last click",
    manual_medium: "utm_medium of the session's last click",
    geo_city: "Session city ('Unknown' when unresolved)",
    geo_region: "Session region ('Unknown' when unresolved)",
    geo_country: "Session country ('Unknown' when unresolved)"
  }
};

const int_user_first_visit = {
  description:
    "Intermediate layer - one row per user_pseudo_id with the date of their GA4 first_visit event. The weekly report classifies a user as new in the week this date falls into and repeat afterwards. Users with no first_visit in the export existed before tracking started and stay repeat. Keyed MERGE is safe here: first_visit fires once per device, ever.",
  columns: {
    user_pseudo_id: "Pseudonymous user id; unique in this table",
    first_visit_date: "Date of the user's first_visit event",
    first_visit_week: "Monday of the week first_visit_date falls in; precomputed because three marts group by it"
  }
};

module.exports = { int_ga4_sessions, int_user_first_visit };
