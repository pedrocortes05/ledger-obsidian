import {
  EnhancedExpenseLine,
  getPostings,
  parse,
  parsePostingLine,
} from '../src/parser';
import { settingsWithDefaults } from '../src/settings';

const settings = settingsWithDefaults({});

const postingsOf = (contents: string, index = 0): EnhancedExpenseLine[] => {
  const cache = parse(contents, settings);
  expect(cache.parsingErrors).toEqual([]);
  return getPostings(cache.transactions[index]);
};

const amounts = (postings: EnhancedExpenseLine[]): [string, number, string][] =>
  postings.map((p) => [p.account, p.amount, p.currency]);

describe('parsePostingLine()', () => {
  test('account with spaces, digits, hyphens and accents', () => {
    const { posting } = parsePostingLine(
      '    Assets:Loans:Causartt:18 Año-POS    $10,000.00',
      3,
    );
    expect(posting?.account).toEqual('Assets:Loans:Causartt:18 Año-POS');
    expect(posting?.amount).toEqual(10000);
    expect(posting?.currency).toEqual('$');
    expect(posting?.line).toEqual(3);
  });

  test('tab separator, status and comment', () => {
    const { posting } = parsePostingLine(
      '\t* Expenses:Food\t-$5.25 ; lunch',
      0,
    );
    expect(posting).toMatchObject({
      reconcile: '*',
      account: 'Expenses:Food',
      amount: -5.25,
      currency: '$',
      comment: 'lunch',
    });
  });

  test.each([
    ['$-180', -180, '$'],
    ['-$180.5', -180.5, '$'],
    ['$ 12', 12, '$'],
    ['2155.10 USD', 2155.1, 'USD'],
    ['-0.00719462 SOL', -0.00719462, 'SOL'],
    ['30 "Gel Beta Fuel"', 30, 'Gel Beta Fuel'],
    ['EUR 4.00', 4, 'EUR'],
    ['100', 100, ''],
  ])('amount %s', (text, quantity, commodity) => {
    const { posting, error } = parsePostingLine(`  Assets:X  ${text}`, 0);
    expect(error).toBeUndefined();
    expect(posting?.amount).toBeCloseTo(quantity, 10);
    expect(posting?.currency).toEqual(commodity);
  });

  test('prices, lots and assertions', () => {
    const { posting } = parsePostingLine(
      '  Assets:Brokerage    -2.90 XBI {89.39 USD} [2024/06/03] @@ 272.06 USD = 0 XBI',
      0,
    );
    expect(posting).toMatchObject({
      amount: -2.9,
      currency: 'XBI',
      price: { type: '@@', amount: { commodity: 'USD', quantity: 272.06 } },
      lotCost: { type: '@', amount: { commodity: 'USD', quantity: 89.39 } },
      assertion: { commodity: 'XBI', quantity: 0 },
      annotations: '{89.39 USD} [2024/06/03] @@ 272.06 USD = 0 XBI',
    });
  });

  test('balance assignment without a space', () => {
    const { posting } = parsePostingLine('    Assets:Checking    =$8816.51', 0);
    expect(posting?.hasWrittenAmount).toBe(false);
    expect(posting?.assertion).toEqual({ commodity: '$', quantity: 8816.51 });
  });

  test('virtual accounts', () => {
    expect(
      parsePostingLine('  (Budget:Boston)  -34.73 USD', 0).posting,
    ).toMatchObject({ account: 'Budget:Boston', virtual: '(' });
    expect(parsePostingLine('  [Savings:Goal]  $5', 0).posting).toMatchObject({
      account: 'Savings:Goal',
      virtual: '[',
    });
  });

  test('unsupported text is an error', () => {
    expect(parsePostingLine('  Assets:X  ($10 * 2)', 0).error).toMatch(
      /Expression/,
    );
    expect(parsePostingLine('  Assets:X  $10 garbage', 0).error).toMatch(
      /Unrecognized/,
    );
  });
});

describe('parse()', () => {
  test('empty file', () => {
    const cache = parse('', settings);
    expect(cache.transactions).toHaveLength(0);
    expect(cache.parsingErrors).toHaveLength(0);
  });

  test('transaction header fields and line numbers', () => {
    const contents = [
      '; comment',
      '',
      '2024/11/29=2024/12/01 * (Budget:Boston) Star Market! ; note',
      '    ; city: boston',
      '    Expenses:Food:Groceries   34.73 USD',
      '    (Budget:Boston)    -34.73 USD',
      '    Assets:Bank of America',
    ].join('\n');
    const cache = parse(contents, settings);
    expect(cache.parsingErrors).toEqual([]);
    const tx = cache.transactions[0];
    expect(tx.value).toMatchObject({
      date: '2024/11/29',
      dateISO: '2024-11-29',
      auxDate: '2024/12/01',
      status: '*',
      code: 'Budget:Boston',
      payee: 'Star Market!',
      comment: 'note',
    });
    expect(tx.block).toEqual({
      firstLine: 2,
      lastLine: 6,
      block: contents.split('\n').slice(2).join('\n'),
    });
    expect(tx.value.expenselines[0]).toEqual({
      line: 3,
      raw: '    ; city: boston',
      comment: 'city: boston',
    });
  });

  test('one-character payee and dash dates', () => {
    const cache = parse('2023-09-07 X\n  a:b  $1\n  c:d', settings);
    expect(cache.transactions[0].value.payee).toEqual('X');
    expect(cache.transactions[0].value.dateISO).toEqual('2023-09-07');
  });

  test('transactions without blank lines between them', () => {
    const cache = parse(
      '2024/01/01 A\n  e:x  $1\n  a:y\n2024/01/02 B\n  e:x  $2\n  a:y',
      settings,
    );
    expect(cache.parsingErrors).toEqual([]);
    expect(cache.transactions.map((t) => t.value.payee)).toEqual(['A', 'B']);
    expect(cache.transactions[1].block.firstLine).toEqual(3);
  });

  test('missing amount ignores (virtual) postings', () => {
    const postings = postingsOf(`2024/11/29 (Budget:Boston) Star Market
    Expenses:Food:Groceries   34.73 USD
    (Budget:Boston)    -34.73 USD
    Assets:Bank of America`);
    expect(amounts(postings)).toEqual([
      ['Expenses:Food:Groceries', 34.73, 'USD'],
      ['Budget:Boston', -34.73, 'USD'],
      ['Assets:Bank of America', -34.73, 'USD'],
    ]);
    expect(postings[2].hasWrittenAmount).toBe(false);
  });

  test('[balanced virtual] postings balance among themselves', () => {
    const postings = postingsOf(`2024/01/01 Save
    Expenses:Food   $10
    Assets:Cash
    [Savings:Goal]   $5
    [Assets:Cash]`);
    expect(amounts(postings).map((a) => a[1])).toEqual([10, -10, 5, -5]);
  });

  test('missing amount is inferred per commodity using prices', () => {
    const postings = postingsOf(`2023/09/07 Starting Balances
    c:Safe    2310 USD @ $17.60
    c:Blue Bag    4.00 EUR
    StartingBalance`);
    const inferred = postings[2];
    expect(inferred.amounts).toEqual([
      { commodity: '$', quantity: expect.closeTo(-40656, 6) },
      { commodity: 'EUR', quantity: -4 },
    ]);
  });

  test('lot cost takes precedence over the sale price', () => {
    const postings = postingsOf(`2024/06/05 XBI sale
    Assets:Cash    $4771.61 @@ 272.06 USD
    Assets:USA    -2.90 XBI {89.3931034483 USD} [2024/06/03] @@ 272.06 USD
    Income:Capital Gains`);
    expect(postings[2].amount).toBeCloseTo(-12.82, 2);
    expect(postings[2].currency).toEqual('USD');
  });

  test('balance assignments and assertions', () => {
    const cache = parse(
      `2024/01/01 Open
    Assets:Checking    $100
    Equity

2024/01/02 Groceries
    Expenses:Food
    Assets:Checking    = $70

2024/01/03 Coffee
    Expenses:Food    $5
    Assets:Checking    -$5 = $65`,
      settings,
    );
    expect(cache.parsingErrors).toEqual([]);
    const groceries = getPostings(cache.transactions[1]);
    expect(groceries[1].amount).toEqual(-30);
    expect(groceries[0].amount).toEqual(30);
  });

  test('failed balance assertion is reported', () => {
    const cache = parse(
      '2024/01/01 A\n  Assets:X  $10 = $11\n  Equity',
      settings,
    );
    expect(cache.parsingErrors[0].message).toMatch(/Balance assertion failed/);
  });

  test('unbalanced transaction is reported', () => {
    const cache = parse('2024/01/01 A\n  e:x  $10\n  a:y  -$9', settings);
    expect(cache.parsingErrors[0].message).toMatch(/does not balance/);
  });

  test('half-cent rounding is tolerated like ledger-cli', () => {
    const cache = parse(
      `2025/03/31 TSLA buy
    Expenses:Commission    1.00 USD
    Assets:IB    0.9 TSLA @ 258.25 USD
    Assets:IB    -233.42 USD`,
      settings,
    );
    expect(cache.parsingErrors).toEqual([]);
  });

  test('multiple postings without amount', () => {
    const cache = parse('2024/01/01 A\n  e:x  $10\n  a:y\n  a:z', settings);
    expect(cache.transactions).toHaveLength(0);
    expect(cache.parsingErrors[0].message).toMatch(/multiple postings/);
  });

  test('directives, periodic transactions and comment blocks', () => {
    const cache = parse(
      `alias e=Expenses
account Assets:Checking
    note Main account
commodity $
P 2024/01/01 USD $17.50
payee Oxxo
~ Monthly from 2023/09/19
    Expenses:Spotify    $69.00
    Assets:Checking
= /Food/
    (Budget)  -1
comment
this is ignored
end comment

2024/01/01 Oxxo
    e:Food    $10
    Assets:Checking`,
      settings,
    );
    expect(cache.parsingErrors).toEqual([]);
    expect(cache.transactions).toHaveLength(1);
    expect(cache.accounts).toEqual(['Assets:Checking', 'Expenses:Food']);
    expect(cache.prices).toEqual([
      {
        dateISO: '2024-01-01',
        commodity: 'USD',
        price: { commodity: '$', quantity: 17.5 },
      },
    ]);
    expect(getPostings(cache.transactions[0])[0].dealiasedAccount).toEqual(
      'Expenses:Food',
    );
  });

  test('unrecognized lines and include are reported', () => {
    const cache = parse('include other.ledger\nfoo bar', settings);
    expect(cache.parsingErrors.map((e) => e.message)).toEqual([
      expect.stringMatching(/include/),
      'Unrecognized line',
    ]);
  });

  test('payees and accounts are ordered by recency and de-duplicated', () => {
    const cache = parse(
      `2024/01/01 OXXO
    Expenses:Food    $1
    Assets:Cash

2024/03/01 Uber
    Expenses:Transport    $1
    Assets:Bank

2024/02/01 Oxxo
    Expenses:Food    $1
    Assets:Cash`,
      settings,
    );
    expect(cache.payees).toEqual(['Uber', 'Oxxo']);
    expect(cache.accountsByUsage.slice(0, 2)).toEqual([
      'Expenses:Transport',
      'Assets:Bank',
    ]);
  });

  test('account types use prefix boundaries and exclude virtual-only accounts', () => {
    const cache = parse(
      `2024/01/01 A
    AssetsFoo:X    $1
    Assets:Cash    $1
    (Assets:Budget)    $1
    Income:Salary`,
      settings,
    );
    expect(cache.assetAccounts).toEqual(['Assets:Cash']);
    expect(cache.incomeAccounts).toEqual(['Income:Salary']);
    expect(cache.virtualAccounts).toEqual(['Assets:Budget']);
  });

  test('commodity styles are collected from the file', () => {
    const cache = parse(
      `2024/01/01 A
    Expenses:X    $1,000.5
    Expenses:Y    -$3.25
    Expenses:Z    10.123 USD
    Assets:Cash`,
      settings,
    );
    expect(cache.commodityMap.get('$')).toMatchObject({
      prefix: true,
      spaced: false,
      precision: 2,
      thousands: true,
      negativeBeforeSymbol: true,
    });
    expect(cache.commodityMap.get('USD')).toMatchObject({
      prefix: false,
      spaced: true,
      precision: 3,
    });
    expect(cache.commodities[0].symbol).toEqual('$');
  });
});
