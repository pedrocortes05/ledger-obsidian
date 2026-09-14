import { LedgerModifier } from '../src/file-interface';
import LedgerPlugin from '../src/main';
import { AddExpenseModal } from '../src/modals';
import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import { toggleSign } from '../src/ui/CurrencyInput';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { Notice, Platform, TFile } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

const settings = settingsWithDefaults({ tutorialIndex: -1 });
const txCache = parse(
  '2026/09/01 Spotify\n    Expenses:Spotify    $129.00\n    Assets:Checking',
  settings,
);

afterEach(() => {
  Platform.isMobile = false;
  document.body.innerHTML = '';
});

test('toggleSign()', () => {
  expect(toggleSign('')).toEqual('-');
  expect(toggleSign('34.73')).toEqual('-34.73');
  expect(toggleSign(' -34.73')).toEqual('34.73');
});

describe('AddExpenseModal on mobile', () => {
  const open = (): AddExpenseModal => {
    const plugin = { app: {}, settings, txCache } as unknown as LedgerPlugin;
    const modal = new AddExpenseModal(
      plugin,
      new LedgerModifier(plugin, {} as TFile),
      'new',
    );
    document.body.append(modal.containerEl, modal.modalEl);
    modal.modalEl.appendChild(modal.contentEl);
    act(() => modal.open());
    return modal;
  };

  test('is pinned to the top and sized to the visible viewport', () => {
    Platform.isMobile = true;
    const modal = open();
    expect(modal.containerEl.classList).toContain('ledger-modal-container');
    expect(
      modal.modalEl.style.getPropertyValue('--ledger-viewport-height'),
    ).toMatch(/^\d+px$/);
    act(() => modal.close());
  });

  test('the ± button makes the amount negative', () => {
    Platform.isMobile = true;
    const modal = open();
    const total = modal.contentEl.querySelector(
      'input[placeholder="Total amount"]',
    ) as HTMLInputElement;
    const toggle = modal.contentEl.querySelector(
      'button[aria-label="Toggle negative"]',
    ) as HTMLButtonElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(total, '12.50');
      total.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(total.value).toEqual('-12.50');
    act(() => modal.close());
  });

  test('desktop keeps the default placement', () => {
    const modal = open();
    expect(modal.containerEl.classList).not.toContain('ledger-modal-container');
    act(() => modal.close());
  });
});

test('ErrorBoundary shows the error instead of an empty view', () => {
  const Broken = (): JSX.Element => {
    throw new Error('boom');
  };
  const container = document.createElement('div');
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  act(() => {
    ReactDOM.render(
      <ErrorBoundary context="dashboard">
        <Broken />
      </ErrorBoundary>,
      container,
    );
  });
  expect(container.textContent).toContain(
    'The Ledger dashboard ran into a problem',
  );
  expect(container.textContent).toContain('Error: boom');
});

test('the plugin still loads its commands when another plugin owns the view', async () => {
  const commands: string[] = [];
  const plugin = new (LedgerPlugin as unknown as new () => LedgerPlugin)();
  Object.assign(plugin, {
    app: {
      vault: { on: jest.fn(), getFileByPath: jest.fn() },
      workspace: { on: jest.fn(), onLayoutReady: jest.fn() },
    },
    manifest: { version: 'test' },
    loadData: async () => ({}),
    saveData: async () => undefined,
    addSettingTab: jest.fn(),
    addRibbonIcon: jest.fn(),
    registerObsidianProtocolHandler: jest.fn(),
    registerEvent: jest.fn(),
    addCommand: (command: { id: string }) => commands.push(command.id),
    registerView: () => {
      throw new Error('Attempting to register an existing view type "ledger"');
    },
    registerExtensions: jest.fn(),
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const notices = Notice as unknown as { messages: string[] };
  notices.messages = [];

  await plugin.onload();

  expect(commands).toEqual([
    'ledger-add-transaction',
    'ledger-open-dashboard',
    'ledger-intro-tutorial',
  ]);
  expect(notices.messages[0]).toMatch(/Disable the original "Ledger" plugin/);
});
