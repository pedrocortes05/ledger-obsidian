import { countDecimals } from '../amounts';
import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.div`
  display: flex;
  gap: 4px;
  align-items: stretch;

  input {
    flex: 1 1 auto;
    min-width: 4em;
    text-align: right;
  }

  select {
    flex: 0 0 auto;
    width: 6.5em;
    text-overflow: ellipsis;
  }

  .ledger-sign-toggle {
    flex: 0 0 auto;
    margin: 0;
    padding: 0 10px;
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

/**
 * toggleSign flips the sign of a typed amount. Mobile number keypads often
 * have no minus key.
 */
export const toggleSign = (text: string): string => {
  const trimmed = text.trim();
  return trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`;
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
      <button
        type="button"
        className="ledger-sign-toggle"
        aria-label="Toggle negative"
        title="Toggle negative"
        // Keep the focus (and the keyboard) on the amount field.
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => props.onAmountChange(toggleSign(props.amount))}
      >
        ±
      </button>
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
