/**
 * channel_groups.js
 * ------------------------------------------------------------------
 * Channel taxonomy helpers. Two flavours exist on purpose:
 *
 * 1. organicPaidBucket() - folds GA4's default channel group into the
 *    organic / paid / other axis the PLP and page-view sheets pivot on.
 * 2. legacyDamasChannel() - reproduction of the channel buckets the
 *    client used in the old Adobe-era workbook (Paid / Organic /
 *    Direct / Referring Domains / Internal). Not wired into any mart
 *    by default; swap it in for marketing_channel if the analysts ask
 *    for the historical grouping instead of GA4's.
 */

const ORGANIC_GROUPS = ["Organic Search", "Organic Social", "Organic Video", "Organic Shopping"];
const PAID_GROUPS = ["Paid Search", "Paid Social", "Paid Video", "Paid Shopping", "Paid Other", "Display", "Cross-network"];

function organicPaidBucket(channelGroupCol) {
  const quote = (arr) => arr.map((v) => `'${v}'`).join(", ");
  return `CASE
    WHEN ${channelGroupCol} IN (${quote(ORGANIC_GROUPS)}) THEN 'organic'
    WHEN ${channelGroupCol} IN (${quote(PAID_GROUPS)}) THEN 'paid'
    ELSE 'other'
  END`;
}

function legacyDamasChannel(sourceCol, mediumCol) {
  return `CASE
    WHEN LOWER(${sourceCol}) = '(direct)' AND LOWER(${mediumCol}) = '(none)' THEN 'Direct'
    WHEN LOWER(${mediumCol}) = 'organic' THEN 'Organic'
    WHEN LOWER(${mediumCol}) LIKE '%referral%' THEN 'Referring Domains'
    WHEN LOWER(${mediumCol}) = 'internal' THEN 'Internal'
    WHEN ${sourceCol} IS NULL AND ${mediumCol} IS NULL THEN 'Unassigned'
    ELSE 'Paid'
  END`;
}

module.exports = { organicPaidBucket, legacyDamasChannel, ORGANIC_GROUPS, PAID_GROUPS };
