import { isAccountOrChild } from '../account-utils';
import { formatAmount } from '../amounts';
import { BalanceHistory } from '../balance-utils';
import type { TransactionCache } from '../parser';
import { ISettings } from '../settings';
import { makeAccountTree, Node, sortAccountTree } from '../transaction-utils';
import React from 'react';
import styled from 'styled-components';

const TreeRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding-right: 6px;
  cursor: pointer;

  &.selected {
    background-color: var(--background-secondary);
  }

  &:hover {
    background-color: var(--background-primary-alt);
  }

  .ledger-expander {
    flex: 0 0 15px;
    color: var(--text-muted);
    text-align: center;
  }

  .ledger-account-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px 0;
  }

  .ledger-account-balance {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    font-variant-numeric: tabular-nums;
  }
`;

const Tree: React.FC<{
  data: Node;
  depth: number;
  balanceText: (account: string) => string;
  selectedAccounts: string[];
  toggle: (account: string) => void;
}> = (props): JSX.Element => {
  const [expanded, setExpanded] = React.useState(props.data.expanded || false);
  const subRows = props.data.subRows;
  const hasChildren = subRows !== undefined && subRows.length > 0;
  const id = props.data.id;
  const selected = props.selectedAccounts.includes(id);

  return (
    <>
      <TreeRow
        className={selected ? 'selected' : ''}
        style={{ paddingLeft: `${props.depth}rem` }}
      >
        <span
          className="ledger-expander"
          onClick={() => hasChildren && setExpanded(!expanded)}
        >
          {hasChildren ? (expanded ? '−' : '+') : ''}
        </span>
        <span
          className="ledger-account-name"
          title={id}
          onClick={() => props.toggle(id)}
        >
          {props.data.account}
        </span>
        <span
          className="ledger-account-balance"
          onClick={() => props.toggle(id)}
        >
          {props.balanceText(id)}
        </span>
      </TreeRow>
      {hasChildren && expanded && subRows
        ? subRows.map((child) => (
            <Tree
              key={child.id}
              data={child}
              depth={props.depth + 1}
              balanceText={props.balanceText}
              selectedAccounts={props.selectedAccounts}
              toggle={props.toggle}
            />
          ))
        : null}
    </>
  );
};

const accountGroup = (
  account: string,
  settings: ISettings,
  txCache: TransactionCache,
): string => {
  if (
    isAccountOrChild(account, settings.assetAccountsPrefix) ||
    isAccountOrChild(account, settings.liabilityAccountsPrefix)
  ) {
    return 'balance';
  }
  if (
    isAccountOrChild(account, settings.expenseAccountsPrefix) ||
    isAccountOrChild(account, settings.incomeAccountsPrefix)
  ) {
    return 'flow';
  }
  return txCache.virtualAccounts.some((v) => isAccountOrChild(v, account))
    ? 'virtual'
    : 'other';
};

/**
 * nextSelection toggles an account. Selecting an account of a different kind
 * (balance sheet vs. income/expense vs. budget) starts a new selection so the
 * chart stays meaningful.
 */
export const nextSelection = (
  selected: string[],
  account: string,
  settings: ISettings,
  txCache: TransactionCache,
): string[] => {
  if (selected.includes(account)) {
    return selected.filter((a) => a !== account);
  }
  const group = accountGroup(account, settings, txCache);
  return [
    ...selected.filter((a) => accountGroup(a, settings, txCache) === group),
    account,
  ];
};

export const AccountsList: React.FC<{
  txCache: TransactionCache;
  settings: ISettings;
  history: BalanceHistory;
  commodity: string;
  endISO: string;
  selectedAccounts: string[];
  setSelectedAccounts: (accounts: string[]) => void;
}> = (props): JSX.Element => {
  const data = React.useMemo(() => {
    const nodes: Node[] = [];
    props.txCache.accounts.forEach((account: string) => {
      makeAccountTree(nodes, account);
    });
    sortAccountTree(nodes);
    nodes.forEach((node) => (node.expanded = true));
    return nodes;
  }, [props.txCache]);

  const balanceText = (account: string): string => {
    const quantity = props.history
      .balanceAt(account, props.endISO)
      .get(props.commodity);
    if (quantity === undefined || Math.abs(quantity) < 1e-8) {
      return '';
    }
    return formatAmount(
      { commodity: props.commodity, quantity },
      props.txCache.commodityMap.get(props.commodity),
    );
  };

  return (
    <div className="ledger-account-list">
      {data.map((root) => (
        <Tree
          key={root.id}
          data={root}
          depth={0}
          balanceText={balanceText}
          selectedAccounts={props.selectedAccounts}
          toggle={(account) =>
            props.setSelectedAccounts(
              nextSelection(
                props.selectedAccounts,
                account,
                props.settings,
                props.txCache,
              ),
            )
          }
        />
      ))}
    </div>
  );
};
