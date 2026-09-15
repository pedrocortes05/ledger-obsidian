import {
  accountSuggestions,
  autofillFromPayee,
  buildTransactionText,
  FormContext,
  initialValues,
  makeLine,
  makeMetaRow,
  metadataValueSuggestions,
  validateValues,
} from '../src/form-logic';
import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import { emptyTransaction } from '../src/transaction-utils';

const settings = settingsWithDefaults({});

const file = `account Assets:Loans:Causartt
    assert false

2026/07/20 Causartt · 25ª edición
    ; Edition: 25
    Assets:Loans:Causartt:Fees    $10,000.00
    Income:Causartt

2026/08/23 Causartt · 26ª edición
    ; event: [[2026-08-23 Causartt]]
    ; paid late, see email
    ; :bank:unreviewed:
    ; Edition: 26
    Assets:Loans:Causartt:Fees    $10,000.00
    Income:Causartt

2026/09/14 ABONO SPEI Causartt
    Assets:Banking:Checking    $4,000.00
    Assets:Loans:Causartt:Fees    -$1,207.98  ; partial Edition: 26
    Assets:Loans:Causartt:Servers    -$2,792.02
`;

const txCache = parse(file, settings);

const ctx = (operation: FormContext['operation'], index = 0): FormContext => ({
  operation,
  settings,
  txCache,
  initialState:
    operation === 'new' ? emptyTransaction : txCache.transactions[index],
});

describe('assert false in the form', () => {
  test('guarded accounts are not suggested', () => {
    const { values } = initialValues(ctx('new'));
    const suggestions = accountSuggestions(values, 0, txCache);
    expect(suggestions).not.toContain('Assets:Loans:Causartt');
    expect(suggestions).toContain('Assets:Loans:Causartt:Fees');
  });

  test('saving a posting to a guarded account is blocked', () => {
    const { values } = initialValues(ctx('new'));
    const errors = validateValues(
      {
        ...values,
        payee: 'A',
        lines: [
          makeLine({
            account: 'Assets:Banking:Checking',
            amount: '5',
            currency: '$',
          }),
          makeLine({
            account: 'Assets:Loans:Causartt',
            amount: '',
            currency: '$',
          }),
        ],
      },
      ctx('new'),
    );
    expect(errors.lines).toEqual(
      'Assets:Loans:Causartt does not accept postings (assert false). Use a sub-account such as Assets:Loans:Causartt:Fees.',
    );
  });
});

describe('metadata rows', () => {
  test('editing shows metadata lines as rows and keeps free text', () => {
    const { values, leadingComments } = initialValues(ctx('modify', 1));
    expect(values.metadata.map((r) => [r.key, r.value])).toEqual([
      ['event', '[[2026-08-23 Causartt]]'],
      ['bank', ''],
      ['unreviewed', ''],
      ['Edition', '26'],
    ]);
    expect(
      buildTransactionText(values, ctx('modify', 1), leadingComments),
    ).toEqual(txCache.transactions[1].block.block);
  });

  test('changes are written in place, removed rows drop, new rows are added', () => {
    const { values, leadingComments } = initialValues(ctx('modify', 1));
    values.metadata = values.metadata
      .filter((row) => row.key !== 'unreviewed')
      .map((row) => (row.key === 'Edition' ? { ...row, value: '26b' } : row));
    values.metadata.push(makeMetaRow({ key: 'City', value: 'Monterrey' }));
    expect(buildTransactionText(values, ctx('modify', 1), leadingComments))
      .toEqual(`2026/08/23 Causartt · 26ª edición
    ; event: [[2026-08-23 Causartt]]
    ; paid late, see email
    ; :bank:
    ; Edition: 26b
    ; City: Monterrey
    Assets:Loans:Causartt:Fees    $10,000.00
    Income:Causartt`);
  });

  test('new transaction with metadata and a tag', () => {
    const { values } = initialValues(ctx('new'));
    const text = buildTransactionText(
      {
        ...values,
        payee: 'Causartt · 27ª edición',
        date: '2026-09-20',
        lines: [
          makeLine({
            account: 'Assets:Loans:Causartt:Fees',
            amount: '10000',
            currency: '$',
          }),
          makeLine({ account: 'Income:Causartt', amount: '', currency: '$' }),
        ],
        metadata: [
          makeMetaRow({ key: 'Edition', value: '27' }),
          makeMetaRow({ key: 'confirmed', value: '' }),
        ],
      },
      ctx('new'),
      [],
    );
    expect(text).toEqual(`2026/09/20 Causartt · 27ª edición
    ; Edition: 27
    ; :confirmed:
    Assets:Loans:Causartt:Fees    $10,000.00
    Income:Causartt`);
    expect(parse(text, settings).transactions[0].value.metadata).toEqual({
      Edition: '27',
      confirmed: '',
    });
  });

  test('validation', () => {
    const { values } = initialValues(ctx('new'));
    const check = (
      metadata: ReturnType<typeof makeMetaRow>[],
    ): string | undefined =>
      validateValues({ ...values, payee: 'A', metadata }, ctx('new')).metadata;
    expect(check([makeMetaRow()])).toBeUndefined();
    expect(check([makeMetaRow({ key: 'Two words', value: '1' })])).toMatch(
      /cannot contain spaces/,
    );
    expect(check([makeMetaRow({ value: '1' })])).toMatch(/needs a name/);
    expect(check([makeMetaRow({ key: 'Edition', needsValue: true })])).toEqual(
      'Fill in Edition or remove it.',
    );
    expect(
      check([
        makeMetaRow({ key: 'Edition', value: '1' }),
        makeMetaRow({ key: 'Edition', value: '2' }),
      ]),
    ).toEqual('Edition is listed twice.');
  });

  test('the next number is suggested first', () => {
    expect(metadataValueSuggestions(txCache, 'Edition')).toEqual({
      next: '27',
      values: ['27', '26', '25'],
    });
  });
});

describe('copies do not reuse metadata values', () => {
  test('autofill keeps keys, clears values, skips :unreviewed: and strips memos', () => {
    const { values } = initialValues(ctx('new'));
    const edition = autofillFromPayee(
      values,
      'Causartt · 26ª edición',
      ctx('new'),
    );
    expect(
      edition?.values.metadata.map((r) => [r.key, r.value, !!r.needsValue]),
    ).toEqual([
      ['event', '', true],
      ['bank', '', false],
      ['Edition', '', true],
    ]);

    const payment = autofillFromPayee(
      values,
      'ABONO SPEI Causartt',
      ctx('new'),
    );
    expect(payment?.values.lines.map((l) => l.comment)).toEqual([
      '',
      'partial',
      '',
    ]);
  });

  test('copying a transaction does the same', () => {
    const { values } = initialValues(ctx('clone', 1));
    expect(values.metadata.find((r) => r.key === 'Edition')).toMatchObject({
      value: '',
      needsValue: true,
    });
  });
});
