import { TxType } from './transaction-utils';

/**
 * TransactionPrefill holds values used to pre-fill the add transaction form,
 * e.g. from an obsidian://ledger link.
 */
export interface TransactionPrefill {
  txType?: TxType;
  payee?: string;
  amount?: string;
  currency?: string;
  /** Expense account for expenses, deposit account for income, "to" for transfers. */
  account?: string;
  /** Paying account for expenses, income account for income, "from" for transfers. */
  from?: string;
  /** YYYY-MM-DD */
  date?: string;
  comment?: string;
}

const clean = (value: string | undefined, maxLength = 200): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
  return trimmed === '' ? undefined : trimmed;
};

/**
 * parsePrefillParams validates the parameters of an obsidian://ledger link:
 *
 *   obsidian://ledger?type=expense&payee=Uber&amount=149.92&currency=$
 *     &account=Expenses:Transport&from=Assets:Checking&date=2026-09-13
 *     &comment=Airport
 *
 * Invalid or unknown parameters are ignored.
 */
export const parsePrefillParams = (
  params: Record<string, string | undefined>,
): TransactionPrefill => {
  const prefill: TransactionPrefill = {};

  const type = clean(params.type);
  if (type === 'expense' || type === 'income' || type === 'transfer') {
    prefill.txType = type;
  }

  prefill.payee = clean(params.payee);
  prefill.account = clean(params.account);
  prefill.from = clean(params.from);
  prefill.comment = clean(params.comment, 500);

  const currency = clean(params.currency, 40);
  if (currency && !/[\d;@=]/.test(currency)) {
    prefill.currency = currency;
  }

  const amount = clean(params.amount, 40)?.replace(/,/g, '');
  if (amount && /^-?\d+(\.\d+)?$/.test(amount)) {
    prefill.amount = amount;
  }

  const date = clean(params.date, 10);
  if (date && window.moment(date, 'YYYY-MM-DD', true).isValid()) {
    prefill.date = date;
  }

  (Object.keys(prefill) as (keyof TransactionPrefill)[]).forEach((key) => {
    if (prefill[key] === undefined) {
      delete prefill[key];
    }
  });
  return prefill;
};
