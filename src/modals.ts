import { LedgerModifier } from './file-interface';
import LedgerPlugin from './main';
import { EnhancedTransaction } from './parser';
import { TransactionPrefill } from './prefill';
import { emptyTransaction } from './transaction-utils';
import { EditTransaction } from './ui/EditTransaction';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { App, Modal, Platform, Setting } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';

export type Operation = 'new' | 'clone' | 'modify';

export class AddExpenseModal extends Modal {
  private readonly plugin: LedgerPlugin;
  private readonly updater: LedgerModifier;
  private readonly operation: Operation;
  private readonly initialState: EnhancedTransaction;
  private readonly prefill?: TransactionPrefill;
  private removeViewportListeners: (() => void) | null = null;

  constructor(
    plugin: LedgerPlugin,
    updater: LedgerModifier,
    operation: Operation,
    initialState?: EnhancedTransaction,
    prefill?: TransactionPrefill,
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.updater = updater;
    this.operation = operation;
    this.initialState = initialState || emptyTransaction;
    this.prefill = prefill;
  }

  public onOpen(): void {
    this.modalEl.addClass('ledger-modal');
    if (Platform.isMobile) {
      this.keepAboveKeyboard();
    }
    ReactDOM.render(
      React.createElement(
        ErrorBoundary,
        { context: 'form' },
        React.createElement(EditTransaction, {
          displayFileWarning:
            !this.plugin.settings.ledgerFile.endsWith('.ledger'),
          settings: this.plugin.settings,
          initialState: this.initialState,
          operation: this.operation,
          prefill: this.prefill,
          updater: this.updater,
          txCache: this.updater.getTxCache(),
          close: () => this.close(),
        }),
      ),
      this.contentEl,
    );
  }

  public onClose(): void {
    this.removeViewportListeners?.();
    this.removeViewportListeners = null;
    ReactDOM.unmountComponentAtNode(this.contentEl);
    this.contentEl.empty();
  }

  /**
   * keepAboveKeyboard pins the modal to the top of the screen, limits its
   * height to the area not covered by the on-screen keyboard and scrolls the
   * focused field into view.
   */
  private keepAboveKeyboard(): void {
    this.containerEl.addClass('ledger-modal-container');
    const viewport = window.visualViewport;
    const scrollFocused = (): void => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && this.modalEl.contains(active)) {
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    const update = (): void => {
      const height = viewport ? viewport.height : window.innerHeight;
      this.modalEl.style.setProperty(
        '--ledger-viewport-height',
        `${Math.max(240, Math.floor(height) - 24)}px`,
      );
      scrollFocused();
    };
    // The keyboard animates in after focus, so scroll again once it is up.
    const onFocus = (): void => {
      window.setTimeout(scrollFocused, 350);
    };
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    this.modalEl.addEventListener('focusin', onFocus);
    this.removeViewportListeners = () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      this.modalEl.removeEventListener('focusin', onFocus);
    };
  }
}

/**
 * ConfirmModal asks a yes/no question and resolves with the answer.
 */
export class ConfirmModal extends Modal {
  private confirmed = false;
  private resolveAnswer: ((confirmed: boolean) => void) | null = null;

  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmText: string,
  ) {
    super(app);
  }

  public openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolveAnswer = resolve;
      this.open();
    });
  }

  public onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.createEl('p', { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText('Cancel').onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText(this.confirmText)
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  public onClose(): void {
    this.contentEl.empty();
    this.resolveAnswer?.(this.confirmed);
  }
}
