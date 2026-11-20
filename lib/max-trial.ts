export const WELINK_ACCESS_CODE = "WELINK";
export const WELINK_MAX_TRIAL_DAYS = 90;
export const WELINK_MAX_TRIAL_LABEL = "WELINK · 三个月 MAX 体验";
export const WELINK_MAX_TRIAL_ANNOUNCEMENT_TASK = "welink_max_trial_20261025_announcement";

// Calendar months in the platform's Asia/Shanghai time zone, clamped to the
// final day of the destination month (for example Nov 30 -> Feb 28).
export function welinkMaxTrialEndsAt(startsAt: Date) {
  const offsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(startsAt.getTime() + offsetMs);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, lastDay));
  return new Date(local.getTime() - offsetMs);
}

