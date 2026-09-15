import { isAccountOrChild } from '../account-utils';
import { BalanceHistory, PostingPredicate } from '../balance-utils';
import {
  Bucket,
  DatePreset,
  fromISO,
  Interval,
  makeBuckets,
  presetRange,
  suggestInterval,
  toISO,
} from '../date-utils';
import { LedgerModifier } from '../file-interface';
import { matchesMetadata, MetadataFilter } from '../metadata';
import {
  EnhancedTransaction,
  postingMetadata,
  TransactionCache,
} from '../parser';
import { ISettings } from '../settings';
import {
  filterByEndDate,
  filterByPostings,
  filterByStartDate,
  filterByTag,
  filterTransactions,
} from '../transaction-utils';
import { AccountsList } from './AccountsList';
import { BudgetTable } from './BudgetTable';
import { AccountChart, NetWorthChart } from './Charts';
import { DateRangeSelector } from './DateRangeSelector';
import { MetadataFilterBar } from './MetadataFilterBar';
import { MetadataGroups } from './MetadataGroups';
import { ParseErrors } from './ParseErrors';
import { TransactionTable, UNREVIEWED_TAG } from './TransactionList';
import { Step, Steps } from 'intro.js-react';
import { Moment } from 'moment';
import { Platform } from 'obsidian';
import React from 'react';
import styled from 'styled-components';

const Layout = styled.div`
  .ledger-header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .ledger-header h2 {
    margin: 0;
  }

  .ledger-body {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .ledger-sidebar {
    flex: 0 0 22%;
    min-width: 180px;
    max-height: calc(100vh - 160px);
    overflow-y: auto;
  }

  .ledger-main {
    flex: 1 1 auto;
    min-width: 0;
  }

  .ledger-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 12px 0;
  }

  .ledger-tabs button {
    margin: 0;
  }

  .ledger-badge {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 8px;
    padding: 0 6px;
    margin-left: 4px;
    font-size: var(--font-ui-smaller);
  }

  .ledger-selected-accounts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  &.ledger-mobile .ledger-header {
    flex-direction: column;
    align-items: stretch;
  }
`;

type Tab = 'overview' | 'budgets' | 'groups' | 'unreviewed' | 'accounts';

interface DashboardState {
  preset: DatePreset;
  setPreset: (preset: DatePreset) => void;
  startDate: Moment;
  endDate: Moment;
  setRange: (start: Moment, end: Moment) => void;
  interval: Interval;
  setInterval: (interval: Interval) => void;
  selectedAccounts: string[];
  setSelectedAccounts: (accounts: string[]) => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  commodities: string[];
  commodity: string;
  setCommodity: (commodity: string) => void;
  history: BalanceHistory;
  startISO: string;
  endISO: string;
  buckets: Bucket[];
  inRange: EnhancedTransaction[];
  unreviewed: EnhancedTransaction[];
  selectedTransactions: EnhancedTransaction[];
  isFlowAccount: boolean;
  filter: MetadataFilter | null;
  setFilter: (filter: MetadataFilter | null) => void;
  /** Postings matching the filter, or undefined without a filter. */
  include?: PostingPredicate;
  /** Opens an account with a filter; Back clears both. */
  drillDown: (account: string, filter: MetadataFilter) => void;
  back: () => void;
}

/**
 * useDashboardState holds the date range, selection and commodity shared by
 * the desktop and mobile dashboards.
 */
const useDashboardState = (props: {
  settings: ISettings;
  txCache: TransactionCache;
}): DashboardState => {
  const [filter, setFilter] = React.useState<MetadataFilter | null>(null);
  const [filterFromDrillDown, setFilterFromDrillDown] = React.useState(false);
  const { txCache, settings } = props;
  const lastDate = React.useMemo(
    () =>
      txCache.transactions.reduce(
        (max, tx) => (tx.value.dateISO > max ? tx.value.dateISO : max),
        toISO(window.moment()),
      ),
    [txCache],
  );

  const [preset, setPresetState] = React.useState<DatePreset>('last-3-months');
  const initialRange = presetRange(
    'last-3-months',
    txCache.firstDate,
    fromISO(lastDate),
  );
  const [startDate, setStartDate] = React.useState<Moment>(initialRange.start);
  const [endDate, setEndDate] = React.useState<Moment>(initialRange.end);
  const [interval, setInterval] = React.useState<Interval>(
    suggestInterval(initialRange.start, initialRange.end),
  );
  const [selectedAccounts, setSelectedAccounts] = React.useState<string[]>([]);
  const [tab, setTab] = React.useState<Tab>('overview');

  const commodities = React.useMemo(
    () => txCache.commodities.filter((c) => c.count > 0).map((c) => c.symbol),
    [txCache],
  );
  const preferredCommodity = commodities.includes(settings.currencySymbol)
    ? settings.currencySymbol
    : (commodities[0] ?? settings.currencySymbol);
  const [commodity, setCommodity] = React.useState(preferredCommodity);
  React.useEffect(() => {
    if (!commodities.includes(commodity)) {
      setCommodity(preferredCommodity);
    }
  }, [commodities]);

  // Keep preset ranges up to date when the file changes (e.g. "All time").
  React.useEffect(() => {
    if (preset !== 'custom') {
      const range = presetRange(preset, txCache.firstDate, fromISO(lastDate));
      setStartDate(range.start);
      setEndDate(range.end);
    }
  }, [txCache]);

  const setPreset = (newPreset: DatePreset): void => {
    setPresetState(newPreset);
    if (newPreset === 'custom') {
      return;
    }
    const range = presetRange(newPreset, txCache.firstDate, fromISO(lastDate));
    setStartDate(range.start);
    setEndDate(range.end);
    setInterval(suggestInterval(range.start, range.end));
  };

  const setRange = (start: Moment, end: Moment): void => {
    setPresetState('custom');
    setStartDate(start);
    setEndDate(end);
  };

  const include = React.useMemo<PostingPredicate | undefined>(
    () =>
      filter
        ? (tx, posting) => matchesMetadata(postingMetadata(tx, posting), filter)
        : undefined,
    [filter],
  );
  const history = React.useMemo(
    () => new BalanceHistory(txCache.transactions, include),
    [txCache, include],
  );
  const startISO = toISO(startDate);
  const endISO = toISO(endDate);
  const buckets = React.useMemo(
    () => makeBuckets(interval, startDate, endDate),
    [interval, startISO, endISO],
  );
  const matching = React.useMemo(
    () =>
      include
        ? filterTransactions(txCache.transactions, filterByPostings(include))
        : txCache.transactions,
    [txCache, include],
  );
  const inRange = React.useMemo(
    () =>
      filterTransactions(
        filterTransactions(matching, filterByStartDate(startISO)),
        filterByEndDate(endISO),
      ),
    [matching, startISO, endISO],
  );
  const unreviewed = React.useMemo(
    () => filterTransactions(matching, filterByTag(UNREVIEWED_TAG)),
    [matching],
  );
  const selectedTransactions = React.useMemo(
    () =>
      selectedAccounts.length === 0
        ? []
        : filterTransactions(
            inRange,
            // A posting must be to a selected account and match the filter.
            filterByPostings(
              (tx, posting) =>
                selectedAccounts.some(
                  (a) =>
                    isAccountOrChild(posting.account, a) ||
                    isAccountOrChild(posting.dealiasedAccount, a),
                ) &&
                (!include || include(tx, posting)),
            ),
          ),
    [inRange, selectedAccounts, include],
  );
  const isFlowAccount = selectedAccounts.some(
    (a) =>
      isAccountOrChild(a, settings.expenseAccountsPrefix) ||
      isAccountOrChild(a, settings.incomeAccountsPrefix),
  );

  return {
    preset,
    setPreset,
    startDate,
    endDate,
    setRange,
    interval,
    setInterval,
    selectedAccounts,
    setSelectedAccounts,
    tab,
    setTab,
    commodities,
    commodity,
    setCommodity,
    history,
    startISO,
    endISO,
    buckets,
    inRange,
    unreviewed,
    selectedTransactions,
    isFlowAccount,
    filter,
    setFilter: (newFilter) => {
      setFilter(newFilter);
      setFilterFromDrillDown(false);
    },
    include,
    drillDown: (account, newFilter) => {
      setSelectedAccounts([account]);
      setFilter(newFilter);
      setFilterFromDrillDown(true);
    },
    back: () => {
      setSelectedAccounts([]);
      if (filterFromDrillDown) {
        setFilter(null);
        setFilterFromDrillDown(false);
      }
    },
  };
};

interface DashboardProps {
  tutorialIndex: number;
  setTutorialIndex: (index: number) => void;
  /** Remembers the account and key of the "By tag" view. */
  setGrouping?: (account: string, key: string) => void;
  settings: ISettings;
  txCache: TransactionCache;
  updater: LedgerModifier;
}

export const LedgerDashboard: React.FC<DashboardProps> = (
  props,
): JSX.Element => {
  const [tutorialIndex, setTutorialIndex] = React.useState(props.tutorialIndex);
  const state = useDashboardState(props);
  const setTutorialIndexWrapper = (index: number): void => {
    setTutorialIndex(index);
    props.setTutorialIndex(index);
  };

  return Platform.isMobile ? (
    <MobileDashboard {...props} state={state} />
  ) : (
    <DesktopDashboard
      {...props}
      tutorialIndex={tutorialIndex}
      setTutorialIndex={setTutorialIndexWrapper}
      state={state}
    />
  );
};

const Tabs: React.FC<{
  state: DashboardState;
  tabs: [Tab, string][];
}> = ({ state, tabs }): JSX.Element => (
  <div className="ledger-tabs" role="tablist">
    {tabs.map(([tab, label]) => (
      <button
        key={tab}
        role="tab"
        aria-selected={state.tab === tab}
        className={state.tab === tab ? 'mod-cta' : ''}
        onClick={() => {
          state.setTab(tab);
          state.back();
        }}
      >
        {label}
        {tab === 'unreviewed' && state.unreviewed.length > 0 ? (
          <span className="ledger-badge">{state.unreviewed.length}</span>
        ) : null}
      </button>
    ))}
  </div>
);

const SelectedAccounts: React.FC<{
  state: DashboardState;
  props: DashboardProps;
  mobile: boolean;
}> = ({ state, props, mobile }): JSX.Element => (
  <>
    <div className="ledger-selected-accounts">
      <button onClick={state.back}>← Back</button>
    </div>
    <AccountChart
      history={state.history}
      txCache={props.txCache}
      selectedAccounts={state.selectedAccounts}
      buckets={state.buckets}
      interval={state.interval}
      commodity={state.commodity}
      commodities={state.commodities}
      setCommodity={state.setCommodity}
      startISO={state.startISO}
      endISO={state.endISO}
      isFlowAccount={state.isFlowAccount}
      compact={mobile}
    />
    <TransactionTable
      key={state.selectedAccounts.join('|')}
      transactions={state.selectedTransactions}
      txCache={props.txCache}
      updater={props.updater}
      mobile={mobile}
    />
  </>
);

const TabContent: React.FC<{
  state: DashboardState;
  props: DashboardProps;
  mobile: boolean;
}> = ({ state, props, mobile }): JSX.Element => {
  switch (state.tab) {
    case 'budgets':
      return (
        <BudgetTable
          txCache={props.txCache}
          startISO={state.startISO}
          endISO={state.endISO}
          include={state.include}
          onSelectAccount={(account) => state.setSelectedAccounts([account])}
        />
      );
    case 'groups':
      return <GroupsTab state={state} props={props} />;
    case 'unreviewed':
      return (
        <TransactionTable
          transactions={state.unreviewed}
          txCache={props.txCache}
          updater={props.updater}
          mobile={mobile}
          emptyMessage="No transactions are tagged :unreviewed:."
        />
      );
    case 'accounts':
      return (
        <AccountsList
          txCache={props.txCache}
          settings={props.settings}
          history={state.history}
          commodity={state.commodity}
          endISO={state.endISO}
          selectedAccounts={state.selectedAccounts}
          setSelectedAccounts={state.setSelectedAccounts}
        />
      );
    case 'overview':
      return (
        <>
          <NetWorthChart
            history={state.history}
            settings={props.settings}
            txCache={props.txCache}
            buckets={state.buckets}
            interval={state.interval}
            commodity={state.commodity}
            commodities={state.commodities}
            setCommodity={state.setCommodity}
            endISO={state.endISO}
            compact={mobile}
          />
          <h2>Recent transactions</h2>
          <TransactionTable
            transactions={state.inRange}
            txCache={props.txCache}
            updater={props.updater}
            mobile={mobile}
            limit={10}
          />
        </>
      );
  }
};

const GroupsTab: React.FC<{
  state: DashboardState;
  props: DashboardProps;
}> = ({ state, props }): JSX.Element => {
  const [grouping, setGrouping] = React.useState({
    account: props.settings.groupAccount,
    key: props.settings.groupKey,
  });
  return (
    <MetadataGroups
      txCache={props.txCache}
      startISO={state.startISO}
      endISO={state.endISO}
      account={grouping.account}
      metadataKey={grouping.key}
      setGrouping={(account, key) => {
        setGrouping({ account, key });
        props.setGrouping?.(account, key);
      }}
      onSelect={state.drillDown}
    />
  );
};

const DesktopDashboard: React.FC<DashboardProps & { state: DashboardState }> = (
  props,
): JSX.Element => {
  const { state } = props;
  return (
    <Layout>
      <div className="ledger-header">
        <h2>Ledger</h2>
        <DateRangeSelector
          preset={state.preset}
          setPreset={state.setPreset}
          startDate={state.startDate}
          endDate={state.endDate}
          setRange={state.setRange}
          interval={state.interval}
          setInterval={state.setInterval}
        />
        {props.tutorialIndex !== -1 ? (
          <Tutorial
            tutorialIndex={props.tutorialIndex}
            setTutorialIndex={props.setTutorialIndex}
          />
        ) : null}
      </div>

      <ParseErrors txCache={props.txCache} />

      <MetadataFilterBar
        txCache={props.txCache}
        filter={state.filter}
        setFilter={state.setFilter}
      />

      <div className="ledger-body">
        <div className="ledger-sidebar">
          <AccountsList
            txCache={props.txCache}
            settings={props.settings}
            history={state.history}
            commodity={state.commodity}
            endISO={state.endISO}
            selectedAccounts={state.selectedAccounts}
            setSelectedAccounts={state.setSelectedAccounts}
          />
        </div>
        <div className="ledger-main">
          {state.selectedAccounts.length > 0 ? (
            <SelectedAccounts state={state} props={props} mobile={false} />
          ) : (
            <>
              <Tabs
                state={state}
                tabs={[
                  ['overview', 'Overview'],
                  ['budgets', 'Budgets'],
                  ['groups', 'By tag'],
                  ['unreviewed', 'Unreviewed'],
                ]}
              />
              <TabContent state={state} props={props} mobile={false} />
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

const MobileDashboard: React.FC<DashboardProps & { state: DashboardState }> = (
  props,
): JSX.Element => {
  const { state } = props;
  return (
    <Layout className="ledger-mobile">
      <div className="ledger-header">
        <DateRangeSelector
          compact
          preset={state.preset}
          setPreset={state.setPreset}
          startDate={state.startDate}
          endDate={state.endDate}
          setRange={state.setRange}
          interval={state.interval}
          setInterval={state.setInterval}
        />
        <button
          className="mod-cta"
          onClick={() => props.updater.openExpenseModal('new')}
        >
          Add transaction
        </button>
      </div>

      <ParseErrors txCache={props.txCache} />

      <MetadataFilterBar
        txCache={props.txCache}
        filter={state.filter}
        setFilter={state.setFilter}
      />

      {state.selectedAccounts.length > 0 ? (
        <SelectedAccounts state={state} props={props} mobile />
      ) : (
        <>
          <Tabs
            state={state}
            tabs={[
              ['overview', 'Overview'],
              ['accounts', 'Accounts'],
              ['budgets', 'Budgets'],
              ['groups', 'By tag'],
              ['unreviewed', 'Unreviewed'],
            ]}
          />
          <TabContent state={state} props={props} mobile />
        </>
      )}
    </Layout>
  );
};

const Tutorial: React.FC<{
  tutorialIndex: number;
  setTutorialIndex: (index: number) => void;
}> = (props): JSX.Element => {
  const steps: Step[] = [
    {
      intro:
        'Welcome to the Obsidian Ledger plugin. Let me show you around a bit!',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro: 'Click on account names to view their transactions and balance.',
      element: '.ledger-account-list',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro: 'Change the interval over which transactions are rolled up.',
      element: '.ledger-interval-selectors',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro: 'Only transactions within this date range will be displayed.',
      element: '.ledger-daterange-selectors',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro: 'Click here to edit your Ledger file as raw text.',
      element: '.view-action[aria-label="Switch to Markdown View"]',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
    {
      intro:
        'There are more helpful tips in your Ledger file. Go take a look at it in raw text mode.',
      tooltipClass: 'ledger-tutorial-tooltip',
    },
  ];

  const onExit = (index: number): void => {
    props.setTutorialIndex(index + 1 >= steps.length || index < 0 ? -1 : index);
  };

  return (
    <Steps
      enabled={true}
      steps={steps}
      onExit={onExit}
      onComplete={() => props.setTutorialIndex(-1)}
      initialStep={Math.min(props.tutorialIndex, steps.length - 1)}
    />
  );
};
