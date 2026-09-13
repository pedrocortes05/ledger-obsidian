import { isAccountOrChild } from './account-utils';
import {
  addToAmountMap,
  AmountMap,
  CommodityInfo,
  formatAmount,
} from './amounts';
import {
  Commentline,
  EnhancedExpenseLine,
  EnhancedTransaction,
  getPostings,
  VirtualType,
} from './parser';
import { ISettings } from './settings';
import { Moment } from 'moment';

export { dealiasAccount, isAccountOrChild } from './account-utils';

export const emptyTransaction: EnhancedTransaction = {
  type: 'tx',
  block: { firstLine: -1, lastLine: -1, block: '' },
  value: {
    date: '',
    dateISO: '',
    status: '',
    payee: '',
    expenselines: [],
  },
};

export const wrapVirtual = (account: string, virtual: VirtualType): string => {
  switch (virtual) {
    case '(':
      return `(${account})`;
    case '[':
      return `[${account}]`;
    default:
      return account;
  }
};

const INDENT = '    ';

/**
 * formatPosting writes a posting. Postings that still have their original
 * `raw` text are written unchanged so nothing the form does not understand
 * (prices, lots, assertions, alignment) is lost.
 */
export const formatPosting = (
  line: EnhancedExpenseLine,
  commodities: Map<string, CommodityInfo>,
): string => {
  if (line.raw) {
    return line.raw;
  }
  const status = line.reconcile ? `${line.reconcile} ` : '';
  const account = wrapVirtual(line.account, line.virtual);
  let amount = '';
  if (line.hasWrittenAmount) {
    const info = commodities.get(line.currency);
    const minDecimals = Math.max(
      line.precision,
      Math.min(info ? info.precision : 2, 2),
    );
    amount = formatAmount(
      { commodity: line.currency, quantity: line.amount },
      info,
      minDecimals,
    );
  }
  const annotations = line.annotations ? ` ${line.annotations}` : '';
  const comment = line.comment ? `  ; ${line.comment}` : '';
  const amountPart = amount || annotations ? `    ${amount}${annotations}` : '';
  return `${INDENT}${status}${account}${amountPart}${comment}`.trimEnd();
};

const formatComment = (line: Commentline): string =>
  line.raw || `${INDENT}; ${line.comment}`;

/**
 * formatTransaction converts a transaction object into the string
 * representation which can be stored in the Ledger file. The result has no
 * leading or trailing blank lines.
 */
export const formatTransaction = (
  tx: EnhancedTransaction,
  commodities: Map<string, CommodityInfo>,
): string => {
  const { value } = tx;
  const header = [
    value.auxDate ? `${value.date}=${value.auxDate}` : value.date,
    value.status,
    value.code ? `(${value.code})` : '',
    value.payee,
  ]
    .filter((part) => part !== '')
    .join(' ');
  const headerComment = value.comment ? `  ; ${value.comment}` : '';
  const lines = value.expenselines.map((line) =>
    'account' in line
      ? formatPosting(line, commodities)
      : formatComment(line),
  );
  return [header + headerComment, ...lines].join('\n');
};

/**
 * getTransactionTotal returns the sum of the positive real postings per
 * commodity, which is what the transaction moved (e.g. "$500.00").
 */
export const getTransactionTotal = (tx: EnhancedTransaction): AmountMap => {
  const total: AmountMap = new Map();
  getPostings(tx)
    .filter((posting) => posting.virtual === '')
    .forEach((posting) =>
      posting.amounts
        .filter((amount) => amount.quantity > 0)
        .forEach((amount) =>
          addToAmountMap(total, amount.commodity, amount.quantity),
        ),
    );
  return total;
};

export type TxType = 'expense' | 'income' | 'transfer';

/**
 * inferTxType guesses how the add/edit form should label a transaction.
 */
export const inferTxType = (
  tx: EnhancedTransaction,
  settings: ISettings,
): TxType => {
  const accounts = getPostings(tx)
    .filter((posting) => posting.virtual === '')
    .map((posting) => posting.dealiasedAccount);
  if (accounts.some((a) => isAccountOrChild(a, settings.expenseAccountsPrefix))) {
    return 'expense';
  }
  if (accounts.some((a) => isAccountOrChild(a, settings.incomeAccountsPrefix))) {
    return 'income';
  }
  return 'transfer';
};

export type Filter = (tx: EnhancedTransaction) => boolean;

/**
 * filterByAccount matches transactions with a posting to the account or one of
 * its sub-accounts. Checks both the account name and the dealiased name.
 */
export const filterByAccount =
  (account: string): Filter =>
  (tx: EnhancedTransaction): boolean =>
    getPostings(tx).some(
      (line) =>
        isAccountOrChild(line.account, account) ||
        isAccountOrChild(line.dealiasedAccount, account),
    );

export const filterByPayeeExact =
  (payee: string): Filter =>
  (tx: EnhancedTransaction): boolean =>
    tx.value.payee === payee;

const toISODate = (date: Moment | string): string =>
  typeof date === 'string' ? date : date.format('YYYY-MM-DD');

export const filterByStartDate = (start: Moment | string): Filter => {
  const startISO = toISODate(start);
  return (tx) => tx.value.dateISO >= startISO;
};

export const filterByEndDate = (end: Moment | string): Filter => {
  const endISO = toISODate(end);
  return (tx) => tx.value.dateISO <= endISO;
};

export const filterByTag =
  (tag: string): Filter =>
  (tx) =>
    hasTag(tx, tag);

/**
 * filterTransactions filters the provided transactions if _any_ of the provided
 * filters match. To _and_ filters, apply this function sequentially.
 */
export const filterTransactions = (
  txs: EnhancedTransaction[],
  ...filters: Filter[]
): EnhancedTransaction[] =>
  filters.length > 0 ? txs.filter((tx) => filters.some((fn) => fn(tx))) : txs;

/**
 * sortByDateDesc returns a new array with the most recent transactions first.
 * Transactions on the same date keep reverse file order.
 */
export const sortByDateDesc = (
  txs: EnhancedTransaction[],
): EnhancedTransaction[] =>
  txs
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) =>
      a.tx.value.dateISO === b.tx.value.dateISO
        ? b.index - a.index
        : a.tx.value.dateISO < b.tx.value.dateISO
        ? 1
        : -1,
    )
    .map(({ tx }) => tx);

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const commentHasTag = (comment: string | undefined, tag: string): boolean =>
  !!comment && comment.includes(`:${tag}:`);

/**
 * hasTag returns true if the transaction header, a comment line, or a posting
 * comment contains the `:tag:` tag.
 */
export const hasTag = (tx: EnhancedTransaction, tag: string): boolean =>
  commentHasTag(tx.value.comment, tag) ||
  tx.value.expenselines.some((line) => commentHasTag(line.comment, tag));

/**
 * removeTag returns the transaction block text without the `:tag:` tag.
 * `:a:tag:b:` becomes `:a:b:`, and a comment line that only contained the tag
 * is removed entirely.
 */
export const removeTag = (block: string, tag: string): string =>
  block
    .split('\n')
    .flatMap((line) => {
      const match = /(^|\s);/.exec(line);
      if (!match) {
        return [line];
      }
      const semicolon = match.index + match[1].length;
      const before = line.slice(0, semicolon);
      const comment = line.slice(semicolon + 1);
      if (!commentHasTag(comment, tag)) {
        return [line];
      }
      const newComment = comment
        .replace(new RegExp(`:${escapeRegExp(tag)}:`), ':')
        .replace(/(^|\s):(?=\s|$)/g, '$1')
        .trim();
      if (newComment !== '') {
        return [`${before}; ${newComment}`];
      }
      return before.trim() === '' ? [] : [before.trimEnd()];
    })
    .join('\n');

export interface Node {
  id: string;
  account: string;
  subRows?: Node[];
  expanded?: boolean;
}

export const makeAccountTree = (
  nodes: Node[],
  newValue: string,
  parent?: string,
): void => {
  const parts = newValue.split(':');
  const fullName = parent ? `${parent}:${parts[0]}` : parts[0];
  let destNode = nodes.find((val) => val.account === parts[0]);

  if (!destNode) {
    destNode = { account: parts[0], id: fullName };
    nodes.push(destNode);
  }

  if (parts.length > 1) {
    if (!destNode.subRows) {
      destNode.subRows = [];
    }
    makeAccountTree(destNode.subRows, parts.slice(1).join(':'), fullName);
  }
};

export const sortAccountTree = (nodes: Node[]): void => {
  nodes.sort((a: Node, b: Node): number =>
    a.account.localeCompare(b.account, 'en', { numeric: true }),
  );

  nodes.forEach((node) => {
    if (node.subRows) {
      sortAccountTree(node.subRows);
    }
  });
};
