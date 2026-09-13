import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import {
  dealiasAccount,
  filterByAccount,
  formatTransaction,
  getTransactionTotal,
  hasTag,
  inferTxType,
  makeAccountTree,
  Node,
  removeTag,
  sortAccountTree,
  sortByDateDesc,
} from '../src/transaction-utils';

const settings = settingsWithDefaults({});

describe('formatTransaction()', () => {
  test('unchanged transactions round-trip exactly', () => {
    const contents = `2024/06/05=2024/06/06 * (Budget:Boston) XBI sale  ; note
    ; event: [[2024-06-05 Sale]]
\t Assets:Cash    $4771.61 @@ 272.06 USD
    Assets:USA    -2.90 XBI {89.3931034483 USD} [2024/06/03] @@ 272.06 USD
    (Budget:Boston)    -34.73 USD  ; memo
    Assets:Checking    = $8816.51
    Income:Capital Gains`;
    const cache = parse(contents, settings);
    expect(
      formatTransaction(cache.transactions[0], cache.commodityMap),
    ).toEqual(contents);
  });

  test('new postings use the commodity style and keep precision', () => {
    const cache = parse(
      `2024/01/01 A
    Expenses:X    -$1,000.00
    Assets:Y    1.5 SOL
    Assets:Z`,
      settings,
    );
    const tx = cache.transactions[0];
    tx.value.expenselines.forEach((line) => {
      line.raw = '';
    });
    const postings = tx.value.expenselines;
    if ('account' in postings[1]) {
      postings[1].amount = 0.00719462;
      postings[1].precision = 8;
    }
    if ('account' in postings[2]) {
      postings[2].virtual = '(';
    }
    expect(formatTransaction(tx, cache.commodityMap)).toEqual(`2024/01/01 A
    Expenses:X    -$1,000.00
    Assets:Y    0.00719462 SOL
    (Assets:Z)`);
  });

  test('explicit zero amounts are written', () => {
    const cache = parse(
      '2024/01/01 A\n  Assets:X  $0.00\n  Equity  $0',
      settings,
    );
    const tx = cache.transactions[0];
    tx.value.expenselines.forEach((line) => {
      line.raw = '';
    });
    expect(formatTransaction(tx, cache.commodityMap)).toEqual(
      '2024/01/01 A\n    Assets:X    $0.00\n    Equity    $0.00',
    );
  });
});

describe('getTransactionTotal()', () => {
  test('sums positive real postings per commodity', () => {
    const cache = parse(
      `2024/01/01 A
    Expenses:Food    $50
    Expenses:Travel    20 USD
    (Budget:Trip)    $500
    Assets:Cash    -$50
    Assets:Bank    -20 USD`,
      settings,
    );
    expect(getTransactionTotal(cache.transactions[0])).toEqual(
      new Map([
        ['$', 50],
        ['USD', 20],
      ]),
    );
  });
});

describe('inferTxType()', () => {
  test.each([
    ['Expenses:Food', 'expense'],
    ['Income:Salary', 'income'],
    ['Assets:Savings', 'transfer'],
  ])('%s', (account, expected) => {
    const cache = parse(
      `2024/01/01 A\n  ${account}  $1\n  Assets:Cash`,
      settings,
    );
    expect(inferTxType(cache.transactions[0], settings)).toEqual(expected);
  });
});

describe('filterByAccount()', () => {
  test('respects account boundaries', () => {
    const cache = parse(
      `2024/01/01 A\n  Assets:Cashback  $1\n  Income:X\n\n2024/01/02 B\n  Assets:Cash:Wallet  $1\n  Income:X`,
      settings,
    );
    expect(
      cache.transactions
        .filter(filterByAccount('Assets:Cash'))
        .map((t) => t.value.payee),
    ).toEqual(['B']);
  });
});

test('sortByDateDesc()', () => {
  const cache = parse(
    `2026/09/14 A\n  a:x  $1\n  b:y\n\n2026/09/12 B\n  a:x  $1\n  b:y\n\n2026/09/14 C\n  a:x  $1\n  b:y`,
    settings,
  );
  expect(sortByDateDesc(cache.transactions).map((t) => t.value.payee)).toEqual([
    'C',
    'A',
    'B',
  ]);
});

describe('tags', () => {
  const block = `2026/09/14 ABONO SPEI  ; :bank:unreviewed:
    ; :unreviewed:
    Assets:Checking    $4000.00  ; note :unreviewed:
    ; :a:unreviewed:b:
    Income:Unknown`;

  test('hasTag()', () => {
    const cache = parse(block, settings);
    expect(hasTag(cache.transactions[0], 'unreviewed')).toBe(true);
    expect(hasTag(cache.transactions[0], 'reviewed')).toBe(false);
  });

  test('removeTag()', () => {
    expect(removeTag(block, 'unreviewed'))
      .toEqual(`2026/09/14 ABONO SPEI  ; :bank:
    Assets:Checking    $4000.00  ; note
    ; :a:b:
    Income:Unknown`);
  });
});

test('dealiasAccount()', () => {
  const aliases = new Map([['e', 'Expenses']]);
  expect(dealiasAccount('e:Food', aliases)).toEqual('Expenses:Food');
  expect(dealiasAccount('e', aliases)).toEqual('Expenses');
  expect(dealiasAccount('eat:Food', aliases)).toEqual('eat:Food');
});

describe('makeAccountTree()', () => {
  test('When the tree is empty', () => {
    const input: Node[] = [];
    makeAccountTree(input, 'e:Food:Grocery');
    const expected = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
  test('When adding to existing leaf', () => {
    const input = [
      { id: 'e', account: 'e', subRows: [{ id: 'e:Food', account: 'Food' }] },
    ];
    makeAccountTree(input, 'e:Food:Grocery');
    const expected = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
  test('When adding a new branch', () => {
    const input = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    makeAccountTree(input, 'e:Bills:Electricity');
    const expected = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
          {
            id: 'e:Bills',
            account: 'Bills',
            subRows: [{ id: 'e:Bills:Electricity', account: 'Electricity' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
});
describe('sortAccountTree()', () => {
  test('Basic sort', () => {
    const input = [
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
          {
            id: 'e:Bills',
            account: 'Bills',
            subRows: [{ id: 'e:Bills:Electricity', account: 'Electricity' }],
          },
        ],
      },
      { id: 'alpha', account: 'alpha' },
    ];
    sortAccountTree(input);
    const expected = [
      { id: 'alpha', account: 'alpha' },
      {
        id: 'e',
        account: 'e',
        subRows: [
          {
            id: 'e:Bills',
            account: 'Bills',
            subRows: [{ id: 'e:Bills:Electricity', account: 'Electricity' }],
          },
          {
            id: 'e:Food',
            account: 'Food',
            subRows: [{ id: 'e:Food:Grocery', account: 'Grocery' }],
          },
        ],
      },
    ];
    expect(input).toEqual(expected);
  });
});
