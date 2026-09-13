import {
  BalanceHistory,
  makeAccountSeries,
  makeBudgetRows,
  makeNetWorthSeries,
  netWorthAt,
  removeDuplicateAccounts,
} from '../src/balance-utils';
import { makeBuckets } from '../src/date-utils';
import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import moment from 'moment';

const settings = settingsWithDefaults({});

const cache = parse(
  `2024/01/01 Opening
    Assets:Checking    $1000
    Assets:Brokerage    2 AAPL @ $150
    Liabilities:Card    -$200
    Equity:Opening

2024/01/15 (Budget:Trip) Groceries
    Expenses:Food    $50
    (Budget:Trip)    -$50
    Liabilities:Card

2024/02/01 Salary
    Assets:Checking    20 USD
    Income:Salary

2030/01/01 Future
    Expenses:Food    $10
    Assets:Checking`,
  settings,
);

describe('BalanceHistory', () => {
  const history = new BalanceHistory(cache.transactions);

  test('balance at a date includes sub-accounts and keeps commodities apart', () => {
    expect(history.balanceAt('Assets', '2024-01-31')).toEqual(
      new Map([
        ['$', 1000],
        ['AAPL', 2],
      ]),
    );
    expect(history.balanceAt('Assets', '2024-02-01').get('USD')).toEqual(20);
    expect(history.balanceAt('Assets', '2023-12-31')).toEqual(new Map());
  });

  test('future transactions are included', () => {
    expect(history.balanceAt('Assets:Checking', '2030-01-01').get('$')).toEqual(
      990,
    );
  });

  test('change between dates', () => {
    expect(
      history.changeBetween('Liabilities', '2024-01-02', '2024-01-31'),
    ).toEqual(new Map([['$', -50]]));
  });

  test('net worth per commodity', () => {
    expect(netWorthAt(history, settings, '2024-02-01')).toEqual(
      new Map([
        ['$', 750],
        ['AAPL', 2],
        ['USD', 20],
      ]),
    );
  });

  test('series per bucket end', () => {
    const buckets = makeBuckets('month', moment('2024-01-10'), moment('2024-02-05'));
    expect(makeNetWorthSeries(history, settings, buckets, '$')).toEqual([
      750, 750,
    ]);
    expect(
      makeAccountSeries(history, 'Expenses', buckets, '$', 'change'),
    ).toEqual([50, 0]);
    expect(
      makeAccountSeries(history, 'Assets', buckets, 'USD', 'balance'),
    ).toEqual([0, 20]);
  });
});

describe('makeBudgetRows()', () => {
  test('summarizes virtual accounts for the range', () => {
    expect(
      makeBudgetRows(
        cache.transactions,
        cache.virtualAccounts,
        '2024-01-01',
        '2024-12-31',
      ),
    ).toEqual([
      {
        account: 'Budget:Trip',
        commodity: '$',
        added: 0,
        spent: 50,
        remaining: -50,
      },
    ]);
  });
});

describe('removeDuplicateAccounts()', () => {
  test('When there is only one account with one layer', () => {
    const input = ['Liabilities'];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(input);
  });
  test('When there is only one account with multiple layers', () => {
    const input = ['Liabilities:Credit:Chase'];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(input);
  });
  test('When there are two unrelated accounts', () => {
    const input = ['Liabilities:Credit:Chase', 'Expenses:Food'];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(input);
  });
  test('When there are two accounts that overlap', () => {
    const input = ['Liabilities:Credit:Chase', 'Liabilities:Loans'];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(input);
  });
  test('When there are two are parent accounts to keep', () => {
    const input = [
      'Liabilities:Credit:Chase',
      'Liabilities:Loans',
      'Liabilities',
    ];
    const expected = [
      'Liabilities',
      'Liabilities:Credit:Chase',
      'Liabilities:Loans',
    ];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(expected);
  });
  test('When there are two are parent accounts to keep in a different order', () => {
    const input = [
      'Liabilities',
      'Liabilities:Credit:Chase',
      'Liabilities:Loans',
    ];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(input);
  });
  test('When there are parent accounts to remove', () => {
    const input = [
      'Liabilities',
      'Liabilities:Credit:Chase',
      'Liabilities:Credit',
      'Liabilities:Loans',
    ];
    const expected = [
      'Liabilities',
      'Liabilities:Credit:Chase',
      'Liabilities:Loans',
    ];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(expected);
  });
  test('When there are multiple parents to remove', () => {
    const input = [
      'Liabilities',
      'Liabilities:Credit:Chase',
      'Liabilities:Credit',
      'Liabilities:Loans:House',
      'Liabilities:Loans',
    ];
    const expected = [
      'Liabilities',
      'Liabilities:Credit:Chase',
      'Liabilities:Loans:House',
    ];
    const result = removeDuplicateAccounts(input);
    expect(result).toEqual(expected);
  });
});
