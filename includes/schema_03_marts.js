/**
 * schema_03_marts.js
 * ------------------------------------------------------------------
 * Column documentation for definitions/03_marts, dbt schema.yml style -
 * single source of truth consumed by the model config blocks. One entry
 * per gold table, one gold table per client sheet.
 */

const gold_weekly_performance = {
  description:
    "Gold layer - feeds the Weekly sheet. One row per Monday-Sunday week with the new/repeat/total split. Per the client workbook 'Visitors' are sessions (a session is new when it is the user's first ever, ga_session_number = 1) while 'Unique Visitors' are distinct users (new when their first_visit lands in this week). Conversion = orders / unique visitors, as a percentage. Orders are distinct transaction ids among the week's purchase events and revenue is the sum those events reported - GA4-aligned, so the mart reconciles with the GA4 UI and raw-table checks.",
  columns: {
    week_start_date: "Monday of the reporting week; partition column",
    week_end_date: "Sunday of the reporting week",
    visitors_new: "Sessions that were the user's first ever (ga_session_number = 1)",
    visitors_repeat: "Sessions beyond the user's first (unknown session_number counts as repeat)",
    visitors_total: "All sessions that started this week",
    unique_visitors_new: "Distinct users whose first_visit falls in this week",
    unique_visitors_repeat: "Distinct users active this week who first visited earlier",
    unique_visitors_total: "Distinct users active this week",
    product_views_new: "view_item events fired by new users this week",
    product_views_repeat: "view_item events fired by repeat users this week",
    product_views_total: "All view_item events this week",
    add_to_wishlist_new: "add_to_wishlist events fired by new users",
    add_to_wishlist_repeat: "add_to_wishlist events fired by repeat users",
    add_to_wishlist_total: "All add_to_wishlist events",
    add_to_cart_new: "add_to_cart events fired by new users",
    add_to_cart_repeat: "add_to_cart events fired by repeat users",
    add_to_cart_total: "All add_to_cart events",
    orders_new: "Distinct transaction ids among purchase events of users in their first-visit week",
    orders_repeat: "Distinct transaction ids among purchase events of repeat users",
    orders_total: "Distinct transaction ids among the week's purchase events",
    revenue_local_new: "Order revenue (property currency) from new users",
    revenue_local_repeat: "Order revenue (property currency) from repeat users",
    revenue_local_total: "Total order revenue in the property currency",
    revenue_usd_new: "Order revenue (USD) from new users",
    revenue_usd_repeat: "Order revenue (USD) from repeat users",
    revenue_usd_total: "Total order revenue in USD",
    conversion_pct_new: "orders_new / unique_visitors_new as a % (4 decimals - conversion runs near 0.1%)",
    conversion_pct_repeat: "orders_repeat / unique_visitors_repeat as a %",
    conversion_pct_total: "orders_total / unique_visitors_total as a %"
  }
};

const gold_channel_performance = {
  description:
    "Gold layer - feeds the Channel sheet. One row per month per marketing channel (GA4 primary channel group) plus a Total row per month. Visits/avg time/bounce come from the session table, unique visitors and funnel events from staged events, orders and revenue counted GA4-style off the month's purchase events. Conversion = orders / unique visitors; contribution percentages divide by the sum of the channel rows so they always total 100%. Swap includes/channel_groups.legacyDamasChannel() into the session/staging reads if the analysts ever want the old Adobe-era buckets.",
  columns: {
    month: "First day of the reporting month; partition column",
    marketing_channel: "GA4 default channel group, or 'Total' for the month roll-up row",
    visits: "Sessions attributed to the channel",
    unique_visitors: "Distinct users attributed to the channel",
    avg_time_on_site_secs: "Average session duration in seconds (sheet formats it as h:mm)",
    bounce_rate_flag_pct: "Bounce % by the session_engaged flag method",
    bounce_rate_3cond_pct: "Bounce % by the computed 3-condition method",
    product_views: "view_item events",
    cart_additions: "add_to_cart events",
    orders: "Distinct transaction ids among the month's purchase events",
    revenue_local: "Order revenue in the property currency",
    revenue_usd: "Order revenue in USD",
    conversion_pct: "orders / unique_visitors as a %",
    unique_product_viewers: "Distinct users who viewed at least one product",
    unique_cart_users: "Distinct users who added to cart at least once",
    traffic_contribution_pct: "unique_visitors / sum of the channel rows as a % - contributions always total 100%",
    order_contribution_pct: "orders / sum of the channel rows as a % - contributions always total 100%",
    ticket_size_local: "revenue_local / orders",
    ticket_size_usd: "revenue_usd / orders",
    row_sort: "0 on the Total row, 1 on channel rows - keeps Total pinned when the sheet sorts"
  }
};

const gold_device_performance = {
  description:
    "Gold layer - feeds the Device sheet. One row per month per device class (Desktop / Mobile / Tablet, app streams land as Mobile App automatically) plus a Total row. Traffic counts distinct users to match the client workbook - sessions ride along as their own column. Conversion = orders / traffic; Contribution = share of month revenue; Traffic Contr% = share of month traffic. Orders are distinct transaction ids among the month's purchase events; quantity and revenue are the sums those events reported (GA4-aligned).",
  columns: {
    month: "First day of the reporting month; partition column",
    device_class: "Desktop / Mobile / Tablet / Mobile App, or 'Total' for the month roll-up row",
    traffic: "Distinct users on the device (the workbook's Traffic column counts users, not sessions)",
    sessions: "Sessions on the device",
    product_views: "view_item events",
    add_to_cart: "add_to_cart events",
    bounce_rate_flag_pct: "Bounce % by the session_engaged flag method",
    bounce_rate_3cond_pct: "Bounce % by the computed 3-condition method",
    orders: "Distinct transaction ids among the device's purchase events this month",
    quantity: "Units sold (total_item_quantity summed over the purchase events)",
    revenue_local: "Order revenue in the property currency",
    revenue_usd: "Order revenue in USD",
    conversion_pct: "orders / traffic as a %",
    ticket_size_local: "revenue_local / orders",
    ticket_size_usd: "revenue_usd / orders",
    contribution_pct: "revenue_usd / month total revenue as a % (denominator = the Total row)",
    unique_product_viewers: "Distinct users who viewed at least one product",
    unique_cart_users: "Distinct users who added to cart at least once",
    traffic_contribution_pct: "traffic / month total traffic as a %",
    product_view_per_traffic_pct: "unique_product_viewers / traffic as a % (user-on-user funnel ratio)",
    cart_per_product_view_pct: "unique_cart_users / unique_product_viewers as a %",
    row_sort: "0 on the Total row, 1 on device rows"
  }
};

const gold_city_performance = {
  description:
    "Gold layer - feeds the City Working sheet. One row per month per city (city, state, country - blanks already folded to Unknown in staging) plus a Total row. Per the client workbook: Conversion = orders / unique visitors, Contribution = city share of month unique visitors, AUV = average unique visitors per day of the period (closed months divide by calendar days, the running month by days elapsed). Bounce comes from the session table; orders are distinct transaction ids among the month's purchase events and revenue is the sum those events reported (GA4-aligned).",
  columns: {
    month: "First day of the reporting month; partition column",
    city_display: "'City (State, Country)' label the sheet pivots on, or 'Total'",
    city: "City name ('Unknown' when unresolved, 'Total' on the roll-up row)",
    state: "Region/state name",
    country: "Country name",
    visits: "Sessions from the city",
    unique_visitors: "Distinct users from the city",
    product_detail_views: "view_item events",
    add_to_wishlist: "add_to_wishlist events",
    add_to_cart: "add_to_cart events",
    orders: "Distinct transaction ids among the city's purchase events this month",
    revenue_local: "Order revenue in the property currency",
    revenue_usd: "Order revenue in USD",
    bounce_rate_flag_pct: "Bounce % by the session_engaged flag method",
    bounce_rate_3cond_pct: "Bounce % by the computed 3-condition method",
    conversion_pct: "orders / unique_visitors as a %",
    contribution_pct: "unique_visitors / month total unique_visitors as a % (what the workbook calls Contribution here - not revenue share)",
    ticket_size_local: "revenue_local / orders",
    ticket_size_usd: "revenue_usd / orders",
    ac_vs_pv_pct: "add_to_cart / product_detail_views as a %",
    auv: "Average unique visitors per day of the period (the sheet's AUV column)",
    row_sort: "0 on the Total row, 1 on city rows"
  }
};

const gold_product_performance = {
  description:
    "Gold layer - feeds the Prod Working sheet. One row per reporting period per product category (plus a Grand Total row per period). Closed months report at month grain, the running month at Monday-Sunday week grain; on month rollover the weekly rows collapse into the final month row automatically. A product's visits/unique visitors count every session and user whose events carried the category in their items array. Orders are distinct transaction ids whose purchase events carried the category; revenue and quantity are the item-level sums those events reported (GA4-aligned). Conversion = orders / unique visitors, AUV = average unique visitors per day of the period.",
  columns: {
    period_start_date: "First day of the period (month start or week Monday); partition column",
    period_end_date: "Last day of the period (month end or week Sunday)",
    period_label: "'Jun-2026' for month rows, '01 Jun - 07 Jun' for week rows of the running month",
    period_type: "'month' or 'week'",
    product_category: "item_category from the items array, or 'Grand Total' for the period roll-up row",
    visits: "Distinct sessions whose events carried the category",
    unique_visitors: "Distinct users whose events carried the category",
    product_views: "view_item events carrying the category",
    product_views_per_visit: "product_views / visits",
    add_to_wishlist: "add_to_wishlist events carrying the category",
    cart_additions: "add_to_cart events carrying the category",
    orders: "Distinct transaction ids whose purchase events carried the category in the period",
    revenue_local: "Item revenue of the category in the property currency (summed off the purchase events)",
    revenue_usd: "Item revenue of the category in USD",
    quantity: "Units of the category sold",
    bounce_rate_flag_pct: "Bounce % (flag method) among sessions that touched the category",
    bounce_rate_3cond_pct: "Bounce % (3-condition method) among sessions that touched the category",
    conversion_pct: "orders / unique_visitors as a %",
    ac_vs_pv_pct: "cart_additions / product_views as a %",
    order_vs_cart_pct: "orders / cart_additions as a %",
    ticket_size_local: "revenue_local / orders",
    ticket_size_usd: "revenue_usd / orders",
    auv: "Average unique visitors per day of the period",
    row_sort: "0 on the Grand Total row, 1 on category rows"
  }
};

// the two page marts share their matrix shape (includes/page_views_mart.js),
// so their column docs share a builder too
function pageMatrixColumns(pageColumnName, pageColumnDesc) {
  return {
    week_start_date: "Monday of the reporting week; partition column",
    week_end_date: "Sunday of the reporting week",
    [pageColumnName]: pageColumnDesc,
    unique_visitors_organic: "Distinct users from organic channels who viewed the page",
    unique_visitors_paid: "Distinct users from paid channels who viewed the page",
    unique_visitors_total: "Distinct users from all channels who viewed the page",
    page_views_organic: "page_view events from organic channels",
    page_views_paid: "page_view events from paid channels",
    page_views_total: "page_view events from all channels",
    page_views_per_visit_organic: "Organic page views / organic sessions on the page",
    page_views_per_visit_paid: "Paid page views / paid sessions on the page",
    page_views_per_visit_total: "All page views / all sessions on the page",
    bounce_rate_flag_organic: "Bounce % (flag method) of organic sessions that saw the page",
    bounce_rate_flag_paid: "Bounce % (flag method) of paid sessions that saw the page",
    bounce_rate_flag_total: "Bounce % (flag method) of all sessions that saw the page",
    bounce_rate_3cond_organic: "Bounce % (3-condition method) of organic sessions that saw the page",
    bounce_rate_3cond_paid: "Bounce % (3-condition method) of paid sessions that saw the page",
    bounce_rate_3cond_total: "Bounce % (3-condition method) of all sessions that saw the page",
    exit_rate_organic: "Organic sessions that ended on this page / organic page views, as a %",
    exit_rate_paid: "Paid sessions that ended on this page / paid page views, as a %",
    exit_rate_total: "All sessions that ended on this page / all page views, as a %",
    row_sort: "0 on the Grand Total row, 1 on page rows"
  };
}

const gold_plp_views_weekly = {
  description:
    "Gold layer - feeds the PLP Views sheet. One row per Monday-Sunday week per product listing page (slug = last URL path segment of page_views tagged page_type = PLP, .html stripped) plus a Grand Total row per week. Unique visitors, page views, page views per visit, both bounce rates and exit rate, each split organic / paid / total on GA4's default channel group. Exit = the session's last page_view landed on this page. Shares its SQL shape with gold_custom_page_views_weekly via includes/page_views_mart.js.",
  columns: pageMatrixColumns("plp_page", "Listing page slug from the URL path, or 'Grand Total' for the week roll-up row")
};

const gold_custom_page_views_weekly = {
  description:
    "Gold layer - feeds the Custom Page Views sheet. One row per Monday-Sunday week per page type (the site's page_type tag: Home / PLP / PDP / Cart / Checkout / Others, untagged page_views fall into Others) plus a Grand Total row per week. Unique visitors, page views, page views per visit, both bounce rates and exit rate, each split organic / paid / total on GA4's default channel group. Shares its SQL shape with gold_plp_views_weekly via includes/page_views_mart.js.",
  columns: pageMatrixColumns("page_name", "Page type bucket (Home / PLP / PDP / Cart / Checkout / Others), or 'Grand Total' for the week roll-up row")
};

const gold_city_browsing_depth_weekly = {
  description:
    "Gold layer - feeds the Depth cities working sheet. One row per Monday-Sunday week per city plus a Grand Total row. Users, sessions, sessions per user, pages per session, share of sessions with 5+ and 10+ product detail views (the sheet's PDP intent columns), add-to-cart per add-to-wishlist ratio and both bounce rates. Built purely from int_ga4_sessions - no event scan needed, which is what makes this mart almost free.",
  columns: {
    week_start_date: "Monday of the reporting week; partition column",
    week_end_date: "Sunday of the reporting week",
    city_display: "'City (State, Country)' label, or 'Grand Total'",
    city: "City name ('Unknown' when unresolved)",
    state: "Region/state name",
    country: "Country name",
    users: "Distinct users from the city this week",
    sessions: "Sessions from the city this week",
    page_views: "page_view events summed off the session table",
    sessions_per_user: "sessions / users",
    pages_per_session: "page_views / sessions",
    pdp_intent_5_pct: "Sessions with 5 or more view_item events / sessions, as a % (the sheet's 5PDP intent)",
    pdp_intent_10_pct: "Sessions with 10 or more view_item events / sessions, as a % (the sheet's 10PDP intent)",
    cart_per_wishlist: "add_to_cart events / add_to_wishlist events",
    bounce_rate_flag_pct: "Bounce % by the session_engaged flag method",
    bounce_rate_3cond_pct: "Bounce % by the computed 3-condition method",
    row_sort: "0 on the Grand Total row, 1 on city rows"
  }
};

const gold_funnel_user = {
  description: "Gold layer - monthly device funnel mart at user level. Open funnel with visits, product views, cart and orders (distinct users) by device class with conversion ratios.",
  columns: {
    month: "First day of the month",
    device_class: "Device classification (Mobile, Desktop, Tablet, Mobile App, Unknown)",
    visits: "Count of distinct sessions",
    product_views: "Count of distinct users who viewed a product",
    cart: "Count of distinct users who added to cart",
    orders: "Count of distinct users who made a valid purchase",
    cart_per_pv: "Cart users / product view users × 100",
    order_per_cart: "Order users / cart users × 100",
    conversion: "Order users / visits × 100",
    row_sort: "0 for Total row, 1 for device rows"
  }
};

const gold_funnel_events = {
  description: "Gold layer - monthly device funnel mart at event level. Open funnel with visits, product views, cart events and distinct orders by device class with conversion ratios.",
  columns: {
    month: "First day of the month",
    device_class: "Device classification (Mobile, Desktop, Tablet, Mobile App, Unknown)",
    visits: "Count of distinct sessions",
    product_views: "Total view_item event count",
    cart: "Total add_to_cart event count",
    orders: "Count of distinct valid transactions",
    cart_per_pv: "Cart events / product view events × 100",
    order_per_cart: "Orders / cart events × 100",
    conversion: "Orders / visits × 100",
    row_sort: "0 for Total row, 1 for device rows"
  }
};

const gold_events_hourly = {
  description:
    "Gold layer - definitions/03_marts/hourly_data/events_hourly.sqlx. Realtime/near-realtime event volume, incrementally refreshed with the last 6 hours appended per run (full refresh scans the trailing 1 day). One row per event_date/event_name/event_timestamp grain. event_count is a raw row count off stg_ga4_events with no dedup by user or session - built for freshness/anomaly monitoring against the GA4 realtime UI, not for reconciliation with the daily/weekly/monthly gold marts above. The freshness assertion checks event_timestamp against the same 6-hour window the incremental load uses, so a stale load gets caught within the run cadence instead of up to a day later.",
  columns: {
    event_date: "Date of the event (partition column)",
    event_name: "GA4 event name (cluster column)",
    event_timestamp: "Event timestamp; also the column the freshness assertion checks against the 6-hour incremental window",
    event_count: "Raw count of events for this event_date/event_name/event_timestamp grain, no dedup applied"
  }
};


module.exports = {
  gold_weekly_performance,
  gold_channel_performance,
  gold_device_performance,
  gold_city_performance,
  gold_product_performance,
  gold_plp_views_weekly,
  gold_custom_page_views_weekly,
  gold_city_browsing_depth_weekly,
  gold_funnel_user,
  gold_funnel_events,
  gold_events_hourly
};