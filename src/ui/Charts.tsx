import { AmountMap, formatAmount } from '../amounts';
import {
  BalanceHistory,
  commoditiesUsed,
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

  .ledger-summary {
    margin: 4px 0 12px;
  }

  .ledger-summary-value {
    font-size: 1.6em;
    font-weight: var(--font-semibold, 600);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .ledger-summary-label {
    color: var(--text-muted);
    font-size: var(--font-ui-small);
  }

  .ledger-summary-others {
    margin-top: 4px;
    font-size: var(--font-ui-small);
  }

  .ledger-summary-others summary {
    color: var(--text-muted);
    cursor: pointer;
  }

  .ledger-summary-others ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-width: 420px;
  }

  .ledger-summary-others li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    border-bottom: 1px solid var(--background-modifier-border);
    font-variant-numeric: tabular-nums;
  }

  .ledger-summary-others li.ledger-clickable {
    cursor: pointer;
  }

  .ledger-summary-chart-hint {
    color: var(--text-accent);
    font-size: var(--font-ui-smaller);
  }
`;

const formatDate = (dateISO: string): string =>
  window.moment(dateISO, 'YYYY-MM-DD').format('MMM D, YYYY');

/**
 * AmountSummary shows the amount in the selected commodity prominently and
 * lists any other commodities in a collapsed section, instead of one long
 * comma-separated line.
 */
export const AmountSummary: React.FC<{
  label: string;
  amounts: AmountMap;
  commodity: string;
  txCache: TransactionCache;
  detail?: string;
  /** Commodities that can be charted; clicking one selects it. */
  selectable?: string[];
  onSelectCommodity?: (commodity: string) => void;
}> = (props): JSX.Element => {
  const format = (commodity: string): string =>
    formatAmount(
      { commodity, quantity: props.amounts.get(commodity) || 0 },
      props.txCache.commodityMap.get(commodity),
    );
  const others = commoditiesUsed(
    [props.amounts],
    props.txCache.commodities,
  ).filter((commodity) => commodity !== props.commodity);
  return (
    <div className="ledger-summary">
      <div className="ledger-summary-value">{format(props.commodity)}</div>
      <div className="ledger-summary-label">
        {props.label}
        {props.detail ? ` · ${props.detail}` : ''}
      </div>
      {others.length > 0 ? (
        <details className="ledger-summary-others">
          <summary>
            {others.length === 1
              ? '1 other commodity'
              : `${others.length} other commodities`}
          </summary>
          <ul>
            {others.map((commodity) => {
              const selectable =
                !!props.onSelectCommodity &&
                (props.selectable ?? []).includes(commodity);
              return (
                <li
                  key={commodity}
                  className={selectable ? 'ledger-clickable' : ''}
                  title={
                    selectable ? 'Show this commodity in the chart' : undefined
                  }
                  onClick={() =>
                    selectable && props.onSelectCommodity?.(commodity)
                  }
                >
                  <span>{format(commodity)}</span>
                  {selectable ? (
                    <span className="ledger-summary-chart-hint">Chart</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
};

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

const labelOptions = (
  buckets: Bucket[],
  interval: Interval,
  compact?: boolean,
): LabelOptions => {
  const labels = buckets.map((bucket) => formatBucketLabel(bucket, interval));
  // Narrow screens fit about five labels without overlapping.
  const maxLabels = compact ? 5 : 12;
  const every = Math.max(1, Math.ceil(labels.length / maxLabels));
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
  compact?: boolean;
}> = (props): JSX.Element => {
  const { labels, axisX } = labelOptions(
    props.buckets,
    props.interval,
    props.compact,
  );
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
    height: props.compact ? '220px' : '300px',
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
      <AmountSummary
        label={`Assets minus liabilities on ${formatDate(props.endISO)}`}
        amounts={totals}
        commodity={props.commodity}
        txCache={props.txCache}
        selectable={props.commodities}
        onSelectCommodity={props.setCommodity}
      />
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
  compact?: boolean;
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
  const { labels, axisX } = labelOptions(
    props.buckets,
    props.interval,
    props.compact,
  );
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

  const height = props.compact ? '220px' : '300px';
  const lineOptions: ILineChartOptions = {
    height,
    width: '100%',
    showPoint: props.buckets.length <= 60,
    axisX,
  };
  const barOptions: IBarChartOptions = {
    height,
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
        const changeText = formatAmount(
          {
            commodity: props.commodity,
            quantity: change.get(props.commodity) || 0,
          },
          props.txCache.commodityMap.get(props.commodity),
        );
        return (
          <AmountSummary
            key={account}
            label={`${account} on ${formatDate(props.endISO)}`}
            detail={`change ${changeText}`}
            amounts={balance}
            commodity={props.commodity}
            txCache={props.txCache}
            selectable={props.commodities}
            onSelectCommodity={props.setCommodity}
          />
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
