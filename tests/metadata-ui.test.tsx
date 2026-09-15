import { LedgerModifier } from '../src/file-interface';
import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import { LedgerDashboard } from '../src/ui/LedgerDashboard';
import { Platform } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

jest.mock('react-chartist', () => () => null);
jest.mock('intro.js-react', () => ({ Steps: () => null }));

const d = (daysAgo: number): string =>
  window.moment().subtract(daysAgo, 'days').format('YYYY/MM/DD');

const txCache = parse(
  `${d(50)} Causartt · 25ª edición
    ; Edition: 25
    Assets:Loans:Causartt:Fees    $10,000.00
    Income:Causartt

${d(20)} Causartt · 26ª edición
    ; Edition: 26
    Assets:Loans:Causartt:Fees    $10,000.00
    Income:Causartt

${d(10)} Pago 25
    Assets:Checking    $10,000.00
    Assets:Loans:Causartt:Fees    -$10,000.00  ; Edition: 25

${d(2)} ABONO SPEI Causartt
    Assets:Checking    $4,000.00
    Assets:Loans:Causartt:Fees    -$1,207.98  ; Edition: 26
    Assets:Loans:Causartt:Servers    -$2,792.02
`,
  settingsWithDefaults({}),
);

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
const button = (text: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.startsWith(text),
  );
const text = (): string => container.textContent ?? '';

describe.each([false, true])(
  'metadata on the dashboard (mobile: %s)',
  (mobile) => {
    test('group by Edition, open one, go back', () => {
      Platform.isMobile = mobile;
      const setGrouping = jest.fn();
      act(() => {
        ReactDOM.render(
          <LedgerDashboard
            tutorialIndex={-1}
            setTutorialIndex={jest.fn()}
            setGrouping={setGrouping}
            settings={settingsWithDefaults({
              groupAccount: 'Assets:Loans:Causartt:Fees',
              groupKey: 'Edition',
            })}
            txCache={txCache}
            updater={{} as LedgerModifier}
          />,
          container,
        );
      });

      click(button('By tag'));
      const rows = (): (string | null)[][] =>
        [...container.querySelectorAll('tbody tr')].map((row) =>
          [...row.querySelectorAll('td')].map((cell) => cell.textContent),
        );
      // Edition 25 is settled and hidden by default.
      expect(rows()).toEqual([['26', '$10,000.00', '$1,207.98', '$8,792.02']]);

      const settled = container.querySelector(
        '.ledger-group-settled input',
      ) as HTMLInputElement;
      click(settled);
      expect(rows().map((r) => r[0])).toEqual(['26', '25']);

      const keySelect = container.querySelector(
        'select[aria-label="Group by"]',
      ) as HTMLSelectElement;
      act(() => {
        keySelect.value = '';
        keySelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(setGrouping).toHaveBeenLastCalledWith(
        'Assets:Loans:Causartt:Fees',
        '',
      );
      act(() => {
        keySelect.value = 'Edition';
        keySelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      click(container.querySelector('tbody tr'));
      expect(text()).toContain('Filter: Edition = 26');
      expect(
        container.querySelector('.ledger-summary-value')?.textContent,
      ).toEqual('$8,792.02');
      expect(text()).toContain('ABONO SPEI Causartt');
      expect(text()).not.toContain('Pago 25');

      click(button('← Back'));
      expect(text()).not.toContain('Filter: Edition');
    });

    test('filter bar', () => {
      Platform.isMobile = mobile;
      act(() => {
        ReactDOM.render(
          <LedgerDashboard
            tutorialIndex={-1}
            setTutorialIndex={jest.fn()}
            settings={settingsWithDefaults({})}
            txCache={txCache}
            updater={{} as LedgerModifier}
          />,
          container,
        );
      });
      click(button('Filter by tag'));
      const value = container.querySelector(
        '.ledger-filter-value input',
      ) as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(value, '25');
        value.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(button('Apply'));
      expect(text()).toContain('Filter: Edition = 25');
      expect(text()).toContain('Pago 25');
      expect(text()).not.toContain('ABONO SPEI');
      click(container.querySelector('button[aria-label="Clear filter"]'));
      expect(text()).toContain('ABONO SPEI');
    });
  },
);
