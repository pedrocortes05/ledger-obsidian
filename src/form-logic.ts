/**
 * Logic behind the add/edit transaction form, kept free of React so it can be
 * unit tested.
 */
import {
  addToAmountMap,
  AmountMap,
  countDecimals,
  formatAmount,
  tolerance,
} from './amounts';
import type { Operation } from './modals';
import {
  Commentline,
  EnhancedExpenseLine,
  EnhancedTransaction,
  getPostings,
  TransactionCache,
  VirtualType,
} from './parser';
import { TransactionPrefill } from './prefill';
import { ISettings } from './settings';
import {
  formatTransaction,
  getTransactionTotal,
  inferTxType,
  TxType,
} from './transaction-utils';

export interface Line {
  id: number;
  account: string;
  /** Amount as typed. Empty means "balance the transaction". */
  amount: string;
  currency: string;
  comment: string;
  virtual: VirtualType;
  /** The posting this line was loaded from, when editing. */
  original?: EnhancedExpenseLine;
  /** Comment lines that followed the posting in the file. */
  trailingComments: Commentline[];
}

export interface Values {
  txType: TxType;
  /** YYYY-MM-DD */
  date: string;
  payee: string;
  total: string;
  currency: string;
  lines: Line[];
}

export interface ValueErrors {
  date?: string;
  payee?: string;
  total?: string;
  lines?: string;
}

/**
 * FormContext holds what the form needs besides its values.
 */
export interface FormContext {
  operation: Operation;
  settings: ISettings;
  txCache: TransactionCache;
  initialState: EnhancedTransaction;
}

let nextLineId = 1;

export const makeLine = (overrides: Partial<Line> = {}): Line => ({
  id: nextLineId++,
  account: '',
  amount: '',
  currency: '',
  comment: '',
  virtual: '',
  trailingComments: [],
  ...overrides,
});

export const defaultCommodity = (
  settings: ISettings,
  txCache: TransactionCache,
): string => {
  if (settings.currencySymbol) {
    return settings.currencySymbol;
  }
  return txCache.commodities[0]?.symbol ?? '$';
};

/**
 * commodityOptions lists commodities ordered by use, with the default first.
 */
export const commodityOptions = (
  settings: ISettings,
  txCache: TransactionCache,
): string[] => {
  const symbols = txCache.commodities
    .map((c) => c.symbol)
    .filter((s) => s !== '');
  const preferred = defaultCommodity(settings, txCache);
  return [preferred, ...symbols.filter((s) => s !== preferred)];
};

export const minDecimalsFor = (
  txCache: TransactionCache,
  commodity: string,
): number => Math.min(txCache.commodityMap.get(commodity)?.precision ?? 2, 2);

const formatQuantityInput = (
  txCache: TransactionCache,
  commodity: string,
  quantity: number,
  precision: number,
): string => {
  const decimals = Math.max(precision, minDecimalsFor(txCache, commodity));
  return parseFloat(quantity.toFixed(10)).toFixed(Math.min(decimals, 10));
};

const linesFromTransaction = (
  tx: EnhancedTransaction,
  txCache: TransactionCache,
  keepOriginal: boolean,
): { lines: Line[]; leadingComments: Commentline[] } => {
  const lines: Line[] = [];
  const leadingComments: Commentline[] = [];
  tx.value.expenselines.forEach((entry) => {
    if (!('account' in entry)) {
      if (!keepOriginal) {
        return;
      }
      if (lines.length === 0) {
        leadingComments.push(entry);
      } else {
        lines[lines.length - 1].trailingComments.push(entry);
      }
      return;
    }
    lines.push(
      makeLine({
        account: entry.account,
        amount: entry.hasWrittenAmount
          ? formatQuantityInput(
              txCache,
              entry.currency,
              entry.amount,
              entry.precision,
            )
          : '',
        currency: entry.currency,
        comment: entry.comment || '',
        virtual: entry.virtual,
        original: keepOriginal ? entry : undefined,
      }),
    );
  });
  return { lines, leadingComments };
};

/**
 * primaryTotal returns the total of the transaction in the commodity of its
 * first posting.
 */
const primaryTotal = (
  tx: EnhancedTransaction,
  txCache: TransactionCache,
): { total: string; currency: string } => {
  const totals = getTransactionTotal(tx);
  const first = getPostings(tx).find((p) => p.amounts.length > 0);
  const currency = first?.currency ?? [...totals.keys()][0] ?? '';
  const quantity = totals.get(currency);
  return {
    currency,
    total:
      quantity === undefined
        ? ''
        : formatQuantityInput(txCache, currency, quantity, 0),
  };
};

/**
 * findLastTransactionForPayee returns the most recent transaction with the
 * payee (case-insensitive).
 */
export const findLastTransactionForPayee = (
  txCache: TransactionCache,
  payee: string,
): EnhancedTransaction | undefined => {
  const lower = payee.trim().toLowerCase();
  if (lower === '') {
    return undefined;
  }
  let best: EnhancedTransaction | undefined;
  txCache.transactions.forEach((tx) => {
    if (
      tx.value.payee.toLowerCase() === lower &&
      (!best || tx.value.dateISO >= best.value.dateISO)
    ) {
      best = tx;
    }
  });
  return best;
};

/**
 * autofillFromPayee copies the type, total, currency and lines (including
 * amounts and budget lines) from the most recent transaction with the payee.
 */
export const autofillFromPayee = (
  values: Values,
  payee: string,
  ctx: FormContext,
): { values: Values; source: EnhancedTransaction } | undefined => {
  const source = findLastTransactionForPayee(ctx.txCache, payee);
  if (!source) {
    return undefined;
  }
  const { lines } = linesFromTransaction(source, ctx.txCache, false);
  if (lines.length === 0) {
    return undefined;
  }
  return {
    source,
    values: {
      ...values,
      payee: source.value.payee,
      txType: inferTxType(source, ctx.settings),
      ...primaryTotal(source, ctx.txCache),
      lines,
    },
  };
};

export const linesAreUntouched = (values: Values): boolean =>
  values.lines.every((line) => line.account === '' && line.amount === '');

/**
 * initialValues builds the form values for a new, cloned or modified
 * transaction.
 */
export const initialValues = (
  ctx: FormContext,
  prefill?: TransactionPrefill,
): { values: Values; leadingComments: Commentline[] } => {
  const today = window.moment().format('YYYY-MM-DD');
  const currency = defaultCommodity(ctx.settings, ctx.txCache);

  if (ctx.operation !== 'new') {
    const tx = ctx.initialState;
    const keepOriginal = ctx.operation === 'modify';
    const { lines, leadingComments } = linesFromTransaction(
      tx,
      ctx.txCache,
      keepOriginal,
    );
    const totals = primaryTotal(tx, ctx.txCache);
    return {
      leadingComments,
      values: {
        txType: inferTxType(tx, ctx.settings),
        date: keepOriginal ? tx.value.dateISO : today,
        payee: tx.value.payee,
        total: totals.total,
        currency: totals.currency || currency,
        lines,
      },
    };
  }

  let values: Values = {
    txType: 'expense',
    date: today,
    payee: '',
    total: '',
    currency,
    lines: [makeLine({ currency }), makeLine({ currency })],
  };

  if (prefill) {
    if (prefill.payee && !prefill.account && !prefill.from) {
      values = autofillFromPayee(values, prefill.payee, ctx)?.values ?? values;
    }
    const lines = [...values.lines];
    if (prefill.account) {
      lines[0] = { ...lines[0], account: prefill.account };
    }
    if (prefill.from) {
      lines[lines.length - 1] = {
        ...lines[lines.length - 1],
        account: prefill.from,
      };
    }
    if (prefill.comment) {
      lines[0] = { ...lines[0], comment: prefill.comment };
    }
    const newCurrency = prefill.currency ?? values.currency;
    if (prefill.amount) {
      lines[0] = { ...lines[0], amount: prefill.amount, currency: newCurrency };
    }
    values = {
      ...values,
      txType: prefill.txType ?? values.txType,
      payee: values.payee || prefill.payee || '',
      total: prefill.amount ?? values.total,
      currency: newCurrency,
      date: prefill.date ?? values.date,
      lines,
    };
  }

  return { values, leadingComments: [] };
};

const unionRanked = (
  primary: string[],
  txCache: TransactionCache,
): string[] => {
  const set = new Set(primary);
  return [
    ...txCache.accountsByUsage.filter((a) => set.has(a)),
    ...txCache.accountsByUsage.filter((a) => !set.has(a)),
  ];
};

const isLast = (values: Values, index: number): boolean => {
  const realIndexes = values.lines
    .map((line, i) => (line.virtual === '' ? i : -1))
    .filter((i) => i >= 0);
  return (
    realIndexes.length > 1 && index === realIndexes[realIndexes.length - 1]
  );
};

/**
 * accountSuggestions ranks the accounts that fit the line first, followed by
 * every other account so nothing is unreachable.
 */
export const accountSuggestions = (
  values: Values,
  index: number,
  txCache: TransactionCache,
): string[] => {
  const line = values.lines[index];
  const assetsAndLiabilities = [
    ...txCache.assetAccounts,
    ...txCache.liabilityAccounts,
  ];
  if (line.virtual) {
    return unionRanked(txCache.virtualAccounts, txCache);
  }
  const last = isLast(values, index);
  switch (values.txType) {
    case 'expense':
      return unionRanked(
        last ? assetsAndLiabilities : txCache.expenseAccounts,
        txCache,
      );
    case 'income':
      return unionRanked(
        last ? txCache.incomeAccounts : assetsAndLiabilities,
        txCache,
      );
    case 'transfer':
      return unionRanked(assetsAndLiabilities, txCache);
  }
};

export const lineLabel = (values: Values, index: number): string => {
  if (values.lines[index].virtual) {
    return 'Budget account';
  }
  const last = isLast(values, index);
  switch (values.txType) {
    case 'expense':
      return last ? 'Paid from' : 'Expense account';
    case 'income':
      return last ? 'Income from' : 'Deposit to';
    case 'transfer':
      return last ? 'From' : 'To';
  }
};

const parseTyped = (text: string): number | undefined => {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
    return undefined;
  }
  return parseFloat(cleaned);
};

/**
 * balancingAmount returns the amount the empty line in the line's commodity
 * needs to balance the transaction, if it can be computed.
 */
export const balancingAmount = (
  values: Values,
  index: number,
  txCache: TransactionCache,
): string | undefined => {
  const line = values.lines[index];
  if (line.virtual || line.amount !== '') {
    return undefined;
  }
  const sums: AmountMap = new Map();
  values.lines.forEach((other, i) => {
    const quantity = parseTyped(other.amount);
    if (i !== index && other.virtual === '' && quantity !== undefined) {
      addToAmountMap(sums, other.currency, quantity);
    }
  });
  if (sums.size !== 1) {
    return undefined;
  }
  const [commodity, quantity] = [...sums.entries()][0];
  return formatAmount(
    { commodity, quantity: -quantity },
    txCache.commodityMap.get(commodity),
  );
};

export const validateValues = (
  values: Values,
  ctx: FormContext,
): ValueErrors => {
  const errors: ValueErrors = {};

  if (!window.moment(values.date, 'YYYY-MM-DD', true).isValid()) {
    errors.date = 'A valid date is required';
  }
  if (values.txType !== 'transfer' && values.payee.trim() === '') {
    errors.payee = 'Payee is required';
  }
  if (values.total.trim() !== '' && parseTyped(values.total) === undefined) {
    errors.total = 'Total must be a number';
  }

  const lineErrors: string[] = [];
  const realLines = values.lines.filter(
    (line) => splitVirtual(line.account, line.virtual).virtual === '',
  );
  if (values.lines.some((line) => line.account.trim() === '')) {
    lineErrors.push('Every line must have an account.');
  }
  if (
    values.lines.some(
      (line) => line.amount !== '' && parseTyped(line.amount) === undefined,
    )
  ) {
    lineErrors.push('Amounts must be numbers.');
  }
  if (values.lines.length < 2) {
    lineErrors.push('A transaction needs at least two accounts.');
  }
  // A line kept from the file with a balance assignment (`= $500`) gets its
  // amount from the running balance, so it cannot be checked here.
  const isAssignment = (line: Line): boolean =>
    line.amount.trim() === '' &&
    !!line.original &&
    !line.original.hasWrittenAmount &&
    !!line.original.assertion;
  const emptyReal = realLines.filter(
    (line) => line.amount.trim() === '' && !isAssignment(line),
  );
  if (emptyReal.length > 1) {
    lineErrors.push(
      'Only one line can be left empty; it balances the transaction.',
    );
  }
  if (
    values.lines.some(
      (line) =>
        splitVirtual(line.account, line.virtual).virtual &&
        line.amount.trim() === '',
    )
  ) {
    lineErrors.push('Budget lines need an amount.');
  }

  if (
    emptyReal.length === 0 &&
    !realLines.some(isAssignment) &&
    lineErrors.length === 0
  ) {
    const sums: AmountMap = new Map();
    const hasPrice = realLines.some(
      (line) => line.original?.price || line.original?.lotCost,
    );
    realLines.forEach((line) => {
      const quantity = parseTyped(line.amount);
      if (quantity !== undefined) {
        addToAmountMap(sums, line.currency, quantity);
      }
    });
    // With several commodities the exchange rate is implied, like ledger-cli.
    if (sums.size === 1 && !hasPrice) {
      const [commodity, quantity] = [...sums.entries()][0];
      const info = ctx.txCache.commodityMap.get(commodity);
      if (Math.abs(quantity) > tolerance(info?.precision ?? 2)) {
        lineErrors.push(
          `Amounts add up to ${formatAmount({ commodity, quantity }, info)} but must add up to ${formatAmount(
            { commodity, quantity: 0 },
            info,
          )}.`,
        );
      }
    }
  }

  if (lineErrors.length > 0) {
    errors.lines = lineErrors.join(' ');
  }
  return errors;
};

const sameNumber = (text: string, original: EnhancedExpenseLine): boolean => {
  const quantity = parseTyped(text);
  return quantity !== undefined && Math.abs(quantity - original.amount) < 1e-10;
};

const lineUnchanged = (line: Line): boolean => {
  const original = line.original;
  if (!original) {
    return false;
  }
  const amountUnchanged = original.hasWrittenAmount
    ? sameNumber(line.amount, original) && line.currency === original.currency
    : line.amount.trim() === '';
  return (
    amountUnchanged &&
    line.account === original.account &&
    line.virtual === original.virtual &&
    line.comment === (original.comment || '')
  );
};

/**
 * splitVirtual accepts "(Budget:Trip)" typed by hand as a virtual account.
 */
export const splitVirtual = (
  typed: string,
  virtual: VirtualType,
): { account: string; virtual: VirtualType } => {
  const account = typed.trim();
  const wrapped = /^([([])\s*(.*?)\s*[)\]]$/.exec(account);
  if (wrapped) {
    return { account: wrapped[2], virtual: wrapped[1] as VirtualType };
  }
  return { account, virtual };
};

const lineToPosting = (line: Line): EnhancedExpenseLine => {
  if (lineUnchanged(line)) {
    return line.original as EnhancedExpenseLine;
  }
  const quantity = parseTyped(line.amount);
  const original = line.original;
  const sameCommodity = original && original.currency === line.currency;
  const annotations =
    sameCommodity && original?.annotations && quantity !== undefined
      ? original.annotations
      : undefined;
  return {
    line: -1,
    raw: '',
    reconcile: original?.reconcile ?? '',
    ...splitVirtual(line.account, line.virtual),
    dealiasedAccount: splitVirtual(line.account, line.virtual).account,
    amount: quantity ?? 0,
    currency: line.currency,
    amounts: [],
    hasWrittenAmount: quantity !== undefined,
    precision: countDecimals(line.amount.trim().replace(/,/g, '')),
    annotations,
    comment: line.comment.trim() || undefined,
  };
};

/**
 * dateSeparator follows the date style of the transaction being edited, or of
 * the most recent transaction in the file.
 */
const formatDate = (dateISO: string, ctx: FormContext): string => {
  const sample =
    ctx.operation === 'modify'
      ? ctx.initialState.value.date
      : ctx.txCache.transactions[ctx.txCache.transactions.length - 1]?.value
          .date;
  const separator = sample && sample[4] === '-' ? '-' : '/';
  return dateISO.replace(/-/g, separator);
};

/**
 * buildTransactionText turns the form values into ledger text.
 */
export const buildTransactionText = (
  values: Values,
  ctx: FormContext,
  leadingComments: Commentline[],
): string => {
  const original = ctx.operation === 'modify' ? ctx.initialState : undefined;

  let payee = values.payee.trim();
  if (values.txType === 'transfer' && payee === '') {
    const names = values.lines
      .filter((line) => line.virtual === '')
      .map((line) => line.account.split(':').pop() || line.account);
    payee = `${names[names.length - 1]} to ${names.slice(0, -1).join(' and ')}`;
  }

  const budgetLine = values.lines
    .map((line) => splitVirtual(line.account, line.virtual))
    .find((line) => line.virtual === '(');
  const originalVirtualNames = original
    ? getPostings(original)
        .filter((p) => p.virtual)
        .map((p) => p.account)
    : [];
  // New transactions get the budget account as their code, like
  // "2024/11/29 (Budget:Boston) Star Market". Edits keep the header as it was,
  // only following the budget line when the code mirrored it.
  let code: string | undefined;
  if (!original) {
    code = budgetLine?.account;
  } else if (original.value.code !== undefined) {
    code = originalVirtualNames.includes(original.value.code)
      ? budgetLine?.account
      : original.value.code;
  }

  const expenselines: (EnhancedExpenseLine | Commentline)[] = [
    ...leadingComments,
  ];
  values.lines.forEach((line) => {
    expenselines.push(lineToPosting(line), ...line.trailingComments);
  });

  const tx: EnhancedTransaction = {
    type: 'tx',
    block: { firstLine: -1, lastLine: -1, block: '' },
    value: {
      date: formatDate(values.date, ctx),
      dateISO: values.date,
      auxDate: original?.value.auxDate,
      status: original?.value.status ?? '',
      code,
      payee,
      comment: original?.value.comment,
      expenselines,
    },
  };
  const text = formatTransaction(tx, ctx.txCache.commodityMap);
  if (
    original &&
    original.block.block &&
    tx.value.date === original.value.date &&
    tx.value.code === original.value.code &&
    tx.value.payee === original.value.payee
  ) {
    // Keep the original header text (spacing, note formatting).
    const [, ...rest] = text.split('\n');
    return [original.block.block.split('\n')[0], ...rest].join('\n');
  }
  return text;
};

/**
 * seedFirstLine copies the total into the first line when moving to the
 * second page, unless the first line already has a different amount.
 */
export const seedFirstLine = (
  values: Values,
  previousSeed: string | undefined,
): Values => {
  const first = values.lines[0];
  if (!first || values.total.trim() === '') {
    return values;
  }
  if (first.amount !== '' && first.amount !== previousSeed) {
    return values;
  }
  const lines = values.lines.map((line, i) => {
    if (i === 0) {
      return { ...line, amount: values.total, currency: values.currency };
    }
    return line.amount === '' && !line.original
      ? { ...line, currency: values.currency }
      : line;
  });
  return { ...values, lines };
};
