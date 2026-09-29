import { BalanceHistory, makeSubAccountRows } from '../balance-utils';
import { TransactionCache } from '../parser';
import { formatDate, formatSigned } from './Charts';
import React from 'react';
import styled from 'styled-components';

const Styles = styled.details`
  margin-bottom: 1rem;

  summary {
    cursor: pointer;
    font-weight: var(--font-semibold);
    padding: 0.4rem 0;
  }

  .ledger-summary-count {
    color: var(--text-muted);
    font-weight: normal;
  }

  .ledger-table-wrapper {
    overflow-x: auto;
  }

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

  .ledger-muted {
    color: var(--text-muted);
  }

  tfoot td {
    font-weight: var(--font-semibold);
    background: var(--background-primary-alt);
  }

  tr.ledger-clickable {
    cursor: pointer;
  }

  tr.ledger-clickable:hover {
    background: var(--background-secondary);
  }
`;

// Removes float noise so sums never show as -$0.00.
const round = (value: number): number => Math.round(value * 1e8) / 1e8;

interface Total {
  label: string;
  commodity: string;
  quantity: number;
}

/**
 * SubAccountTable is the balance report of an account's direct sub-accounts,
 * like `ledger bal Assets:Loans --depth 3`: for a loans account, who owes you
 * (positive) and whom you owe (negative).
 */
export const SubAccountTable: React.FC<{
  account: string;
  history: BalanceHistory;
  txCache: TransactionCache;
  endISO: string;
  onSelectAccount: (account: string) => void;
}> = (props): JSX.Element | null => {
  const rows = React.useMemo(
    () =>
      makeSubAccountRows(
        props.history,
        props.account,
        props.endISO,
        props.txCache.commodityMap,
      ),
    [props.history, props.account, props.endISO, props.txCache],
  );

  // A leaf account has nothing to break down.
  if (!rows.some((row) => row.account !== props.account)) {
    return null;
  }

  const totals: Total[] = [];
  [...new Set(rows.map((row) => row.commodity))].forEach((commodity) => {
    const balances = rows
      .filter((row) => row.commodity === commodity)
      .map((row) => row.balance);
    const positive = round(
      balances.filter((b) => b > 0).reduce((a, b) => a + b, 0),
    );
    const negative = round(
      balances.filter((b) => b < 0).reduce((a, b) => a + b, 0),
    );
    if (positive !== 0 && negative !== 0) {
      totals.push({ label: 'Positive', commodity, quantity: positive });
      totals.push({ label: 'Negative', commodity, quantity: negative });
    }
    totals.push({
      label: 'Net',
      commodity,
      quantity: round(positive + negative),
    });
  });

  const accountCount = new Set(
    rows.filter((row) => row.account !== props.account).map((r) => r.account),
  ).size;
  const prefix = props.account + ':';
  const name = (account: string): string =>
    account === props.account ? '' : account.substring(prefix.length);
  const amountCell = (commodity: string, quantity: number): JSX.Element => (
    <td className={'ledger-number' + (quantity < 0 ? ' ledger-negative' : '')}>
      {formatSigned(props.txCache, commodity, quantity)}
    </td>
  );

  return (
    <Styles className="ledger-subaccount-table">
      <summary>
        Balances in {props.account} on {formatDate(props.endISO)}{' '}
        <span className="ledger-summary-count">
          ({accountCount} {accountCount === 1 ? 'account' : 'accounts'})
        </span>
      </summary>
      <div className="ledger-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th className="ledger-number">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const own = row.account === props.account;
              return (
                <tr
                  key={`${row.account} ${row.commodity}`}
                  className={own ? '' : 'ledger-clickable'}
                  onClick={
                    own ? undefined : () => props.onSelectAccount(row.account)
                  }
                >
                  <td className={own ? 'ledger-muted' : ''}>
                    {own
                      ? 'Posted to this account directly'
                      : name(row.account)}
                  </td>
                  {amountCell(row.commodity, row.balance)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {totals.map((total) => (
              <tr key={`${total.label} ${total.commodity}`}>
                <td>{total.label}</td>
                {amountCell(total.commodity, total.quantity)}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </Styles>
  );
};
