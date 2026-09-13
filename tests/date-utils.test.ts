import { makeBuckets, presetRange, suggestInterval } from '../src/date-utils';
import moment from 'moment';

describe('makeBuckets()', () => {
  test('months are calendar aligned and clipped to the range', () => {
    expect(
      makeBuckets('month', moment('2021-11-15'), moment('2022-01-10')),
    ).toEqual([
      { startISO: '2021-11-15', endISO: '2021-11-30' },
      { startISO: '2021-12-01', endISO: '2021-12-31' },
      { startISO: '2022-01-01', endISO: '2022-01-10' },
    ]);
  });

  test('single day range', () => {
    expect(makeBuckets('week', moment('2021-12-01'), moment('2021-12-01'))).toEqual(
      [{ startISO: '2021-12-01', endISO: '2021-12-01' }],
    );
  });

  test('days', () => {
    expect(
      makeBuckets('day', moment('2021-12-30'), moment('2022-01-01')).map(
        (b) => b.endISO,
      ),
    ).toEqual(['2021-12-30', '2021-12-31', '2022-01-01']);
  });

  test('end before start', () => {
    expect(makeBuckets('day', moment('2022-01-02'), moment('2022-01-01'))).toEqual(
      [],
    );
  });

  test('does not mutate the inputs', () => {
    const start = moment('2021-01-01');
    const end = moment('2021-03-01');
    makeBuckets('month', start, end);
    expect(start.format('YYYY-MM-DD')).toEqual('2021-01-01');
    expect(end.format('YYYY-MM-DD')).toEqual('2021-03-01');
  });
});

describe('presetRange()', () => {
  test('all time spans from the first to the last transaction', () => {
    const range = presetRange('all-time', moment('2020-05-05'), moment('2999-01-01'));
    expect(range.start.format('YYYY-MM-DD')).toEqual('2020-05-05');
    expect(range.end.format('YYYY-MM-DD')).toEqual('2999-01-01');
  });

  test('year to date ends today when there are no future transactions', () => {
    const range = presetRange('ytd', moment('2020-01-01'), moment('2020-01-02'));
    expect(range.start.format('MM-DD')).toEqual('01-01');
    expect(range.end.isSame(moment(), 'day')).toBe(true);
  });
});

test('suggestInterval()', () => {
  expect(suggestInterval(moment('2024-01-01'), moment('2024-01-20'))).toEqual('day');
  expect(suggestInterval(moment('2024-01-01'), moment('2024-05-01'))).toEqual('week');
  expect(suggestInterval(moment('2021-01-01'), moment('2024-01-01'))).toEqual('month');
  expect(suggestInterval(moment('2010-01-01'), moment('2024-01-01'))).toEqual('year');
});
