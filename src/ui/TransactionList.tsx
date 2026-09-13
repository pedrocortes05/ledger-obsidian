import { formatAmountMap } from '../amounts';
import { LedgerModifier } from '../file-interface';
import { EnhancedTransaction, getPostings, TransactionCache } from '../parser';
import {
  getTransactionTotal,
  hasTag,
  sortByDateDesc,
  wrapVirtual,
} from '../transaction-utils';
import React from 'react';
import styled from 'styled-components';

export const UNREVIEWED_TAG = 'unreviewed';

const TableStyles = styled.div`
  overflow-x: auto;

  table {
    width: 100%;
    border-spacing: 0;
    border: 1px solid var(--background-modifier-border);
  }

  tr:hover {
    background: var(--background-secondary);
  }

  th {
    text-align: left;
    background: var(--background-primary-alt);
  }

  th,
  td {
    margin: 0;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    vertical-align: top;
  }

  td.ledger-amount-cell {
    text-align: right;
    white-space: nowrap;
  }

  .ledger-muted {
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
  }

  .ledger-row-actions {
    white-space: nowrap;
  }

  .ledger-row-actions button {
    background: none;
    box-shadow: none;
    padding: 2px 6px;
    margin: 0;
    color: var(--text-muted);
    visibility: hidden;
  }

  tr:hover .ledger-row-actions button,
  .ledger-row-actions button:focus {
    visibility: visible;
  }

  .ledger-card {
    border-bottom: 1px solid var(--background-modifier-border);
    padding: 8px 0;
  }

  .ledger-card-header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .ledger-card .ledger-row-actions button {
    visibility: visible;
  }
`;

interface Row {
  tx: EnhancedTransaction;
  total: string;
  from: string;
  to: string;
  budget?: string;
  unreviewed: boolean;
}

const describeAccounts = (accounts: string[]): string => {
  const unique = [...new Set(accounts)];
  if (unique.length === 0) {
    return '';
  }
  return unique.length === 1 ? unique[0] : `${unique[0]} +${unique.length - 1}`;
};

export const makeRow = (
  tx: EnhancedTransaction,
  txCache: TransactionCache,
): Row => {
  const postings = getPostings(tx);
  const real = postings.filter((p) => p.virtual === '');
  const virtual = postings.filter((p) => p.virtual !== '');
  return {
    tx,
    total: formatAmountMap(getTransactionTotal(tx), txCache.commodityMap),
    from: describeAccounts(
      real.filter((p) => p.amounts.some((a) => a.quantity < 0)).map((p) => p.account),
    ),
    to: describeAccounts(
      real.filter((p) => p.amounts.some((a) => a.quantity >= 0)).map((p) => p.account),
    ),
    budget: virtual.length
      ? virtual.map((p) => wrapVirtual(p.account, p.virtual)).join(', ')
      : undefined,
    unreviewed: hasTag(tx, UNREVIEWED_TAG),
  };
};

const RowActions: React.FC<{
  row: Row;
  updater: LedgerModifier;
}> = ({ row, updater }): JSX.Element => (
  <span className="ledger-row-actions">
    {row.unreviewed ? (
      <button
        title="Mark reviewed"
        aria-label="Mark reviewed"
        onClick={() => updater.removeTag(row.tx, UNREVIEWED_TAG)}
      >
        ✓
      </button>
    ) : null}
    <button
      title="Edit"
      aria-label="Edit"
      onClick={() => updater.openExpenseModal('modify', row.tx)}
    >
      ✎
    </button>
    <button
      title="Copy"
      aria-label="Copy"
      onClick={() => updater.openExpenseModal('clone', row.tx)}
    >
      ⧉
    </button>
    <button
      title="Delete"
      aria-label="Delete"
      onClick={() => updater.deleteTransaction(row.tx)}
    >
      ✕
    </button>
  </span>
);

const PAGE_SIZE = 50;

/**
 * TransactionTable lists transactions, most recent first. On mobile it
 * renders cards instead of a table.
 */
export const TransactionTable: React.FC<{
  transactions: EnhancedTransaction[];
  txCache: TransactionCache;
  updater: LedgerModifier;
  mobile?: boolean;
  limit?: number;
  emptyMessage?: string;
}> = (props): JSX.Element => {
  const [visible, setVisible] = React.useState(props.limit ?? PAGE_SIZE);
  const rows = React.useMemo(
    () =>
      sortByDateDesc(props.transactions)
        .slice(0, visible)
        .map((tx) => makeRow(tx, props.txCache)),
    [props.transactions, props.txCache, visible],
  );

  if (props.transactions.length === 0) {
    return <p>{props.emptyMessage ?? 'No transactions for the selected dates.'}</p>;
  }

  const more =
    props.limit === undefined && props.transactions.length > visible ? (
      <button onClick={() => setVisible(visible + PAGE_SIZE)}>
        Show more ({props.transactions.length - visible} remaining)
      </button>
    ) : null;

  if (props.mobile) {
    return (
      <TableStyles>
        {rows.map((row) => (
          <div className="ledger-card" key={`${row.tx.block.firstLine}-${row.tx.value.payee}`}>
            <div className="ledger-card-header">
              <strong>{row.tx.value.payee}</strong>
              <span>{row.total}</span>
            </div>
            <div className="ledger-muted">
              {row.tx.value.date} · {row.from} → {row.to}
              {row.budget ? ` · ${row.budget}` : ''}
            </div>
            <RowActions row={row} updater={props.updater} />
          </div>
        ))}
        {more}
      </TableStyles>
    );
  }

  return (
    <TableStyles>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Payee</th>
            <th>Total</th>
            <th>From</th>
            <th>To</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.tx.block.firstLine}-${row.tx.value.payee}`}>
              <td>{row.tx.value.date}</td>
              <td>
                {row.tx.value.payee}
                {row.budget ? <div className="ledger-muted">{row.budget}</div> : null}
              </td>
              <td className="ledger-amount-cell">{row.total}</td>
              <td>{row.from}</td>
              <td>{row.to}</td>
              <td>
                <RowActions row={row} updater={props.updater} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {more}
    </TableStyles>
  );
};
