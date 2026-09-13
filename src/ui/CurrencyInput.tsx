import { countDecimals } from '../amounts';
import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.div`
  display: flex;
  gap: 4px;
  align-items: stretch;

  input {
    flex-grow: 1;
    min-width: 0;
    text-align: right;
  }

  select {
    flex-shrink: 0;
    max-width: 9em;
  }
`;

const OTHER = '__other__';

/**
 * normalizeAmountInput pads a typed amount to the minimum number of decimals
 * without dropping any typed digits. Invalid input is returned unchanged so
 * validation can report it.
 */
export const normalizeAmountInput = (
  text: string,
  minDecimals: number,
): string => {
  const trimmed = text.trim().replace(/,/g, '');
  if (!/^-?\d*\.?\d*$/.test(trimmed) || !/\d/.test(trimmed)) {
    return text.trim();
  }
  const decimals = countDecimals(trimmed);
  if (decimals >= minDecimals) {
    return trimmed;
  }
  const withDot = trimmed.includes('.') ? trimmed : `${trimmed}.`;
  return withDot.padEnd(withDot.length + minDecimals - decimals, '0');
};

export const CurrencyInput: React.FC<{
  amount: string;
  currency: string;
  commodities: string[];
  placeholder?: string;
  minDecimals: (currency: string) => number;
  onAmountChange: (amount: string) => void;
  onCurrencyChange: (currency: string) => void;
  className?: string;
}> = (props): JSX.Element => {
  const options = props.commodities.includes(props.currency)
    ? props.commodities
    : [props.currency, ...props.commodities];
  const [customizing, setCustomizing] = React.useState(false);

  return (
    <Wrapper className={props.className}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={props.placeholder || 'Amount'}
        value={props.amount}
        onChange={(e) => props.onAmountChange(e.target.value)}
        onBlur={() => {
          if (props.amount !== '') {
            props.onAmountChange(
              normalizeAmountInput(
                props.amount,
                props.minDecimals(props.currency),
              ),
            );
          }
        }}
      />
      {customizing ? (
        <input
          type="text"
          autoFocus
          placeholder="e.g. EUR"
          defaultValue=""
          style={{ maxWidth: '6em', textAlign: 'left' }}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && !/[\d;@=]/.test(value)) {
              props.onCurrencyChange(value);
            }
            setCustomizing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      ) : (
        <select
          className="dropdown"
          value={props.currency}
          aria-label="Commodity"
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setCustomizing(true);
            } else {
              props.onCurrencyChange(e.target.value);
            }
          }}
        >
          {options.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol === '' ? '(none)' : symbol}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
      )}
    </Wrapper>
  );
};
