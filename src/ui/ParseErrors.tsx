import { Error } from '../error';
import { TransactionCache } from '../parser';
import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.details`
  color: var(--text-error);
  background: var(--background-secondary);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0 0 12px;

  summary {
    cursor: pointer;
  }

  li {
    margin: 8px 0;
    color: var(--text-normal);
  }

  pre {
    background: var(--background-primary-alt);
    padding: 8px;
    overflow-x: auto;
    white-space: pre;
  }
`;

const blockOf = (error: Error): { firstLine: number; block: string } =>
  'transaction' in error ? error.transaction.block : error.block;

export const ParseErrors: React.FC<{
  txCache: TransactionCache;
}> = (props): JSX.Element | null => {
  const errors = props.txCache.parsingErrors;
  if (errors.length === 0) {
    return null;
  }
  return (
    <Wrapper>
      <summary>
        {errors.length === 1
          ? '1 problem in the ledger file'
          : `${errors.length} problems in the ledger file`}{' '}
        — balances may be incomplete
      </summary>
      <ul>
        {errors.slice(0, 100).map((error, i) => {
          const block = blockOf(error);
          return (
            <li key={i}>
              <strong>Line {block.firstLine + 1}:</strong> {error.message}
              <pre>{block.block}</pre>
            </li>
          );
        })}
      </ul>
      {errors.length > 100 ? <p>…and {errors.length - 100} more.</p> : null}
    </Wrapper>
  );
};
