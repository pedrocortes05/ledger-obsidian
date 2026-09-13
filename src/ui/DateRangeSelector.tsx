import { DatePreset, datePresets, fromISO, Interval, toISO } from '../date-utils';
import { Moment } from 'moment';
import React from 'react';
import styled from 'styled-components';

const Wrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;

  .ledger-interval-selectors {
    display: flex;
    gap: 4px;
  }

  .ledger-interval-selectors button {
    margin: 0;
  }

  .ledger-daterange-selectors {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  input[type='date'] {
    width: auto;
  }
`;

const intervals: [Interval, string][] = [
  ['day', 'Daily'],
  ['week', 'Weekly'],
  ['month', 'Monthly'],
  ['year', 'Yearly'],
];

export const DateRangeSelector: React.FC<{
  preset: DatePreset;
  setPreset: (preset: DatePreset) => void;
  startDate: Moment;
  endDate: Moment;
  setRange: (start: Moment, end: Moment) => void;
  interval: Interval;
  setInterval: (interval: Interval) => void;
  compact?: boolean;
}> = (props): JSX.Element => (
  <Wrapper>
    <select
      className="dropdown"
      aria-label="Date range"
      value={props.preset}
      onChange={(e) => props.setPreset(e.target.value as DatePreset)}
    >
      {datePresets.map(([preset, label]) => (
        <option key={preset} value={preset}>
          {label}
        </option>
      ))}
      <option value="custom">Custom</option>
    </select>

    {props.preset === 'custom' || !props.compact ? (
      <div className="ledger-daterange-selectors">
        <input
          type="date"
          aria-label="Start date"
          value={toISO(props.startDate)}
          onChange={(e) => {
            const start = fromISO(e.target.value);
            if (!start.isValid()) {
              return;
            }
            props.setRange(
              start,
              start.isAfter(props.endDate) ? start.clone() : props.endDate,
            );
          }}
        />
        <span>→</span>
        <input
          type="date"
          aria-label="End date"
          value={toISO(props.endDate)}
          onChange={(e) => {
            const end = fromISO(e.target.value);
            if (!end.isValid()) {
              return;
            }
            props.setRange(
              end.isBefore(props.startDate) ? end.clone() : props.startDate,
              end,
            );
          }}
        />
      </div>
    ) : null}

    {props.compact ? (
      <select
        className="dropdown"
        aria-label="Interval"
        value={props.interval}
        onChange={(e) => props.setInterval(e.target.value as Interval)}
      >
        {intervals.map(([interval, label]) => (
          <option key={interval} value={interval}>
            {label}
          </option>
        ))}
      </select>
    ) : (
      <div className="ledger-interval-selectors">
        {intervals.map(([interval, label]) => (
          <button
            key={interval}
            className={props.interval === interval ? 'mod-cta' : ''}
            onClick={() => props.setInterval(interval)}
          >
            {label}
          </button>
        ))}
      </div>
    )}
  </Wrapper>
);
