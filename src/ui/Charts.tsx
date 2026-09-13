import { formatAmount, formatAmountMap } from '../amounts';
import {
  BalanceHistory,
  makeAccountSeries,
  makeNetWorthSeries,
  netWorthAt,
  removeDuplicateAccounts,
  SeriesMode,
} from '../balance-utils';
import { Bucket, formatBucketLabel, Interval } from '../date-utils';
import { TransactionCache } from '../parser';
import { ISettings } from '../settings';
import { IBarChartOptions, ILineChartOptions } from 'chartist';
import React from 'react';
import ChartistGraph from 'react-chartist';
import styled from 'styled-components';

const ChartStyles = styled.div`
  .ct-label {
    color: var(--text-muted);
  }

  .ledger-chart-header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }

  .ledger-chart-controls {
    display: flex;
    gap: 8px;
  }

  .ct-legend {
    margin: 0;
    padding: 0;
  }

  .ledger-subtitle {
    color: var(--text-muted);
    margin: 0 0 8px;
  }
`;

/**
 * CommoditySelector picks which commodity charts are drawn in. Commodities are
 * never converted into each other.
 */
export const CommoditySelector: React.FC<{
  commodities: string[];
  value: string;
  onChange: (commodity: string) => void;
}> = (props): JSX.Element | null =>
  props.commodities.length > 1 ? (
    <select
      className="dropdown"
      aria-label="Commodity"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.commodities.map((commodity) => (
        <option key={commodity} value={commodity}>
          {commodity === '' ? '(no commodity)' : commodity}
        </option>
      ))}
    </select>
  ) : null;

interface LabelOptions {
  labels: string[];
  axisX: {
    labelInterpolationFnc: (value: string, index: number) => string | null;
  };
}

const labelOptions = (buckets: Bucket[], interval: Interval): LabelOptions => {
  const labels = buckets.map((bucket) => formatBucketLabel(bucket, interval));
  const every = Math.max(1, Math.ceil(labels.length / 12));
  return {
    labels,
    axisX: {
      labelInterpolationFnc: (value: string, index: number) =>
        index % every === 0 ? value : null,
    },
  };
};

export const NetWorthChart: React.FC<{
  history: BalanceHistory;
  settings: ISettings;
  txCache: TransactionCache;
  buckets: Bucket[];
  interval: Interval;
  commodity: string;
  commodities: string[];
  setCommodity: (commodity: string) => void;
  endISO: string;
  height?: string;
}> = (props): JSX.Element => {
  const { labels, axisX } = labelOptions(props.buckets, props.interval);
  const series = React.useMemo(
    () => [
      makeNetWorthSeries(
        props.history,
        props.settings,
        props.buckets,
        props.commodity,
      ),
    ],
    [props.history, props.settings, props.buckets, props.commodity],
  );
  const totals = netWorthAt(props.history, props.settings, props.endISO);
  const options: ILineChartOptions = {
    height: props.height ?? '300px',
    width: '100%',
    showArea: true,
    showPoint: props.buckets.length <= 60,
    axisX,
  };

  return (
    <ChartStyles>
      <div className="ledger-chart-header">
        <h2>Net worth</h2>
        <div className="ledger-chart-controls">
          <CommoditySelector
            commodities={props.commodities}
            value={props.commodity}
            onChange={props.setCommodity}
          />
        </div>
      </div>
      <p className="ledger-subtitle">
        Assets minus liabilities on {props.endISO}:{' '}
        {formatAmountMap(totals, props.txCache.commodityMap)}
      </p>
      <ChartistGraph data={{ labels, series }} options={options} type="Line" />
    </ChartStyles>
  );
};

export const AccountChart: React.FC<{
  history: BalanceHistory;
  txCache: TransactionCache;
  selectedAccounts: string[];
  buckets: Bucket[];
  interval: Interval;
  commodity: string;
  commodities: string[];
  setCommodity: (commodity: string) => void;
  endISO: string;
  startISO: string;
  isFlowAccount: boolean;
  height?: string;
}> = (props): JSX.Element => {
  // Expenses and income are more useful as change per period, balance sheet
  // accounts as balances.
  const [mode, setMode] = React.useState<SeriesMode>(
    props.isFlowAccount ? 'change' : 'balance',
  );
  React.useEffect(() => {
    setMode(props.isFlowAccount ? 'change' : 'balance');
  }, [props.isFlowAccount]);

  const accounts = removeDuplicateAccounts(props.selectedAccounts);
  const { labels, axisX } = labelOptions(props.buckets, props.interval);
  const series = React.useMemo(
    () =>
      accounts.map((account) =>
        makeAccountSeries(
          props.history,
          account,
          props.buckets,
          props.commodity,
          mode,
        ),
      ),
    [props.history, accounts.join('|'), props.buckets, props.commodity, mode],
  );

  const lineOptions: ILineChartOptions = {
    height: props.height ?? '300px',
    width: '100%',
    showPoint: props.buckets.length <= 60,
    axisX,
  };
  const barOptions: IBarChartOptions = {
    height: props.height ?? '300px',
    width: '100%',
    axisX,
  };

  return (
    <ChartStyles>
      <div className="ledger-chart-header">
        <div className="ledger-chart-controls">
          <select
            className="dropdown"
            aria-label="Chart type"
            value={mode}
            onChange={(e) => setMode(e.target.value as SeriesMode)}
          >
            <option value="balance">Balance</option>
            <option value="change">Change per period</option>
          </select>
          <CommoditySelector
            commodities={props.commodities}
            value={props.commodity}
            onChange={props.setCommodity}
          />
        </div>
        <ul className="ct-legend">
          {accounts.map((account, i) => (
            <li key={account} className={`ct-series-${i}`}>
              {account}
            </li>
          ))}
        </ul>
      </div>
      {accounts.map((account) => {
        const balance = props.history.balanceAt(account, props.endISO);
        const change = props.history.changeBetween(
          account,
          props.startISO,
          props.endISO,
        );
        return (
          <p key={account} className="ledger-subtitle">
            {account}: balance{' '}
            {formatAmountMap(balance, props.txCache.commodityMap)} · change{' '}
            {formatAmountMap(change, props.txCache.commodityMap)}
          </p>
        );
      })}
      {mode === 'balance' ? (
        <ChartistGraph
          data={{ labels, series }}
          options={lineOptions}
          type="Line"
        />
      ) : (
        <ChartistGraph
          data={{ labels, series }}
          options={barOptions}
          type="Bar"
        />
      )}
    </ChartStyles>
  );
};

export const formatSigned = (
  txCache: TransactionCache,
  commodity: string,
  quantity: number,
): string =>
  formatAmount({ commodity, quantity }, txCache.commodityMap.get(commodity));
