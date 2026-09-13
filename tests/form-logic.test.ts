import {
  accountSuggestions,
  autofillFromPayee,
  balancingAmount,
  buildTransactionText,
  commodityOptions,
  FormContext,
  initialValues,
  lineLabel,
  makeLine,
  seedFirstLine,
  splitVirtual,
  validateValues,
  Values,
} from '../src/form-logic';
import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import { emptyTransaction } from '../src/transaction-utils';

const settings = settingsWithDefaults({});

const file = `2026/09/01 Spotify
    Expenses:Entertainment:Spotify    $129.00
    Assets:Banking:Checking

2026/09/05 (Budget:Boston) Star Market
    ; city: boston
    Expenses:Food:Groceries   34.73 USD  ; milk
    (Budget:Boston)    -34.73 USD
    Assets:Banking:Bank of America

2026/09/06 Salary
    Assets:Banking:Checking    $9000.00
    Income:Causartt

2026/09/06  Steam  ;  note
    Expenses:Games    $321.48
    (Budget:Boston)    -15.73 USD
    Assets:Banking:Checking

2026/09/07 AAPL buy
    Assets:Brokerage    1.23 AAPL @@ 265.17 USD
    Assets:Banking:Bank of America    = 1000.00 USD
`;

const txCache = parse(file, settings);

const ctx = (operation: FormContext['operation'], index = 0): FormContext => ({
  operation,
  settings,
  txCache,
  initialState:
    operation === 'new' ? emptyTransaction : txCache.transactions[index],
});

const newValues = (overrides: Partial<Values> = {}): Values => ({
  ...initialValues(ctx('new')).values,
  ...overrides,
});

describe('initialValues()', () => {
  test('new transaction uses the default commodity', () => {
    const { values } = initialValues(ctx('new'));
    expect(values.currency).toEqual('$');
    expect(values.lines).toHaveLength(2);
    expect(values.lines.every((l) => l.currency === '$')).toBe(true);
  });

  test('modify keeps postings, comments and inferred type', () => {
    const { values, leadingComments } = initialValues(ctx('modify', 1));
    expect(values.txType).toEqual('expense');
    expect(values.total).toEqual('34.73');
    expect(values.currency).toEqual('USD');
    expect(leadingComments.map((c) => c.comment)).toEqual(['city: boston']);
    expect(
      values.lines.map((l) => [l.account, l.amount, l.currency, l.virtual]),
    ).toEqual([
      ['Expenses:Food:Groceries', '34.73', 'USD', ''],
      ['Budget:Boston', '-34.73', 'USD', '('],
      ['Assets:Banking:Bank of America', '', 'USD', ''],
    ]);
  });

  test('clone drops comments and uses today', () => {
    const { values, leadingComments } = initialValues(ctx('clone', 1));
    expect(leadingComments).toEqual([]);
    expect(values.date).toEqual(window.moment().format('YYYY-MM-DD'));
    expect(values.lines.every((l) => !l.original)).toBe(true);
  });

  test('prefill from a link autofills from the payee', () => {
    const { values } = initialValues(ctx('new'), {
      payee: 'spotify',
      amount: '139.00',
      date: '2026-10-01',
    });
    expect(values.payee).toEqual('Spotify');
    expect(values.date).toEqual('2026-10-01');
    expect(values.total).toEqual('139.00');
    expect(values.lines.map((l) => [l.account, l.amount])).toEqual([
      ['Expenses:Entertainment:Spotify', '139.00'],
      ['Assets:Banking:Checking', ''],
    ]);
  });
});

test('commodityOptions() puts the default first', () => {
  expect(
    commodityOptions(settingsWithDefaults({ currencySymbol: 'USD' }), txCache),
  ).toEqual(['USD', '$', 'AAPL']);
});

describe('autofillFromPayee()', () => {
  test('keeps a total and commodity the user already chose', () => {
    const result = autofillFromPayee(
      newValues({ total: '25.00', currency: 'EUR' }),
      'spotify',
      ctx('new'),
      { total: true, currency: true },
    );
    expect(result?.values.total).toEqual('25.00');
    expect(result?.values.currency).toEqual('EUR');
    expect(result?.sourceTotal).toEqual('129.00');
    expect(result?.values.lines[0].amount).toEqual('129.00');
  });

  test('copies accounts, amounts, currency and budget lines', () => {
    const result = autofillFromPayee(newValues(), 'star market', ctx('new'));
    expect(result?.source.value.date).toEqual('2026/09/05');
    expect(result?.values.currency).toEqual('USD');
    expect(
      result?.values.lines.map((l) => [
        l.account,
        l.amount,
        l.virtual,
        l.comment,
      ]),
    ).toEqual([
      ['Expenses:Food:Groceries', '34.73', '', 'milk'],
      ['Budget:Boston', '-34.73', '(', ''],
      ['Assets:Banking:Bank of America', '', '', ''],
    ]);
  });

  test('unknown payee', () => {
    expect(
      autofillFromPayee(newValues(), 'Nobody', ctx('new')),
    ).toBeUndefined();
  });
});

describe('accountSuggestions() and lineLabel()', () => {
  test('income deposits to assets and comes from income accounts', () => {
    const values = newValues({ txType: 'income' });
    expect(accountSuggestions(values, 0, txCache)[0]).toMatch(/^Assets:/);
    expect(accountSuggestions(values, 1, txCache)[0]).toEqual(
      'Income:Causartt',
    );
    expect(lineLabel(values, 0)).toEqual('Deposit to');
    expect(lineLabel(values, 1)).toEqual('Income from');
  });

  test('every account is still suggested', () => {
    const values = newValues({ txType: 'expense' });
    expect(accountSuggestions(values, 0, txCache).sort()).toEqual(
      [...txCache.accounts].sort(),
    );
  });

  test('budget lines suggest virtual accounts', () => {
    const values = newValues({
      lines: [makeLine(), makeLine({ virtual: '(' }), makeLine()],
    });
    expect(accountSuggestions(values, 1, txCache)[0]).toEqual('Budget:Boston');
    expect(lineLabel(values, 1)).toEqual('Budget account');
    expect(lineLabel(values, 2)).toEqual('Paid from');
  });
});

describe('validateValues()', () => {
  const lines = (...specs: [string, string, string?][]): Values['lines'] =>
    specs.map(([account, amount, currency]) =>
      makeLine({ account, amount, currency: currency ?? '$' }),
    );

  test('reports every problem at once, even with several currencies', () => {
    const errors = validateValues(
      newValues({
        payee: '',
        date: '2026-02-30',
        lines: lines(
          ['', '5', 'USD'],
          ['Assets:X', '5', '$'],
          ['Assets:Y', ''],
        ),
      }),
      ctx('new'),
    );
    expect(errors.payee).toBeDefined();
    expect(errors.date).toBeDefined();
    expect(errors.lines).toMatch(/account/);
  });

  test('balances in cents without float noise', () => {
    const errors = validateValues(
      newValues({
        payee: 'A',
        lines: lines(['e:a', '0.1'], ['e:b', '0.2'], ['a:c', '-0.3']),
      }),
      ctx('new'),
    );
    expect(errors).toEqual({});
  });

  test('an unbalanced commodity is caught when another cancels out', () => {
    const errors = validateValues(
      newValues({
        payee: 'A',
        lines: lines(
          ['e:a', '10'],
          ['a:c', '-5'],
          ['a:y', '5', 'EUR'],
          ['a:y', '-5', 'EUR'],
        ),
      }),
      ctx('new'),
    );
    expect(errors.lines).toEqual(
      'Amounts add up to $5.00 but must add up to $0.00.',
    );
  });

  test('unbalanced amounts use the commodity style', () => {
    const errors = validateValues(
      newValues({ payee: 'A', lines: lines(['e:a', '10'], ['a:c', '-9']) }),
      ctx('new'),
    );
    expect(errors.lines).toEqual(
      'Amounts add up to $1.00 but must add up to $0.00.',
    );
  });

  test('only one empty line', () => {
    const errors = validateValues(
      newValues({
        payee: 'A',
        lines: lines(['e:a', '10'], ['e:b', ''], ['a:c', '']),
      }),
      ctx('new'),
    );
    expect(errors.lines).toMatch(/Only one line/);
  });

  test('budget lines are not balanced but need an amount', () => {
    const values = newValues({
      payee: 'A',
      lines: [
        makeLine({ account: 'e:a', amount: '10', currency: '$' }),
        makeLine({
          account: 'Budget:X',
          amount: '',
          currency: '$',
          virtual: '(',
        }),
        makeLine({ account: 'a:c', amount: '-10', currency: '$' }),
      ],
    });
    expect(validateValues(values, ctx('new')).lines).toMatch(
      /Budget lines need an amount/,
    );
    values.lines[1].amount = '-10';
    expect(validateValues(values, ctx('new'))).toEqual({});
  });
});

test('balancingAmount()', () => {
  const values = newValues({
    lines: [
      makeLine({ account: 'e:a', amount: '34.73', currency: 'USD' }),
      makeLine({
        account: 'Budget',
        amount: '-34.73',
        currency: 'USD',
        virtual: '(',
      }),
      makeLine({ account: 'a:c', amount: '', currency: 'USD' }),
    ],
  });
  expect(balancingAmount(values, 2, txCache)).toEqual('-34.73 USD');
  expect(balancingAmount(values, 1, txCache)).toBeUndefined();
});

test('seedFirstLine() leaves an empty balancing first line alone', () => {
  const cache = parse(
    '2026/09/01 A\n    Assets:Checking\n    Expenses:Food    $10.00',
    settings,
  );
  const editCtx: FormContext = {
    operation: 'modify',
    settings,
    txCache: cache,
    initialState: cache.transactions[0],
  };
  const { values } = initialValues(editCtx);
  expect(values.total).toEqual('10.00');
  const seeded = seedFirstLine(values, undefined);
  expect(seeded.lines.map((l) => l.amount)).toEqual(['', '10.00']);
  expect(validateValues(seeded, editCtx)).toEqual({});
});

test('seedFirstLine() does not fill a balance assignment line', () => {
  const cache = parse(
    '2024/08/30 Interest\n    Assets:Smart Cash    = $86.27\n    Income:Interest',
    settings,
  );
  const editCtx: FormContext = {
    operation: 'modify',
    settings,
    txCache: cache,
    initialState: cache.transactions[0],
  };
  const { values, leadingComments } = initialValues(editCtx);
  const seeded = seedFirstLine({ ...values, total: '99.95' }, undefined);
  expect(buildTransactionText(seeded, editCtx, leadingComments)).toEqual(
    cache.transactions[0].block.block,
  );
});

test('seedFirstLine() only overwrites a seeded or empty first line', () => {
  const values = newValues({ total: '50.00', currency: 'USD' });
  const seeded = seedFirstLine(values, undefined);
  expect(seeded.lines[0]).toMatchObject({ amount: '50.00', currency: 'USD' });
  expect(seeded.lines[1].currency).toEqual('USD');

  const reseeded = seedFirstLine({ ...seeded, total: '60.00' }, '50.00');
  expect(reseeded.lines[0].amount).toEqual('60.00');

  const edited = { ...seeded, total: '70.00' };
  edited.lines = [{ ...seeded.lines[0], amount: '45.00' }, seeded.lines[1]];
  expect(seedFirstLine(edited, '50.00').lines[0].amount).toEqual('45.00');
});

test('splitVirtual()', () => {
  expect(splitVirtual(' (Budget:Trip) ', '')).toEqual({
    account: 'Budget:Trip',
    virtual: '(',
  });
  expect(splitVirtual('[Savings]', '')).toEqual({
    account: 'Savings',
    virtual: '[',
  });
  expect(splitVirtual('Budget:Trip', '(')).toEqual({
    account: 'Budget:Trip',
    virtual: '(',
  });
});

describe('buildTransactionText()', () => {
  test('editing a balance assignment line keeps the assignment', () => {
    const cache = parse(
      `2026/09/01 Reconcile
    Assets:Checking    = $500.00
    Equity:Adjustment`,
      settings,
    );
    const editCtx: FormContext = {
      operation: 'modify',
      settings,
      txCache: cache,
      initialState: cache.transactions[0],
    };
    const { values, leadingComments } = initialValues(editCtx);
    values.lines[0] = {
      ...values.lines[0],
      account: 'Assets:Banking:Checking',
      comment: 'reconciled',
    };
    expect(validateValues(values, editCtx)).toEqual({});
    const text = buildTransactionText(values, editCtx, leadingComments);
    expect(text).toEqual(`2026/09/01 Reconcile
    Assets:Banking:Checking    = $500.00  ; reconciled
    Equity:Adjustment`);
    expect(parse(text, settings).parsingErrors).toEqual([]);

    // Changing the commodity turns it into a normal empty line, and
    // validation then sees two empty lines.
    values.lines[0] = { ...values.lines[0], currency: 'USD' };
    expect(validateValues(values, editCtx).lines).toMatch(/Only one line/);
  });

  test('unchanged edit reproduces the original block', () => {
    [1, 3, 4].forEach((index) => {
      const { values, leadingComments } = initialValues(ctx('modify', index));
      expect(
        buildTransactionText(values, ctx('modify', index), leadingComments),
      ).toEqual(txCache.transactions[index].block.block);
    });
  });

  test('budget line in the header code follows the budget line when edited', () => {
    const { values, leadingComments } = initialValues(ctx('modify', 1));
    values.lines[1] = { ...values.lines[1], account: 'Budget:Madrid' };
    expect(
      buildTransactionText(values, ctx('modify', 1), leadingComments).split(
        '\n',
      )[0],
    ).toEqual('2026/09/05 (Budget:Madrid) Star Market');
    values.lines.splice(1, 1);
    expect(
      buildTransactionText(values, ctx('modify', 1), leadingComments).split(
        '\n',
      )[0],
    ).toEqual('2026/09/05 Star Market');
  });

  test('editing one line keeps the others, comments and the budget code', () => {
    const { values, leadingComments } = initialValues(ctx('modify', 1));
    values.lines[0] = { ...values.lines[0], amount: '40.5' };
    values.lines[1] = { ...values.lines[1], amount: '-40.5' };
    expect(buildTransactionText(values, ctx('modify', 1), leadingComments))
      .toEqual(`2026/09/05 (Budget:Boston) Star Market
    ; city: boston
    Expenses:Food:Groceries    40.50 USD  ; milk
    (Budget:Boston)    -40.50 USD
    Assets:Banking:Bank of America`);
  });

  test('new transaction with a hand-typed budget account', () => {
    const values = newValues({
      payee: 'Uber',
      date: '2026-09-13',
      lines: [
        makeLine({
          account: 'Expenses:Transport',
          amount: '149.9',
          currency: '$',
        }),
        makeLine({ account: '(Budget:Trip)', amount: '-149.9', currency: '$' }),
        makeLine({
          account: 'Assets:Banking:Checking',
          amount: '',
          currency: '$',
        }),
      ],
    });
    expect(buildTransactionText(values, ctx('new'), []))
      .toEqual(`2026/09/13 (Budget:Trip) Uber
    Expenses:Transport    $149.90
    (Budget:Trip)    -$149.90
    Assets:Banking:Checking`);
  });

  test('transfer without payee gets a generated one', () => {
    const values = newValues({
      txType: 'transfer',
      payee: '',
      date: '2026-09-13',
      lines: [
        makeLine({ account: 'Assets:Savings', amount: '10', currency: 'USD' }),
        makeLine({
          account: 'Assets:Banking:Checking',
          amount: '',
          currency: 'USD',
        }),
      ],
    });
    expect(buildTransactionText(values, ctx('new'), []).split('\n')[0]).toEqual(
      '2026/09/13 Checking to Savings',
    );
  });

  test('crypto precision is kept', () => {
    const values = newValues({
      payee: 'SOL',
      date: '2026-09-13',
      lines: [
        makeLine({
          account: 'Assets:Crypto',
          amount: '0.00719462',
          currency: 'SOL',
        }),
        makeLine({
          account: 'Assets:Banking:Checking',
          amount: '-100',
          currency: '$',
        }),
      ],
    });
    expect(buildTransactionText(values, ctx('new'), [])).toContain(
      '0.00719462 SOL',
    );
  });
});
