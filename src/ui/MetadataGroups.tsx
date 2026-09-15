import { tolerance } from '../amounts';
import { makeMetadataGroups, metadataKeysByAccount } from '../balance-utils';
import { MetadataFilter } from '../metadata';
import { TransactionCache } from '../parser';
import { formatSigned } from './Charts';
import { TextSuggest } from './TextSuggest';
import React from 'react';
import styled from 'styled-components';

const Styles = styled.div`
  .ledger-group-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  .ledger-group-account {
    flex: 1 1 240px;
    min-width: 0;
  }

  .ledger-group-account input {
    width: 100%;
  }

  .ledger-group-settled {
    display: flex;
    gap: 4px;
    align-items: center;
    color: var(--text-muted);
    font-size: var(--font-ui-small);
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

  .ledger-number {
    text-align: right;
    white-space: nowrap;
  }

  .ledger-muted {
    color: var(--text-muted);
  }

  tr.ledger-clickable {
    cursor: pointer;
  }

  tr.ledger-clickable:hover {
    background: var(--background-secondary);
  }
`;

/**
 * MetadataGroups shows an account's balance grouped by a metadata key, like
 * `ledger bal Assets:Loans:Causartt:Fees --pivot Edition`: what is still owed
 * per edition.
 */
export const MetadataGroups: React.FC<{
  txCache: TransactionCache;
  startISO: string;
  endISO: string;
  account: string;
  metadataKey: string;
  setGrouping: (account: string, key: string) => void;
  onSelect: (account: string, filter: MetadataFilter) => void;
}> = (props): JSX.Element => {
  const [accountInput, setAccountInput] = React.useState(props.account);
  const [showSettled, setShowSettled] = React.useState(false);
  React.useEffect(() => setAccountInput(props.account), [props.account]);

  const keysByAccount = React.useMemo(
    () => metadataKeysByAccount(props.txCache.transactions),
    [props.txCache],
  );
  const accountSuggestions = React.useMemo(() => {
    const withMetadata = props.txCache.accounts.filter((a) =>
      keysByAccount.has(a),
    );
    return [
      ...withMetadata,
      ...props.txCache.accounts.filter((a) => !keysByAccount.has(a)),
    ];
  }, [props.txCache, keysByAccount]);
  const keyOptions = React.useMemo(() => {
    const used = keysByAccount.get(props.account) ?? new Set<string>();
    return [
      ...props.txCache.metadataKeys.filter((k) => used.has(k)),
      ...props.txCache.metadataKeys.filter((k) => !used.has(k)),
    ];
  }, [props.txCache, keysByAccount, props.account]);

  const rows = React.useMemo(
    () =>
      props.account && props.metadataKey
        ? makeMetadataGroups(
            props.txCache.transactions,
            props.account,
            props.metadataKey,
            props.startISO,
            props.endISO,
          )
        : [],
    [
      props.txCache,
      props.account,
      props.metadataKey,
      props.startISO,
      props.endISO,
    ],
  );
  const isSettled = (commodity: string, balance: number): boolean =>
    Math.abs(balance) <=
    tolerance(props.txCache.commodityMap.get(commodity)?.precision ?? 2);
  const visibleRows = showSettled
    ? rows
    : rows.filter((row) => !isSettled(row.commodity, row.balance));

  const applyAccount = (account: string): void => {
    const trimmed = account.trim();
    if (trimmed !== props.account) {
      const keys = keysByAccount.get(trimmed);
      const key =
        props.metadataKey && (!keys || keys.has(props.metadataKey))
          ? props.metadataKey
          : (props.txCache.metadataKeys.find((k) => keys?.has(k)) ?? '');
      props.setGrouping(trimmed, key);
    }
  };

  const label = (value: string | null): string => {
    if (value === null) {
      return `(no ${props.metadataKey})`;
    }
    return value === '' ? '(tag)' : value;
  };

  return (
    <Styles>
      <div className="ledger-group-controls">
        <div className="ledger-group-account">
          <TextSuggest
            value={accountInput}
            onChange={setAccountInput}
            onSelect={applyAccount}
            suggestions={accountSuggestions}
            placeholder="Account, e.g. Assets:Loans:Causartt:Fees"
          />
        </div>
        <select
          className="dropdown"
          aria-label="Group by"
          value={props.metadataKey}
          onChange={(e) => props.setGrouping(props.account, e.target.value)}
        >
          <option value="">Group by…</option>
          {keyOptions.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <label className="ledger-group-settled">
          <input
            type="checkbox"
            checked={showSettled}
            onChange={(e) => setShowSettled(e.target.checked)}
          />
          Show settled
        </label>
      </div>

      {!props.account || !props.metadataKey ? (
        <p className="ledger-muted">
          Choose an account and a tag or metadata key to see its balance per
          value, e.g. what is still owed per Edition.
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="ledger-muted">
          {rows.length === 0
            ? `No postings to ${props.account} up to ${props.endISO}.`
            : 'Everything is settled.'}
        </p>
      ) : (
        <div className="ledger-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{props.metadataKey}</th>
                <th className="ledger-number">Increases</th>
                <th className="ledger-number">Decreases</th>
                <th className="ledger-number">Balance</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={`${row.value}${row.commodity}`}
                  className="ledger-clickable"
                  title={`Last activity ${row.lastDate}`}
                  onClick={() =>
                    props.onSelect(
                      props.account,
                      row.value === null
                        ? { key: props.metadataKey, missing: true }
                        : { key: props.metadataKey, value: row.value },
                    )
                  }
                >
                  <td className={row.value === null ? 'ledger-muted' : ''}>
                    {label(row.value)}
                  </td>
                  <td className="ledger-number">
                    {formatSigned(props.txCache, row.commodity, row.increases)}
                  </td>
                  <td className="ledger-number">
                    {formatSigned(props.txCache, row.commodity, row.decreases)}
                  </td>
                  <td className="ledger-number">
                    {formatSigned(props.txCache, row.commodity, row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Styles>
  );
};
