import { Moment } from 'moment';

export type Interval = 'day' | 'week' | 'month' | 'year';

export type DatePreset =
  | 'this-month'
  | 'last-3-months'
  | 'ytd'
  | 'last-12-months'
  | 'all-time'
  | 'custom';

export const datePresets: [DatePreset, string][] = [
  ['this-month', 'This month'],
  ['last-3-months', 'Last 3 months'],
  ['ytd', 'Year to date'],
  ['last-12-months', 'Last 12 months'],
  ['all-time', 'All time'],
];

export const ISO_FORMAT = 'YYYY-MM-DD';

export const toISO = (date: Moment): string => date.format(ISO_FORMAT);

export const fromISO = (date: string): Moment =>
  window.moment(date, ISO_FORMAT);

export interface Bucket {
  /** First day of the bucket (inclusive). */
  startISO: string;
  /** Last day of the bucket (inclusive). */
  endISO: string;
}

/**
 * makeBuckets splits the range into calendar-aligned periods (weeks, months,
 * ...). The first and last buckets are clipped to the range so the last,
 * partial period is always included.
 */
export const makeBuckets = (
  interval: Interval,
  startDate: Moment,
  endDate: Moment,
): Bucket[] => {
  const buckets: Bucket[] = [];
  const end = endDate.clone().startOf('day');
  let current = startDate.clone().startOf('day');
  if (current.isAfter(end)) {
    return buckets;
  }

  while (!current.isAfter(end)) {
    const periodEnd = current.clone().endOf(interval).startOf('day');
    const bucketEnd = periodEnd.isAfter(end) ? end : periodEnd;
    buckets.push({ startISO: toISO(current), endISO: toISO(bucketEnd) });
    current = bucketEnd.clone().add(1, 'day');
  }
  return buckets;
};

export const formatBucketLabel = (bucket: Bucket, interval: Interval): string => {
  const start = fromISO(bucket.startISO);
  switch (interval) {
    case 'day':
    case 'week':
      return start.format('MMM D');
    case 'month':
      return start.format('MMM YY');
    case 'year':
      return start.format('YYYY');
  }
};

/**
 * suggestInterval picks an interval that keeps the number of chart points
 * readable.
 */
export const suggestInterval = (start: Moment, end: Moment): Interval => {
  const days = end.diff(start, 'days');
  if (days <= 45) {
    return 'day';
  }
  if (days <= 200) {
    return 'week';
  }
  if (days <= 365 * 4) {
    return 'month';
  }
  return 'year';
};

/**
 * presetRange returns the start and end date for a preset. The end date is the
 * later of today and the last transaction, so future-dated transactions are
 * included.
 */
export const presetRange = (
  preset: DatePreset,
  firstDate: Moment,
  lastDate: Moment,
): { start: Moment; end: Moment } => {
  const today = window.moment().startOf('day');
  const end = lastDate.isAfter(today) ? lastDate.clone() : today;
  switch (preset) {
    case 'this-month':
      return { start: today.clone().startOf('month'), end };
    case 'last-3-months':
      return {
        start: today.clone().subtract(2, 'months').startOf('month'),
        end,
      };
    case 'ytd':
      return { start: today.clone().startOf('year'), end };
    case 'last-12-months':
      return {
        start: today.clone().subtract(11, 'months').startOf('month'),
        end,
      };
    case 'all-time':
    case 'custom':
      return { start: firstDate.clone().startOf('day'), end };
  }
};
