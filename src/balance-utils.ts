import { isAccountOrChild } from './account-utils';
import { addToAmountMap, AmountMap, CommodityInfo, tolerance } from './amounts';
import { Bucket } from './date-utils';
import { compareMetadataValues } from './metadata';
import {
  EnhancedExpenseLine,
  EnhancedTransaction,
  getPostings,
  postingMetadata,
} from './parser';
import { ISettings } from './settings';

/** PostingPredicate limits calculations to some postings, e.g. a filter. */
export type PostingPredicate = (
  tx: EnhancedTransaction,
  posting: EnhancedExpenseLine,
) => boolean;

interface AccountHistory {
  /** Sorted, unique YYYY-MM-DD dates on which the account changed. */
  dates: string[];
  /** Running balance per commodity after each date. */
  totals: AmountMap[];
}

/**
 * BalanceHistory answers "what was the balance of this account (and its
 * sub-accounts) at the end of this day", per commodity. Transactions dated in
 * the future are included.
 */
export class BalanceHistory {
  public readonly accounts: string[];
  private readonly histories = new Map<string, AccountHistory>();
  private readonly childCache = new Map<string, string[]>();

  constructor(transactions: EnhancedTransaction[], include?: PostingPredicate) {
    const changes = new Map<string, Map<string, AmountMap>>();
    transactions.forEach((tx) => {
      getPostings(tx).forEach((posting) => {
        if (include && !include(tx, posting)) {
          return;
        }
        let byDate = changes.get(posting.dealiasedAccount);
        if (!byDate) {
          byDate = new Map();
          changes.set(posting.dealiasedAccount, byDate);
        }
        let amounts = byDate.get(tx.value.dateISO);
        if (!amounts) {
          amounts = new Map();
          byDate.set(tx.value.dateISO, amounts);
        }
        posting.amounts.forEach((a) =>
          addToAmountMap(amounts, a.commodity, a.quantity),
        );
      });
    });

    changes.forEach((byDate, account) => {
      const dates = [...byDate.keys()].sort();
      const totals: AmountMap[] = [];
      let running: AmountMap = new Map();
      dates.forEach((date) => {
        running = new Map(running);
        (byDate.get(date) as AmountMap).forEach((quantity, commodity) =>
          addToAmountMap(running, commodity, quantity),
        );
        totals.push(running);
      });
      this.histories.set(account, { dates, totals });
    });

    this.accounts = [...changes.keys()].sort();
  }

  /**
   * balanceAt returns the balance at the end of the given day.
   */
  public balanceAt(
    account: string,
    dateISO: string,
    includeChildren = true,
  ): AmountMap {
    const result: AmountMap = new Map();
    const accounts = includeChildren ? this.childrenOf(account) : [account];
    accounts.forEach((name) => {
      const history = this.histories.get(name);
      if (!history) {
        return;
      }
      const index = lastIndexAtOrBefore(history.dates, dateISO);
      if (index >= 0) {
        history.totals[index].forEach((quantity, commodity) =>
          addToAmountMap(result, commodity, quantity),
        );
      }
    });
    return result;
  }

  /**
   * changeBetween returns the change in balance from the start of `startISO`
   * to the end of `endISO`.
   */
  public changeBetween(
    account: string,
    startISO: string,
    endISO: string,
    includeChildren = true,
  ): AmountMap {
    const end = this.balanceAt(account, endISO, includeChildren);
    const before = this.balanceAt(
      account,
      dayBefore(startISO),
      includeChildren,
    );
    return subtractAmountMaps(end, before);
  }

  private childrenOf(account: string): string[] {
    let children = this.childCache.get(account);
    if (!children) {
      children = this.accounts.filter((candidate) =>
        isAccountOrChild(candidate, account),
      );
      this.childCache.set(account, children);
    }
    return children;
  }
}

const dayBefore = (dateISO: string): string =>
  window.moment(dateISO, 'YYYY-MM-DD').subtract(1, 'day').format('YYYY-MM-DD');

const lastIndexAtOrBefore = (dates: string[], dateISO: string): number => {
  let low = 0;
  let high = dates.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (dates[mid] <= dateISO) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
};

export const sumAmountMaps = (...maps: AmountMap[]): AmountMap => {
  const result: AmountMap = new Map();
  maps.forEach((map) =>
    map.forEach((quantity, commodity) =>
      addToAmountMap(result, commodity, quantity),
    ),
  );
  return result;
};

export const subtractAmountMaps = (a: AmountMap, b: AmountMap): AmountMap => {
  const result = new Map(a);
  b.forEach((quantity, commodity) =>
    addToAmountMap(result, commodity, -quantity),
  );
  return result;
};

/**
 * netWorthAt returns assets plus liabilities (liabilities are negative).
 */
export const netWorthAt = (
  history: BalanceHistory,
  settings: ISettings,
  dateISO: string,
): AmountMap =>
  sumAmountMaps(
    history.balanceAt(settings.assetAccountsPrefix, dateISO),
    history.balanceAt(settings.liabilityAccountsPrefix, dateISO),
  );

/**
 * commoditiesUsed lists the commodities that have a non-zero value in any of
 * the maps, ordered by the provided commodity order.
 */
export const commoditiesUsed = (
  maps: AmountMap[],
  commodities: CommodityInfo[],
): string[] => {
  const used = new Set<string>();
  maps.forEach((map) =>
    map.forEach((quantity, commodity) => {
      const info = commodities.find((c) => c.symbol === commodity);
      if (Math.abs(quantity) > tolerance(info ? info.precision : 2)) {
        used.add(commodity);
      }
    }),
  );
  const order = commodities.map((c) => c.symbol);
  return [...used].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
};

export type SeriesMode = 'balance' | 'change';

/**
 * makeAccountSeries returns one value per bucket for the account in the given
 * commodity: the balance at the end of each bucket, or the change during it.
 */
export const makeAccountSeries = (
  history: BalanceHistory,
  account: string,
  buckets: Bucket[],
  commodity: string,
  mode: SeriesMode,
): number[] =>
  buckets.map((bucket) => {
    const map =
      mode === 'balance'
        ? history.balanceAt(account, bucket.endISO)
        : history.changeBetween(account, bucket.startISO, bucket.endISO);
    return round(map.get(commodity) || 0);
  });

export const makeNetWorthSeries = (
  history: BalanceHistory,
  settings: ISettings,
  buckets: Bucket[],
  commodity: string,
): number[] =>
  buckets.map((bucket) =>
    round(netWorthAt(history, settings, bucket.endISO).get(commodity) || 0),
  );

// Removes float noise without losing share or crypto precision.
const round = (value: number): number => Math.round(value * 1e8) / 1e8;

export interface BudgetRow {
  account: string;
  commodity: string;
  /** Positive postings during the range. */
  added: number;
  /** Negative postings during the range (as a positive number). */
  spent: number;
  /** Balance at the end of the range. */
  remaining: number;
}

/**
 * makeBudgetRows summarizes every virtual (budget) account per commodity for
 * the date range.
 */
export const makeBudgetRows = (
  transactions: EnhancedTransaction[],
  budgetAccounts: string[],
  startISO: string,
  endISO: string,
  include?: PostingPredicate,
): BudgetRow[] => {
  const rows = new Map<string, BudgetRow>();
  const budgetSet = new Set(budgetAccounts);
  transactions.forEach((tx) => {
    if (tx.value.dateISO > endISO) {
      return;
    }
    const inRange = tx.value.dateISO >= startISO;
    getPostings(tx).forEach((posting) => {
      if (
        !budgetSet.has(posting.dealiasedAccount) ||
        (include && !include(tx, posting))
      ) {
        return;
      }
      posting.amounts.forEach(({ commodity, quantity }) => {
        const key = `${posting.dealiasedAccount} ${commodity}`;
        let row = rows.get(key);
        if (!row) {
          row = {
            account: posting.dealiasedAccount,
            commodity,
            added: 0,
            spent: 0,
            remaining: 0,
          };
          rows.set(key, row);
        }
        row.remaining += quantity;
        if (inRange) {
          if (quantity >= 0) {
            row.added += quantity;
          } else {
            row.spent -= quantity;
          }
        }
      });
    });
  });
  return [...rows.values()]
    .map((row) => ({
      ...row,
      added: round(row.added),
      spent: round(row.spent),
      remaining: round(row.remaining),
    }))
    .sort(
      (a, b) =>
        a.account.localeCompare(b.account) ||
        a.commodity.localeCompare(b.commodity),
    );
};

export interface SubAccountRow {
  /** Full name of the direct sub-account, or of the account itself. */
  account: string;
  commodity: string;
  /** Balance at the end of the day, including the sub-account's children. */
  balance: number;
}

/**
 * makeSubAccountRows is the equivalent of `ledger bal <account> --depth N+1`:
 * the balance of each direct sub-account (with its own children rolled up),
 * per commodity, at the end of `endISO`. Postings made to the account itself
 * get a row of their own. Settled (zero) balances are left out.
 */
export const makeSubAccountRows = (
  history: BalanceHistory,
  account: string,
  endISO: string,
  commodities: Map<string, CommodityInfo>,
): SubAccountRow[] => {
  const depth = account.split(':').length;
  const direct = new Set<string>();
  history.accounts.forEach((candidate) => {
    if (isAccountOrChild(candidate, account)) {
      direct.add(
        candidate
          .split(':')
          .slice(0, depth + 1)
          .join(':'),
      );
    }
  });

  const rows: SubAccountRow[] = [];
  [...direct].sort().forEach((name) => {
    // The account itself only counts its own postings; children get rows.
    const own = name === account;
    history.balanceAt(name, endISO, !own).forEach((quantity, commodity) => {
      const info = commodities.get(commodity);
      if (Math.abs(quantity) > tolerance(info ? info.precision : 2)) {
        rows.push({ account: name, commodity, balance: round(quantity) });
      }
    });
  });
  return rows.sort(
    (a, b) =>
      a.account.localeCompare(b.account) ||
      a.commodity.localeCompare(b.commodity),
  );
};

export interface MetadataGroupRow {
  /** The metadata value; null for postings without the key. */
  value: string | null;
  commodity: string;
  /** Positive postings during the range. */
  increases: number;
  /** Negative postings during the range, as a positive number. */
  decreases: number;
  /** Balance at the end of the range. */
  balance: number;
  /** Date of the most recent posting (YYYY-MM-DD). */
  lastDate: string;
}

/**
 * makeMetadataGroups is the equivalent of
 * `ledger bal <account> --pivot <key>`: the postings to the account and its
 * sub-accounts, grouped by the value of a metadata key (inherited from the
 * transaction), per commodity.
 */
export const makeMetadataGroups = (
  transactions: EnhancedTransaction[],
  account: string,
  key: string,
  startISO: string,
  endISO: string,
): MetadataGroupRow[] => {
  const rows = new Map<string, MetadataGroupRow>();
  transactions.forEach((tx) => {
    if (tx.value.dateISO > endISO) {
      return;
    }
    const inRange = tx.value.dateISO >= startISO;
    getPostings(tx).forEach((posting) => {
      if (!isAccountOrChild(posting.dealiasedAccount, account)) {
        return;
      }
      const value = postingMetadata(tx, posting)[key] ?? null;
      posting.amounts.forEach(({ commodity, quantity }) => {
        const id = `${value === null ? '\u0000' : value}\u0001${commodity}`;
        let row = rows.get(id);
        if (!row) {
          row = {
            value,
            commodity,
            increases: 0,
            decreases: 0,
            balance: 0,
            lastDate: tx.value.dateISO,
          };
          rows.set(id, row);
        }
        row.balance += quantity;
        if (tx.value.dateISO > row.lastDate) {
          row.lastDate = tx.value.dateISO;
        }
        if (inRange) {
          if (quantity >= 0) {
            row.increases += quantity;
          } else {
            row.decreases -= quantity;
          }
        }
      });
    });
  });
  return [...rows.values()]
    .map((row) => ({
      ...row,
      increases: round(row.increases),
      decreases: round(row.decreases),
      balance: round(row.balance),
    }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        return a.value === b.value ? 0 : a.value === null ? 1 : -1;
      }
      return (
        compareMetadataValues(a.value, b.value) ||
        a.commodity.localeCompare(b.commodity)
      );
    });
};

/**
 * metadataKeysByAccount lists, for every account and its parents, the metadata
 * keys used on postings to it (including keys inherited from transactions).
 */
export const metadataKeysByAccount = (
  transactions: EnhancedTransaction[],
): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>();
  transactions.forEach((tx) =>
    getPostings(tx).forEach((posting) => {
      const keys = Object.keys(postingMetadata(tx, posting));
      if (keys.length === 0) {
        return;
      }
      const parts = posting.dealiasedAccount.split(':');
      parts.forEach((_, i) => {
        const name = parts.slice(0, i + 1).join(':');
        let set = result.get(name);
        if (!set) {
          set = new Set();
          result.set(name, set);
        }
        keys.forEach((k) => set.add(k));
      });
    }),
  );
  return result;
};

interface RootNode {
  children: TreeNode[];
}

interface TreeNode {
  exists: boolean;
  label: string;
  children: TreeNode[];
}

const renderTree = (
  output: string[],
  node: RootNode | TreeNode,
  path?: string,
): void => {
  let newPath: string | undefined;
  if ('label' in node) {
    newPath = path ? [path, node.label].join(':') : node.label;
    if (node.children.length !== 1 && node.exists) {
      output.push(newPath);
    }
  }
  node.children.forEach((child) => renderTree(output, child, newPath));
};

/**
 * removeDuplicateAccounts accepts a list of account names and removes any which
 * only have a single child. For example, if given the input:
 * - Liabilities
 * - Liabilities:Credit
 * - Liabilities:Credit:Chase
 * - Liabilities:Credit:Citi
 * it would remove "Liabilities" because it only has a single child
 * ("Liabilities:Credit").
 */
export const removeDuplicateAccounts = (input: string[]): string[] => {
  const tree: RootNode = { children: [] };

  input.forEach((path) => {
    let parentNode = tree;
    path.split(':').forEach((segment, i, segments) => {
      const lastSegment = segments.length === i + 1;
      let node = parentNode.children.find(({ label }) => label === segment);
      if (!node) {
        node = {
          exists: lastSegment,
          label: segment,
          children: [],
        };
        parentNode.children.push(node);
      } else if (lastSegment) {
        node.exists = true;
      }
      parentNode = node;
    });
  });

  const output: string[] = [];
  renderTree(output, tree);
  return output;
};
