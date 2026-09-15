import {
  compareMetadataValues,
  describeFilter,
  formatMetadataComment,
  isMetadataOnly,
  matchesMetadata,
  nextNumericValue,
  parseMetadata,
  stripMetadata,
} from '../src/metadata';

describe('parseMetadata()', () => {
  test.each([
    ['Edition: 26', { Edition: '26' }],
    [':unreviewed:', { unreviewed: '' }],
    [':bank:unreviewed:', { bank: '', unreviewed: '' }],
    ['note Edition: 26', { Edition: '26' }],
    [
      ':a: event: [[2026-09-09 El Perihuete]]',
      { a: '', event: '[[2026-09-09 El Perihuete]]' },
    ],
    ['Amount:: 10 USD', { Amount: '10 USD' }],
    ['milk and eggs', {}],
    ['see https://example.com at 12:30', {}],
    ['', {}],
  ])('%s', (comment, expected) => {
    expect(parseMetadata(comment)).toEqual(expected);
  });
});

test('isMetadataOnly()', () => {
  expect(isMetadataOnly('Edition: 26')).toBe(true);
  expect(isMetadataOnly(':a:b:')).toBe(true);
  expect(isMetadataOnly(':a: :b:')).toBe(true);
  expect(isMetadataOnly('paid in cash Edition: 26')).toBe(false);
  expect(isMetadataOnly('just a note')).toBe(false);
});

test('stripMetadata()', () => {
  expect(stripMetadata('Edition: 26')).toEqual('');
  expect(stripMetadata('lunch :work: Edition: 26')).toEqual('lunch');
  expect(stripMetadata('plain memo')).toEqual('plain memo');
});

test('formatMetadataComment()', () => {
  expect(formatMetadataComment('Edition', ' 26 ')).toEqual('Edition: 26');
  expect(formatMetadataComment('reviewed', '')).toEqual(':reviewed:');
});

test('matchesMetadata() and describeFilter()', () => {
  const metadata = { Edition: '26', bank: '' };
  expect(matchesMetadata(metadata, { key: 'Edition' })).toBe(true);
  expect(matchesMetadata(metadata, { key: 'Edition', value: '26' })).toBe(true);
  expect(matchesMetadata(metadata, { key: 'Edition', value: '27' })).toBe(
    false,
  );
  expect(matchesMetadata(metadata, { key: 'bank', value: '' })).toBe(true);
  expect(matchesMetadata(metadata, { key: 'trip', missing: true })).toBe(true);
  expect(matchesMetadata(metadata, { key: 'Edition', missing: true })).toBe(
    false,
  );
  expect(describeFilter({ key: 'Edition', value: '26' })).toEqual(
    'Edition = 26',
  );
  expect(describeFilter({ key: 'Edition', missing: true })).toEqual(
    'no Edition',
  );
});

test('nextNumericValue() and compareMetadataValues()', () => {
  expect(nextNumericValue(['24', '26', '25'])).toEqual('27');
  expect(nextNumericValue(['boston', 'cdmx'])).toBeUndefined();
  expect(nextNumericValue([])).toBeUndefined();
  expect(['9', '26', '10'].sort(compareMetadataValues)).toEqual([
    '26',
    '10',
    '9',
  ]);
});
