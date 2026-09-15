import { describeFilter, MetadataFilter } from '../metadata';
import { TransactionCache } from '../parser';
import { TextSuggest } from './TextSuggest';
import React from 'react';
import styled from 'styled-components';

const Styles = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;

  button {
    margin: 0;
  }

  .ledger-filter-chip {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 12px;
    padding: 2px 4px 2px 10px;
  }

  .ledger-filter-chip button {
    background: none;
    box-shadow: none;
    color: inherit;
    padding: 0 6px;
  }

  .ledger-filter-value {
    flex: 1 1 120px;
    min-width: 0;
  }

  .ledger-filter-value input {
    width: 100%;
  }
`;

/**
 * MetadataFilterBar filters the dashboard to postings with a tag or metadata
 * value, like `ledger reg %Edition=26`.
 */
export const MetadataFilterBar: React.FC<{
  txCache: TransactionCache;
  filter: MetadataFilter | null;
  setFilter: (filter: MetadataFilter | null) => void;
}> = (props): JSX.Element | null => {
  const [editing, setEditing] = React.useState(false);
  const [key, setKey] = React.useState('');
  const [value, setValue] = React.useState('');

  if (props.txCache.metadataKeys.length === 0 && !props.filter) {
    return null;
  }

  if (props.filter) {
    return (
      <Styles>
        <span className="ledger-filter-chip">
          Filter: {describeFilter(props.filter)}
          <button
            aria-label="Clear filter"
            title="Clear filter"
            onClick={() => props.setFilter(null)}
          >
            ✕
          </button>
        </span>
      </Styles>
    );
  }

  if (!editing) {
    return (
      <Styles>
        <button
          onClick={() => {
            setKey(props.txCache.metadataKeys[0] ?? '');
            setValue('');
            setEditing(true);
          }}
        >
          Filter by tag
        </button>
      </Styles>
    );
  }

  return (
    <Styles>
      <select
        className="dropdown"
        aria-label="Filter key"
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          setValue('');
        }}
      >
        {props.txCache.metadataKeys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <div className="ledger-filter-value">
        <TextSuggest
          value={value}
          onChange={setValue}
          suggestions={props.txCache.metadataValues.get(key) ?? []}
          placeholder="Any value"
        />
      </div>
      <button
        className="mod-cta"
        disabled={!key}
        onClick={() => {
          props.setFilter(
            value.trim() === '' ? { key } : { key, value: value.trim() },
          );
          setEditing(false);
        }}
      >
        Apply
      </button>
      <button onClick={() => setEditing(false)}>Cancel</button>
    </Styles>
  );
};
