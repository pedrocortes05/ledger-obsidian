import { getTransactionCache, LedgerModifier } from './file-interface';
import type LedgerPlugin from './main';
import { TransactionCache } from './parser';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { LedgerDashboard } from './ui/LedgerDashboard';
import {
  debounce,
  FileView,
  TAbstractFile,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';
import React from 'react';
import ReactDOM from 'react-dom';

export const LedgerViewType = 'ledger';

/**
 * LedgerView shows the dashboard for a .ledger file. It is a FileView (not a
 * TextFileView) because it never writes the file contents back itself.
 */
export class LedgerView extends FileView {
  private readonly plugin: LedgerPlugin;
  private txCache: TransactionCache | null = null;
  private updateInterface: LedgerModifier | null = null;

  private readonly reparse = debounce(
    async () => {
      if (!this.file || this.isDefaultFile(this.file)) {
        return;
      }
      this.txCache = await getTransactionCache(
        this.plugin.app.vault,
        this.plugin.settings,
        this.file.path,
      );
      this.redraw();
    },
    300,
    true,
  );

  constructor(leaf: WorkspaceLeaf, plugin: LedgerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.allowNoFile = false;

    this.addAction('pencil', 'Switch to Markdown View', () => {
      if (!this.file) {
        return;
      }
      this.leaf.setViewState({
        type: 'markdown',
        state: { file: this.file.path },
      });
    });
  }

  public canAcceptExtension(extension: string): boolean {
    return extension === 'ledger';
  }

  public getViewType(): string {
    return LedgerViewType;
  }

  public getDisplayText(): string {
    return this.file ? `Ledger: ${this.file.basename}` : 'Ledger';
  }

  public getIcon(): string {
    return 'ledger';
  }

  public async onOpen(): Promise<void> {
    this.plugin.registerTxCacheSubscription(this.handleTxCacheUpdate);
    // Other .ledger files are not watched by the plugin, so watch the open one.
    this.registerEvent(
      this.app.vault.on('modify', (file: TAbstractFile) => {
        if (this.file && file.path === this.file.path) {
          this.reparse();
        }
      }),
    );
    this.redraw();
  }

  public async onClose(): Promise<void> {
    this.plugin.deregisterTxCacheSubscription(this.handleTxCacheUpdate);
    ReactDOM.unmountComponentAtNode(this.contentEl);
  }

  public async onLoadFile(file: TFile): Promise<void> {
    this.updateInterface = new LedgerModifier(
      this.plugin,
      file,
      () => this.txCache ?? this.plugin.txCache,
    );
    try {
      this.txCache = this.isDefaultFile(file)
        ? this.plugin.txCache
        : await getTransactionCache(
            this.plugin.app.vault,
            this.plugin.settings,
            file.path,
          );
    } catch (error) {
      this.showError(error);
      return;
    }
    this.redraw();
  }

  public async onUnloadFile(): Promise<void> {
    this.txCache = null;
    this.updateInterface = null;
    ReactDOM.unmountComponentAtNode(this.contentEl);
  }

  public readonly redraw = (): void => {
    if (!this.txCache || !this.updateInterface) {
      ReactDOM.unmountComponentAtNode(this.contentEl);
      this.contentEl.empty();
      this.contentEl.createSpan({ text: 'Loading...' });
      return;
    }

    try {
      ReactDOM.render(
        React.createElement(
          ErrorBoundary,
          { context: 'dashboard' },
          React.createElement(LedgerDashboard, {
            tutorialIndex: this.plugin.settings.tutorialIndex,
            setTutorialIndex: this.setTutorialIndex,
            setGrouping: this.setGrouping,
            settings: this.plugin.settings,
            txCache: this.txCache,
            updater: this.updateInterface,
          }),
        ),
        this.contentEl,
      );
    } catch (error) {
      this.showError(error);
    }
  };

  private showError(error: unknown): void {
    console.error('ledger: failed to show the dashboard', error);
    ReactDOM.unmountComponentAtNode(this.contentEl);
    this.contentEl.empty();
    const panel = this.contentEl.createDiv({ cls: 'ledger-error-panel' });
    panel.createEl('h3', { text: 'The Ledger dashboard could not be opened' });
    panel.createEl('pre', {
      text:
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
          : String(error),
    });
  }

  private isDefaultFile(file: TFile): boolean {
    return file.path === this.plugin.settings.ledgerFile;
  }

  private readonly setGrouping = (account: string, key: string): void => {
    this.plugin.settings.groupAccount = account;
    this.plugin.settings.groupKey = key;
    // Only a view preference: save without re-parsing the ledger file.
    this.plugin.saveData(this.plugin.settings);
  };

  private readonly setTutorialIndex = (index: number): void => {
    this.plugin.settings.tutorialIndex = index;
    this.plugin.saveData(this.plugin.settings);
  };

  private readonly handleTxCacheUpdate = (txCache: TransactionCache): void => {
    if (this.file && this.isDefaultFile(this.file)) {
      this.txCache = txCache;
      this.redraw();
    }
  };
}
