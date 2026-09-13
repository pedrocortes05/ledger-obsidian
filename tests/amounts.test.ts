import {
  defaultCommodityInfo,
  formatAmount,
  formatAmountMap,
  formatQuantity,
  parseAmount,
} from '../src/amounts';

describe('parseAmount()', () => {
  test('returns the remainder', () => {
    const result = parseAmount('10.50 USD @ $17');
    expect(result?.amount).toMatchObject({ commodity: 'USD', quantity: 10.5 });
    expect(result?.rest).toEqual(' @ $17');
  });

  test('records the written style', () => {
    expect(parseAmount('$-1,000.5')?.amount).toMatchObject({
      prefix: true,
      spaced: false,
      negativeBeforeSymbol: false,
      thousands: true,
      precision: 1,
      quantity: -1000.5,
    });
  });

  test('rejects text without a number', () => {
    expect(parseAmount('USD')).toBeUndefined();
    expect(parseAmount('')).toBeUndefined();
  });
});

describe('formatQuantity()', () => {
  test('pads without truncating', () => {
    expect(formatQuantity(5, 2)).toEqual('5.00');
    expect(formatQuantity(0.00719462, 2)).toEqual('0.00719462');
    expect(formatQuantity(0.1 + 0.2, 2)).toEqual('0.30');
    expect(formatQuantity(1234567.5, 2, true)).toEqual('1,234,567.50');
  });
});

describe('formatAmount()', () => {
  test('uses commodity style', () => {
    expect(formatAmount({ commodity: '$', quantity: -10 })).toEqual('-$10.00');
    expect(formatAmount({ commodity: 'USD', quantity: 10 })).toEqual(
      '10.00 USD',
    );
    expect(
      formatAmount(
        { commodity: '$', quantity: -10 },
        { ...defaultCommodityInfo('$'), negativeBeforeSymbol: false },
      ),
    ).toEqual('$-10.00');
    expect(formatAmount({ commodity: 'Gel Beta Fuel', quantity: 30 })).toEqual(
      '30.00 "Gel Beta Fuel"',
    );
    expect(
      formatAmount(
        { commodity: 'SOL', quantity: 1 },
        { ...defaultCommodityInfo('SOL'), precision: 8 },
      ),
    ).toEqual('1.00 SOL');
  });

  test('formats multiple commodities and hides zero', () => {
    const map = new Map([
      ['$', 500],
      ['USD', 20],
      ['EUR', 0.001],
    ]);
    expect(formatAmountMap(map, new Map())).toEqual('$500.00, 20.00 USD');
  });
});
