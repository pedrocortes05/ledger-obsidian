import {
  addToAmountMap,
  Amount,
  AmountMap,
  CommodityInfo,
  defaultCommodityInfo,
  ParsedAmount,
  parseAmount,
  tolerance,
} from './amounts';
import { Error, TxError } from './error';
import { ISettings } from './settings';
import { dealiasAccount, isAccountOrChild } from './account-utils';
import { Moment } from 'moment';

/**
 * TransactionCache contains information from the parsed ledger file. It
 * includes both the raw data that is necessary to reconstruct the ledger file,
 * as well as data structures more useful for interaction.
 */
export interface TransactionCache {
  /** Transactions in file order. */
  transactions: EnhancedTransaction[];
  firstDate: Moment;

  /** Payees ordered by most recent use, case-insensitively de-duplicated. */
  payees: string[];
  aliases: Map<string, string>;

  /**
   * parsingErrors contains a list of all errors which occured while parsing the
   * ledger file. If there are any errors, then the results of the transaction
   * cache may not be completely valid due to transactions that could not be
   * parsed. These errors should be displayed to the user so they can be
   * rectified.
   */
  parsingErrors: Error[];

  /** All accounts (dealiased, without virtual delimiters), sorted by name. */
  accounts: string[];
  /** Accounts ordered by most recent use. */
  accountsByUsage: string[];

  expenseAccounts: string[];
  assetAccounts: string[];
  incomeAccounts: string[];
  liabilityAccounts: string[];
  /** Accounts used in (virtual) or [virtual] postings. */
  virtualAccounts: string[];

  /** Commodities ordered by number of uses. */
  commodities: CommodityInfo[];
  commodityMap: Map<string, CommodityInfo>;

  /** Prices declared with `P` directives. */
  prices: PriceDirective[];
}

export type Status = '' | '*' | '!';
export type VirtualType = '' | '(' | '[';

export interface PostingPrice {
  /** `@` is a per-unit price, `@@` is a total price. */
  type: '@' | '@@';
  amount: Amount;
}

export interface EnhancedExpenseLine {
  /** Absolute, 0-based line in the file. -1 when not from the file. */
  line: number;
  /** The line exactly as written in the file. */
  raw: string;
  reconcile: Status;
  /** Account as written, without virtual delimiters. */
  account: string;
  dealiasedAccount: string;
  virtual: VirtualType;
  /** Primary quantity (the written amount, or the inferred one). */
  amount: number;
  /** Commodity of the primary quantity. */
  currency: string;
  /**
   * All amounts this posting adds to the account. Usually one; an inferred
   * posting balancing several commodities has several.
   */
  amounts: Amount[];
  /** False when the amount was left empty or assigned with `= X`. */
  hasWrittenAmount: boolean;
  /** Decimals as written. */
  precision: number;
  price?: PostingPrice;
  /** Lot cost from `{unit cost}` or `{{total cost}}`; used for balancing instead of the price. */
  lotCost?: PostingPrice;
  /** Everything after the amount before a comment ({lot} [date] @ price = assertion). */
  annotations?: string;
  /** Balance assertion or assignment (`= X`). */
  assertion?: Amount;
  comment?: string;
}

export interface Commentline {
  line: number;
  raw: string;
  comment: string;
}

export interface EnhancedTransaction {
  type: 'tx';
  block: FileBlock;
  value: {
    /** Date as written. */
    date: string;
    /** Normalized YYYY-MM-DD date. */
    dateISO: string;
    auxDate?: string;
    status: Status;
    code?: string;
    payee: string;
    comment?: string;
    expenselines: (EnhancedExpenseLine | Commentline)[];
  };
}

export interface PriceDirective {
  dateISO: string;
  commodity: string;
  price: Amount;
}

export interface FileBlock {
  block: string;
  firstLine: number;
  lastLine: number;
}

const datePattern = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const headerPattern =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?:=(\S+))?(?:\s+([*!]))?(?:\s+\(([^)]*)\))?(?:\s+(.*))?$/;

export const normalizeDate = (date: string): string | undefined => {
  const match = datePattern.exec(date);
  if (!match) {
    return undefined;
  }
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(
    2,
    '0',
  )}`;
};

/**
 * splitComment separates `text ; comment`. The semicolon must be at the start
 * or preceded by whitespace, and outside of quotes.
 */
const splitComment = (text: string): [string, string | undefined] => {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ';' && !inQuotes && (i === 0 || /\s/.test(text[i - 1]))) {
      return [text.slice(0, i).trimEnd(), text.slice(i + 1).trim()];
    }
  }
  return [text.trimEnd(), undefined];
};

const isBlank = (line: string): boolean => line.trim() === '';
const isIndented = (line: string): boolean => /^[ \t]/.test(line);

interface PostingParseResult {
  posting?: EnhancedExpenseLine;
  error?: string;
}

/**
 * parsePostingLine parses an indented posting such as
 * `  * Assets:Checking    -$10.00 @ 17.5 MXN = $500 ; memo`.
 */
export const parsePostingLine = (
  raw: string,
  lineNumber: number,
): PostingParseResult => {
  let s = raw.trim();
  let reconcile: Status = '';
  const status = /^([*!])\s*/.exec(s);
  if (status) {
    reconcile = status[1] as Status;
    s = s.slice(status[0].length);
  }

  // The account ends at a hard separator (two spaces or a tab), at a comment,
  // or at the end of the line.
  const separator = /( {2,}|\t|\s;)/.exec(s);
  let account = separator ? s.slice(0, separator.index) : s;
  let rest = separator ? s.slice(separator.index) : '';
  account = account.trim();

  let virtual: VirtualType = '';
  if (/^\(.*\)$/.test(account)) {
    virtual = '(';
    account = account.slice(1, -1).trim();
  } else if (/^\[.*\]$/.test(account)) {
    virtual = '[';
    account = account.slice(1, -1).trim();
  }
  if (account === '') {
    return { error: 'Posting is missing an account name' };
  }

  const [amountText, comment] = splitComment(rest);
  rest = amountText.trim();

  const posting: EnhancedExpenseLine = {
    line: lineNumber,
    raw,
    reconcile,
    account,
    dealiasedAccount: account,
    virtual,
    amount: 0,
    currency: '',
    amounts: [],
    hasWrittenAmount: false,
    precision: 0,
    comment,
  };

  if (rest === '') {
    return { posting };
  }

  if (!rest.startsWith('=')) {
    if (rest.startsWith('(')) {
      return { error: 'Expression amounts are not supported' };
    }
    const parsed = parseAmount(rest);
    if (!parsed) {
      return { error: `Unable to read amount "${rest}"` };
    }
    posting.hasWrittenAmount = true;
    posting.amount = parsed.amount.quantity;
    posting.currency = parsed.amount.commodity;
    posting.precision = parsed.amount.precision;
    posting.amounts = [
      { commodity: parsed.amount.commodity, quantity: parsed.amount.quantity },
    ];
    (posting as ParsedPosting).parsedAmount = parsed.amount;
    rest = parsed.rest.trim();
  }

  const annotationsStart = rest;
  // Lot annotations: {price} {{total}} [date] (note)
  for (;;) {
    const lot = /^(\{\{[^}]*\}\}|\{[^}]*\}|\[[^\]]*\]|\((?!@)[^)]*\))\s*/.exec(
      rest,
    );
    if (!lot) {
      break;
    }
    const cost = /^\{(\{?)([^}]*)\}/.exec(lot[1]);
    const costAmount = cost && parseAmount(cost[2].replace(/^=/, ''));
    if (cost && costAmount) {
      posting.lotCost = {
        type: cost[1] ? '@@' : '@',
        amount: {
          commodity: costAmount.amount.commodity,
          quantity: costAmount.amount.quantity,
        },
      };
    }
    rest = rest.slice(lot[0].length);
  }

  const price = /^\(?(@@|@)\)?\s*/.exec(rest);
  if (price) {
    const parsed = parseAmount(rest.slice(price[0].length));
    if (!parsed) {
      return { error: `Unable to read price "${rest}"` };
    }
    posting.price = {
      type: price[1] as '@' | '@@',
      amount: {
        commodity: parsed.amount.commodity,
        quantity: parsed.amount.quantity,
      },
    };
    rest = parsed.rest.trim();
  }

  const assertion = /^=\*?\s*/.exec(rest);
  if (assertion) {
    const parsed = parseAmount(rest.slice(assertion[0].length));
    if (!parsed) {
      return { error: `Unable to read balance assertion "${rest}"` };
    }
    posting.assertion = {
      commodity: parsed.amount.commodity,
      quantity: parsed.amount.quantity,
    };
    (posting as ParsedPosting).parsedAssertion = parsed.amount;
    rest = parsed.rest.trim();
  }

  if (rest !== '') {
    return { error: `Unrecognized text in posting: "${rest}"` };
  }

  const annotations = annotationsStart.trim();
  if (annotations) {
    posting.annotations = annotations;
  }
  return { posting };
};

type ParsedPosting = EnhancedExpenseLine & {
  parsedAmount?: ParsedAmount;
  parsedAssertion?: ParsedAmount;
};

interface RawParse {
  transactions: EnhancedTransaction[];
  aliases: Map<string, string>;
  declaredAccounts: string[];
  declaredCommodities: string[];
  prices: PriceDirective[];
  errors: Error[];
}

const singleLineBlock = (lines: string[], i: number): FileBlock => ({
  block: lines[i],
  firstLine: i,
  lastLine: i,
});

const ignoredDirectives =
  /^(apply|end|year|Y|D|N|C|A|bucket|define|tag|value|assert|check|expr|python|import|eval|--|def)\b/;

/**
 * parseLines turns the file into transactions and directives without
 * computing any amounts.
 */
const parseLines = (fileContents: string): RawParse => {
  const lines = fileContents.split(/\r?\n/);
  const result: RawParse = {
    transactions: [],
    aliases: new Map(),
    declaredAccounts: [],
    declaredCommodities: [],
    prices: [],
    errors: [],
  };

  let i = 0;
  const skipIndented = (): void => {
    while (i < lines.length && isIndented(lines[i]) && !isBlank(lines[i])) {
      i++;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    if (isIndented(line)) {
      // Indented line that does not belong to a transaction, e.g. under a
      // directive or a top-level comment. Ledger ignores these as well.
      i++;
      continue;
    }

    if (/^[;#%|*]/.test(line)) {
      i++;
      continue;
    }

    if (/^\d/.test(line)) {
      i = parseTransaction(lines, i, result);
      continue;
    }

    if (/^[~=]/.test(line)) {
      // Periodic (~) and automated (=) transactions do not affect balances in
      // this plugin.
      i++;
      skipIndented();
      continue;
    }

    const alias = /^alias\s+([^=]+?)\s*=\s*(.+?)\s*$/.exec(line);
    if (alias) {
      result.aliases.set(alias[1], alias[2]);
      i++;
      continue;
    }

    const account = /^account\s+(.+)$/.exec(line);
    if (account) {
      result.declaredAccounts.push(splitComment(account[1])[0].trim());
      i++;
      skipIndented();
      continue;
    }

    const commodity = /^commodity\s+(.+)$/.exec(line);
    if (commodity) {
      const parsed = parseAmount(`1 ${commodity[1].trim()}`);
      result.declaredCommodities.push(
        parsed ? parsed.amount.commodity : commodity[1].trim(),
      );
      i++;
      skipIndented();
      continue;
    }

    const price = /^P\s+(\S+)(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s+(.+)$/.exec(
      line,
    );
    if (price) {
      const dateISO = normalizeDate(price[1]);
      const [text] = splitComment(price[2]);
      const commodityMatch = /^("[^"]*"|\S+)\s+(.+)$/.exec(text);
      const priceAmount = commodityMatch && parseAmount(commodityMatch[2]);
      if (!dateISO || !commodityMatch || !priceAmount) {
        result.errors.push({
          message: 'Unable to read price directive',
          block: singleLineBlock(lines, i),
        });
      } else {
        result.prices.push({
          dateISO,
          commodity: commodityMatch[1].replace(/"/g, ''),
          price: {
            commodity: priceAmount.amount.commodity,
            quantity: priceAmount.amount.quantity,
          },
        });
      }
      i++;
      continue;
    }

    if (/^(comment|test)\b/.test(line)) {
      const start = i;
      i++;
      while (i < lines.length && !/^end\s+(comment|test)\b/.test(lines[i])) {
        i++;
      }
      if (i >= lines.length) {
        result.errors.push({
          message: 'Comment block is never closed with "end comment"',
          block: singleLineBlock(lines, start),
        });
      }
      i++;
      continue;
    }

    if (/^include\s/.test(line)) {
      result.errors.push({
        message:
          'The include directive is not supported; transactions from the included file are ignored',
        block: singleLineBlock(lines, i),
      });
      i++;
      continue;
    }

    if (/^(payee|commodity|tag)\s/.test(line) || ignoredDirectives.test(line)) {
      i++;
      skipIndented();
      continue;
    }

    result.errors.push({
      message: 'Unrecognized line',
      block: singleLineBlock(lines, i),
    });
    i++;
  }

  return result;
};

const parseTransaction = (
  lines: string[],
  start: number,
  result: RawParse,
): number => {
  const header = lines[start];
  let i = start + 1;
  while (i < lines.length && isIndented(lines[i]) && !isBlank(lines[i])) {
    i++;
  }
  const block: FileBlock = {
    block: lines.slice(start, i).join('\n'),
    firstLine: start,
    lastLine: i - 1,
  };

  const match = headerPattern.exec(header.trimEnd());
  const dateISO = match ? normalizeDate(match[1]) : undefined;
  if (!match || !dateISO || !window.moment(dateISO, 'YYYY-MM-DD', true).isValid()) {
    result.errors.push({ message: 'Unable to read transaction date', block });
    return i;
  }

  const [payee, comment] = splitComment(match[5] || '');
  const tx: EnhancedTransaction = {
    type: 'tx',
    block,
    value: {
      date: match[1],
      dateISO,
      auxDate: match[2],
      status: (match[3] || '') as Status,
      code: match[4],
      payee: payee.trim(),
      comment,
      expenselines: [],
    },
  };

  for (let j = start + 1; j < i; j++) {
    const raw = lines[j];
    const trimmed = raw.trim();
    if (/^[;#%|]/.test(trimmed)) {
      tx.value.expenselines.push({
        line: j,
        raw,
        comment: trimmed.slice(1).trim(),
      });
      continue;
    }
    const parsed = parsePostingLine(raw, j);
    if (parsed.error || !parsed.posting) {
      result.errors.push({
        message: `Line ${j + 1}: ${parsed.error}`,
        block,
      });
      return i;
    }
    tx.value.expenselines.push(parsed.posting);
  }

  result.transactions.push(tx);
  return i;
};

export const getPostings = (
  tx: EnhancedTransaction,
): EnhancedExpenseLine[] =>
  tx.value.expenselines.filter(
    (line): line is EnhancedExpenseLine => 'account' in line,
  );

/**
 * costOf returns the value used to balance a posting: its amount, or its
 * price when one is given (`10 AAPL @ $150` balances as `$1500`).
 */
const costOf = (posting: EnhancedExpenseLine): Amount[] => {
  // Like ledger-cli, a lot cost takes precedence over the sale price; the
  // difference is balanced by the (usually empty) capital gains posting.
  const cost = posting.lotCost || posting.price;
  if (!cost || posting.amounts.length !== 1) {
    return posting.amounts;
  }
  const quantity = posting.amounts[0].quantity;
  return [
    {
      commodity: cost.amount.commodity,
      quantity:
        cost.type === '@'
          ? quantity * cost.amount.quantity
          : Math.sign(quantity) * Math.abs(cost.amount.quantity),
    },
  ];
};

/**
 * computeAmounts fills in amounts that are not written in the file (the
 * single empty posting and balance assignments), verifies that transactions
 * balance and checks balance assertions. Transactions are processed in file
 * order, like ledger-cli does.
 */
const computeAmounts = (
  transactions: EnhancedTransaction[],
  commodities: Map<string, CommodityInfo>,
  errors: Error[],
): EnhancedTransaction[] => {
  const balances = new Map<string, AmountMap>();
  const balanceOf = (account: string): AmountMap => {
    let map = balances.get(account);
    if (!map) {
      map = new Map();
      balances.set(account, map);
    }
    return map;
  };
  const tol = (commodity: string): number =>
    tolerance(commodities.get(commodity)?.precision ?? 2);

  return transactions.filter((tx) => {
    const postings = getPostings(tx);
    const txError = (message: string): void => {
      errors.push({ message, transaction: tx } as TxError);
    };

    // Balance assignments: `Account  = $500` sets the amount so the account
    // ends up with the given balance.
    const pending = new Map<string, AmountMap>();
    postings.forEach((posting) => {
      if (!posting.hasWrittenAmount && posting.assertion) {
        const { commodity, quantity } = posting.assertion;
        const current =
          (balanceOf(posting.dealiasedAccount).get(commodity) || 0) +
          (pending.get(posting.dealiasedAccount)?.get(commodity) || 0);
        posting.amounts = [{ commodity, quantity: quantity - current }];
      }
      if (posting.amounts.length > 0) {
        let map = pending.get(posting.dealiasedAccount);
        if (!map) {
          map = new Map();
          pending.set(posting.dealiasedAccount, map);
        }
        posting.amounts.forEach((a) =>
          addToAmountMap(map as AmountMap, a.commodity, a.quantity),
        );
      }
    });

    // Real postings balance together, [bracketed] virtual postings balance
    // together, and (parenthesized) virtual postings do not need to balance.
    for (const group of ['', '['] as VirtualType[]) {
      const members = postings.filter((p) => p.virtual === group);
      const missing = members.filter(
        (p) => !p.hasWrittenAmount && !p.assertion,
      );
      const sums: AmountMap = new Map();
      members
        .filter((p) => !missing.includes(p))
        .forEach((p) =>
          costOf(p).forEach((a) => addToAmountMap(sums, a.commodity, a.quantity)),
        );
      const unbalanced = [...sums.entries()].filter(
        ([commodity, quantity]) => Math.abs(quantity) > tol(commodity),
      );

      if (missing.length > 1) {
        txError(
          'Transaction has multiple postings without an amount. At most one is allowed.',
        );
        return false;
      }

      if (missing.length === 1) {
        const posting = missing[0];
        posting.amounts = unbalanced.map(([commodity, quantity]) => ({
          commodity,
          quantity: -quantity,
        }));
        if (posting.amounts.length === 0) {
          const commodity = sums.keys().next().value || '';
          posting.amounts = [{ commodity, quantity: 0 }];
        }
        continue;
      }

      // With exactly two commodities and no prices ledger infers the exchange
      // rate, so only a single unbalanced commodity is an error.
      if (unbalanced.length === 1 && sums.size === 1) {
        const [commodity, quantity] = unbalanced[0];
        txError(
          `Transaction does not balance: off by ${quantity.toFixed(
            Math.max(commodities.get(commodity)?.precision ?? 2, 2),
          )} ${commodity}`,
        );
      }
    }

    // Apply amounts and verify assertions in posting order.
    postings.forEach((posting) => {
      if (posting.amounts.length > 0) {
        posting.amount = posting.amounts[0].quantity;
        posting.currency = posting.amounts[0].commodity;
      }
      const balance = balanceOf(posting.dealiasedAccount);
      posting.amounts.forEach((a) =>
        addToAmountMap(balance, a.commodity, a.quantity),
      );
      if (posting.assertion && posting.hasWrittenAmount) {
        const { commodity, quantity } = posting.assertion;
        const actual = balance.get(commodity) || 0;
        if (Math.abs(actual - quantity) > tol(commodity)) {
          txError(
            `Balance assertion failed for ${posting.account}: expected ${quantity} ${commodity}, found ${actual.toFixed(
              2,
            )} ${commodity}`,
          );
        }
      }
    });

    return true;
  });
};

interface UsageStats {
  count: number;
  lastDate: string;
  lastIndex: number;
  display: string;
}

const recordUsage = (
  stats: Map<string, UsageStats>,
  key: string,
  display: string,
  dateISO: string,
  index: number,
): void => {
  const current = stats.get(key);
  if (!current) {
    stats.set(key, { count: 1, lastDate: dateISO, lastIndex: index, display });
    return;
  }
  current.count++;
  if (
    dateISO > current.lastDate ||
    (dateISO === current.lastDate && index > current.lastIndex)
  ) {
    current.lastDate = dateISO;
    current.lastIndex = index;
    current.display = display;
  }
};

const byRecency = (a: UsageStats, b: UsageStats): number =>
  a.lastDate === b.lastDate
    ? b.lastIndex - a.lastIndex || b.count - a.count
    : a.lastDate < b.lastDate
    ? 1
    : -1;

const collectCommodities = (
  transactions: EnhancedTransaction[],
  declared: string[],
): Map<string, CommodityInfo> => {
  const infos = new Map<string, CommodityInfo & { negAfter: number; negBefore: number; prefixCount: number; spacedCount: number }>();
  const record = (amount: ParsedAmount, dateISO: string): void => {
    let info = infos.get(amount.commodity);
    if (!info) {
      info = {
        symbol: amount.commodity,
        count: 0,
        prefix: amount.prefix,
        spaced: amount.spaced,
        precision: 0,
        negativeBeforeSymbol: true,
        thousands: false,
        lastDate: dateISO,
        negAfter: 0,
        negBefore: 0,
        prefixCount: 0,
        spacedCount: 0,
      };
      infos.set(amount.commodity, info);
    }
    info.count++;
    info.prefixCount += amount.prefix ? 1 : 0;
    info.spacedCount += amount.spaced ? 1 : 0;
    info.precision = Math.max(info.precision, amount.precision);
    info.thousands = info.thousands || amount.thousands;
    if (amount.quantity < 0 && amount.prefix) {
      if (amount.negativeBeforeSymbol) {
        info.negBefore++;
      } else {
        info.negAfter++;
      }
    }
    if (dateISO > info.lastDate) {
      info.lastDate = dateISO;
    }
  };

  transactions.forEach((tx) =>
    getPostings(tx).forEach((posting) => {
      const parsed = posting as ParsedPosting;
      if (parsed.parsedAmount) {
        record(parsed.parsedAmount, tx.value.dateISO);
      }
      if (parsed.parsedAssertion) {
        record(parsed.parsedAssertion, tx.value.dateISO);
      }
      delete parsed.parsedAmount;
      delete parsed.parsedAssertion;
    }),
  );

  const result = new Map<string, CommodityInfo>();
  infos.forEach((info, symbol) => {
    result.set(symbol, {
      symbol,
      count: info.count,
      prefix: info.prefixCount * 2 >= info.count,
      spaced: info.spacedCount * 2 > info.count,
      precision: info.precision,
      negativeBeforeSymbol: info.negBefore >= info.negAfter,
      thousands: info.thousands,
      lastDate: info.lastDate,
    });
  });
  declared.forEach((symbol) => {
    if (!result.has(symbol)) {
      result.set(symbol, defaultCommodityInfo(symbol));
    }
  });
  return result;
};

export const parse = (
  fileContents: string,
  settings: ISettings,
): TransactionCache => {
  const raw = parseLines(fileContents);
  const errors = raw.errors;

  raw.transactions.forEach((tx) =>
    getPostings(tx).forEach((posting) => {
      posting.dealiasedAccount = dealiasAccount(posting.account, raw.aliases);
    }),
  );

  const commodityMap = collectCommodities(
    raw.transactions,
    raw.declaredCommodities,
  );
  const transactions = computeAmounts(raw.transactions, commodityMap, errors);

  const payeeStats = new Map<string, UsageStats>();
  const accountStats = new Map<string, UsageStats>();
  const virtualAccounts = new Set<string>();
  const realAccounts = new Set<string>();
  transactions.forEach((tx, index) => {
    if (tx.value.payee) {
      recordUsage(
        payeeStats,
        tx.value.payee.toLowerCase(),
        tx.value.payee,
        tx.value.dateISO,
        index,
      );
    }
    getPostings(tx).forEach((posting) => {
      recordUsage(
        accountStats,
        posting.dealiasedAccount,
        posting.dealiasedAccount,
        tx.value.dateISO,
        index,
      );
      if (posting.virtual) {
        virtualAccounts.add(posting.dealiasedAccount);
      } else {
        realAccounts.add(posting.dealiasedAccount);
      }
    });
  });
  raw.declaredAccounts.forEach((account) => {
    const dealiased = dealiasAccount(account, raw.aliases);
    if (!accountStats.has(dealiased)) {
      accountStats.set(dealiased, {
        count: 0,
        lastDate: '',
        lastIndex: -1,
        display: dealiased,
      });
    }
  });

  const payees = [...payeeStats.values()].sort(byRecency).map((s) => s.display);
  const accountsByUsage = [...accountStats.values()]
    .sort(byRecency)
    .map((s) => s.display);
  const accounts = [...accountsByUsage].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }),
  );

  const ofType = (prefix: string): string[] =>
    accounts.filter(
      (account) =>
        isAccountOrChild(account, prefix) &&
        (realAccounts.has(account) || !virtualAccounts.has(account)),
    );

  const firstDateISO = transactions.reduce(
    (min, tx) => (min === '' || tx.value.dateISO < min ? tx.value.dateISO : min),
    '',
  );

  const commodities = [...commodityMap.values()].sort(
    (a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol),
  );

  return {
    transactions,
    firstDate: firstDateISO
      ? window.moment(firstDateISO, 'YYYY-MM-DD')
      : window.moment().startOf('day'),
    payees,
    aliases: raw.aliases,
    parsingErrors: errors,
    accounts,
    accountsByUsage,
    assetAccounts: ofType(settings.assetAccountsPrefix),
    expenseAccounts: ofType(settings.expenseAccountsPrefix),
    incomeAccounts: ofType(settings.incomeAccountsPrefix),
    liabilityAccounts: ofType(settings.liabilityAccountsPrefix),
    virtualAccounts: accounts.filter((account) => virtualAccounts.has(account)),
    commodities,
    commodityMap,
    prices: raw.prices,
  };
};
