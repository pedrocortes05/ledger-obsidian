import { LedgerModifier } from './file-interface';
import LedgerPlugin from './main';
import { EnhancedTransaction } from './parser';
import { TransactionPrefill } from './prefill';
import { emptyTransaction } from './transaction-utils';
import { EditTransaction } from './ui/EditTransaction';
import { App, Modal, Setting } from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';

export type Operation = 'new' | 'clone' | 'modify';

export class AddExpenseModal extends Modal {
  private readonly plugin: LedgerPlugin;
  private readonly updater: LedgerModifier;
  private readonly operation: Operation;
  private readonly initialState: EnhancedTransaction;
  private readonly prefill?: TransactionPrefill;

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
    ReactDOM.render(
      React.createElement(EditTransaction, {
        displayFileWarning:
          !this.plugin.settings.ledgerFile.endsWith('.ledger'),
        settings: this.plugin.settings,
        initialState: this.initialState,
        operation: this.operation,
        prefill: this.prefill,
        updater: this.updater,
        txCache: this.plugin.txCache,
        close: () => this.close(),
      }),
      this.contentEl,
    );
  }

  public onClose(): void {
    ReactDOM.unmountComponentAtNode(this.contentEl);
    this.contentEl.empty();
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
