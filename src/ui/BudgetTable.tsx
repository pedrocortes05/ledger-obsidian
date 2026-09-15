import { makeBudgetRows, PostingPredicate } from '../balance-utils';
import { TransactionCache } from '../parser';
import { formatSigned } from './Charts';
import React from 'react';
import styled from 'styled-components';

const Styles = styled.div`
  overflow-x: auto;

  table {
    width: 100%;
    border-spacing: 0;
    border: 1px solid var(--background-modifier-border);
  }

  th {
    text-align: left;
    background: var(--background-primary-alt);
  }

  th,
  td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  td.ledger-number,
  th.ledger-number {
    text-align: right;
    white-space: nowrap;
  }

  .ledger-negative {
    color: var(--text-error);
  }

  tr.ledger-clickable {
    cursor: pointer;
  }

  tr.ledger-clickable:hover {
    background: var(--background-secondary);
  }
`;

/**
 * BudgetTable summarizes every virtual account, e.g. (Budget:Boston): what
 * was added and spent in the selected range and what remains at its end.
 */
export const BudgetTable: React.FC<{
  txCache: TransactionCache;
  startISO: string;
  endISO: string;
  include?: PostingPredicate;
  onSelectAccount: (account: string) => void;
}> = (props): JSX.Element => {
  const rows = React.useMemo(
    () =>
      makeBudgetRows(
        props.txCache.transactions,
        props.txCache.virtualAccounts,
        props.startISO,
        props.endISO,
        props.include,
      ),
    [props.txCache, props.startISO, props.endISO, props.include],
  );

  if (rows.length === 0) {
    return (
      <p>
        No budget accounts found. Budget lines are virtual postings such as{' '}
        <code>(Budget:Trip) -$50</code>.
      </p>
    );
  }

  return (
    <Styles>
      <table>
        <thead>
          <tr>
            <th>Budget</th>
            <th className="ledger-number">Added</th>
            <th className="ledger-number">Spent</th>
            <th className="ledger-number">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.account} ${row.commodity}`}
              className="ledger-clickable"
              onClick={() => props.onSelectAccount(row.account)}
            >
              <td>{row.account}</td>
              <td className="ledger-number">
                {formatSigned(props.txCache, row.commodity, row.added)}
              </td>
              <td className="ledger-number">
                {formatSigned(props.txCache, row.commodity, row.spent)}
              </td>
              <td
                className={
                  'ledger-number' +
                  (row.remaining < 0 ? ' ledger-negative' : '')
                }
              >
                {formatSigned(props.txCache, row.commodity, row.remaining)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Styles>
  );
};
