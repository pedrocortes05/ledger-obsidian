import { LedgerModifier } from '../src/file-interface';
import LedgerPlugin from '../src/main';
import { AddExpenseModal } from '../src/modals';
import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import { emptyTransaction } from '../src/transaction-utils';
import { EditTransaction } from '../src/ui/EditTransaction';
import { LedgerDashboard } from '../src/ui/LedgerDashboard';
import { Platform, TFile } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

jest.mock('react-chartist', () => () => null);
jest.mock('intro.js-react', () => ({ Steps: () => null }));

const settings = settingsWithDefaults({ tutorialIndex: -1 });
const today = window.moment();
const d = (daysAgo: number): string =>
  today.clone().subtract(daysAgo, 'days').format('YYYY/MM/DD');

const txCache = parse(
  `${d(40)} Opening
    Assets:Checking    $1000.00
    Liabilities:Card    -$200.00
    Equity:Opening

${d(10)} (Budget:Trip) Groceries
    ; :unreviewed:
    Expenses:Food    $50.00
    (Budget:Trip)    -$50.00
    Liabilities:Card

${d(5)} Salary
    Assets:Checking    20.00 USD
    Income:Salary
`,
  settings,
);

const updater = {
  openExpenseModal: jest.fn(),
  deleteTransaction: jest.fn(),
  removeTag: jest.fn(),
  updateTransaction: jest.fn(async () => true),
  addTransaction: jest.fn(async () => true),
} as unknown as LedgerModifier;

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

const click = (element: Element | null | undefined): void => {
  if (!element) {
    throw new Error('element not found');
  }
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const buttonWithText = (text: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(text),
  );

const type = (input: HTMLInputElement, value: string): void => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe.each([false, true])('LedgerDashboard (mobile: %s)', (mobile) => {
  beforeEach(() => {
    Platform.isMobile = mobile;
  });

  test('renders every tab and account selection without crashing', () => {
    act(() => {
      ReactDOM.render(
        <LedgerDashboard
          tutorialIndex={-1}
          setTutorialIndex={jest.fn()}
          settings={settings}
          txCache={txCache}
          updater={updater}
        />,
        container,
      );
    });
    expect(container.textContent).toContain('Net worth');
    expect(container.textContent).toContain('Groceries');

    click(buttonWithText('Budgets'));
    expect(container.textContent).toContain('Budget:Trip');

    click(buttonWithText('Unreviewed'));
    expect(container.textContent).toContain('Groceries');

    // Mark reviewed
    click(container.querySelector('button[aria-label="Mark reviewed"]'));
    expect(updater.removeTag).toHaveBeenCalled();

    if (mobile) {
      click(buttonWithText('Accounts'));
    } else {
      click(buttonWithText('Overview'));
    }
    const account = [
      ...container.querySelectorAll('.ledger-account-name'),
    ].find((el) => el.textContent === 'Checking');
    click(account);
    expect(container.textContent).toContain(
      'Assets:Checking: balance $1000.00, 20.00 USD',
    );

    // Switching to an empty range must not crash (hooks order).
    const preset = container.querySelector(
      'select[aria-label="Date range"]',
    ) as HTMLSelectElement;
    act(() => {
      preset.value = 'this-month';
      preset.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => {
      preset.value = 'all-time';
      preset.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Opening');
  });
});

test('autofill on leaving the payee keeps the typed total', () => {
  Platform.isMobile = false;
  act(() => {
    ReactDOM.render(
      <EditTransaction
        displayFileWarning={false}
        settings={settings}
        initialState={emptyTransaction}
        operation="new"
        updater={updater}
        txCache={txCache}
        close={jest.fn()}
      />,
      container,
    );
  });
  const total = container.querySelector(
    'input[placeholder="Total amount"]',
  ) as HTMLInputElement;
  type(total, '25.00');
  const payee = container.querySelector(
    'input[placeholder^="Payee"]',
  ) as HTMLInputElement;
  type(payee, 'Groceries');
  act(() => {
    payee.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(container.textContent).toContain('Filled in from the');
  expect(total.value).toEqual('25.00');

  click(buttonWithText('Next'));
  const amounts = [
    ...container.querySelectorAll('.ledger-amount input'),
  ] as HTMLInputElement[];
  expect(amounts.map((input) => input.value)).toEqual(['25.00', '-50.00', '']);
});

test('the add modal uses the transactions of the file it writes to', () => {
  const other = parse(
    `${d(3)} Bakery
    Expenses:Bread    $7.00
    Assets:Wallet`,
    settings,
  );
  const plugin = {
    app: {},
    settings,
    txCache,
  } as unknown as LedgerPlugin;
  const modifier = new LedgerModifier(plugin, {} as TFile, () => other);
  const modal = new AddExpenseModal(plugin, modifier, 'new');
  document.body.appendChild(modal.contentEl);
  act(() => {
    modal.open();
  });
  const payee = modal.contentEl.querySelector(
    'input[placeholder^="Payee"]',
  ) as HTMLInputElement;
  act(() => {
    payee.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  const suggestions = [...document.querySelectorAll('.suggestion-item')].map(
    (el) => el.textContent,
  );
  expect(suggestions).toEqual(['Bakery']);
  act(() => {
    modal.close();
  });
  modal.contentEl.remove();
});

test('EditTransaction adds a transaction end to end', async () => {
  Platform.isMobile = false;
  const close = jest.fn();
  act(() => {
    ReactDOM.render(
      <EditTransaction
        displayFileWarning={false}
        settings={settings}
        initialState={emptyTransaction}
        operation="new"
        updater={updater}
        txCache={txCache}
        close={close}
      />,
      container,
    );
  });

  const payee = container.querySelector(
    'input[placeholder^="Payee"]',
  ) as HTMLInputElement;
  type(payee, 'Groceries');
  act(() => {
    payee.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(container.textContent).toContain('Filled in from the');

  click(buttonWithText('Next'));
  expect(container.textContent).toContain('Budget account');

  await act(async () => {
    buttonWithText('Submit')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });
  expect(updater.addTransaction).toHaveBeenCalledWith(
    `${today.format('YYYY/MM/DD')} (Budget:Trip) Groceries
    Expenses:Food    $50.00
    (Budget:Trip)    -$50.00
    Liabilities:Card`,
    today.format('YYYY-MM-DD'),
  );
  expect(close).toHaveBeenCalled();
});
