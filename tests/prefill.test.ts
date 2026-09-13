import { parsePrefillParams } from '../src/prefill';

describe('parsePrefillParams()', () => {
  test('reads valid parameters', () => {
    expect(
      parsePrefillParams({
        action: 'ledger',
        type: 'expense',
        payee: ' Uber ',
        amount: '1,149.92',
        currency: '$',
        account: 'Expenses:Transportation:Uber',
        from: 'Assets:Banking:Banorte:Checking',
        date: '2026-09-13',
        comment: 'Airport\nride',
      }),
    ).toEqual({
      txType: 'expense',
      payee: 'Uber',
      amount: '1149.92',
      currency: '$',
      account: 'Expenses:Transportation:Uber',
      from: 'Assets:Banking:Banorte:Checking',
      date: '2026-09-13',
      comment: 'Airport ride',
    });
  });

  test('ignores invalid values', () => {
    expect(
      parsePrefillParams({
        type: 'gift',
        amount: '12abc',
        currency: '$ ; 5',
        date: '2026-02-30',
        payee: '',
      }),
    ).toEqual({});
  });
});
