import { getTransactionCache, LedgerModifier } from './file-interface';
import { billIcon } from './graphics';
import { LedgerView, LedgerViewType } from './ledgerview';
import { parse, TransactionCache } from './parser';
import { parsePrefillParams, TransactionPrefill } from './prefill';
import { ISettings, settingsWithDefaults } from './settings';
import { SettingsTab } from './settings-tab';
import type { default as MomentType } from 'moment';
import {
  addIcon,
  debounce,
  MarkdownView,
  Notice,
  ObsidianProtocolData,
  Plugin,
  TAbstractFile,
  TFile,
} from 'obsidian';

declare global {
  interface Window {
    moment: typeof MomentType;
  }
}

export default class LedgerPlugin extends Plugin {
  // Not initialized in the constructor due to how Obsidian plugins are
  // initialized.
  public settings!: ISettings;

  /** Always defined; empty until the ledger file has been parsed. */
  public txCache!: TransactionCache;

  private txCacheSubscriptions: ((txCache: TransactionCache) => void)[] = [];

  private readonly scheduleCacheUpdate = debounce(
    () => this.updateTransactionCache(),
    300,
    true,
  );

  public async onload(): Promise<void> {
    console.log('ledger: Loading plugin v' + this.manifest.version);

    await this.loadSettings();
    this.txCache = parse('', this.settings);
    this.addSettingTab(new SettingsTab(this));

    addIcon('ledger', billIcon);
    this.addRibbonIcon('ledger', 'Add to Ledger', () =>
      this.openAddTransaction(),
    );

    this.registerObsidianProtocolHandler('ledger', this.handleProtocolAction);

    this.registerView(LedgerViewType, (leaf) => new LedgerView(leaf, this));
    this.registerExtensions(['ledger'], LedgerViewType);

    this.registerEvent(
      this.app.vault.on('modify', (file: TAbstractFile) => {
        if (file.path === this.settings.ledgerFile) {
          this.scheduleCacheUpdate();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('create', (file: TAbstractFile) => {
        if (file.path === this.settings.ledgerFile) {
          this.scheduleCacheUpdate();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file: TAbstractFile) => {
        if (file.path === this.settings.ledgerFile) {
          this.scheduleCacheUpdate();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
        if (oldPath === this.settings.ledgerFile && file.path.endsWith('.ledger')) {
          this.settings.ledgerFile = file.path;
          this.saveSettings();
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
        if (
          !(file instanceof TFile) ||
          file.extension !== 'ledger' ||
          leaf?.view.getViewType() === LedgerViewType
        ) {
          return;
        }
        menu.addItem((item) =>
          item
            .setTitle('Open as Ledger dashboard')
            .setIcon('ledger')
            .onClick(() => {
              const target =
                source === 'more-options' && leaf?.view instanceof MarkdownView
                  ? leaf
                  : this.app.workspace.getLeaf(false);
              target.setViewState({
                type: LedgerViewType,
                state: { file: file.path },
              });
            }),
        );
      }),
    );

    this.addCommand({
      id: 'ledger-add-transaction',
      name: 'Add to Ledger',
      icon: 'ledger',
      callback: () => this.openAddTransaction(),
    });

    this.addCommand({
      id: 'ledger-open-dashboard',
      name: 'Open Ledger dashboard',
      icon: 'ledger',
      callback: this.openLedgerDashboard,
    });

    this.addCommand({
      id: 'ledger-intro-tutorial',
      name: 'Reset Ledger Tutorial progress',
      icon: 'ledger',
      callback: () => {
        this.settings.tutorialIndex = 0;
        this.saveData(this.settings);
      },
    });

    this.app.workspace.onLayoutReady(() => {
      this.updateTransactionCache();
    });
  }

  /**
   * registerTxCacheSubscriptions takes a function which will be called any time
   * the transaction cache is updated. The cache will automatically be updated
   * whenever the ledger file is modified.
   */
  public registerTxCacheSubscription = (
    fn: (txCache: TransactionCache) => void,
  ): void => {
    this.txCacheSubscriptions.push(fn);
  };

  /**
   * deregisterTxCacheSubscription removes a function which was added using
   * registerTxCacheSubscription.
   */
  public deregisterTxCacheSubscription = (
    fn: (txCache: TransactionCache) => void,
  ): void => {
    this.txCacheSubscriptions = this.txCacheSubscriptions.filter(
      (subscription) => subscription !== fn,
    );
  };

  public readonly createLedgerFileIfMissing = async (): Promise<TFile> => {
    let ledgerTFile = this.app.vault.getFileByPath(this.settings.ledgerFile);
    if (!ledgerTFile) {
      ledgerTFile = await this.app.vault.create(
        this.settings.ledgerFile,
        this.generateLedgerFileExampleContent(),
      );
      await this.updateTransactionCache();
    }
    return ledgerTFile;
  };

  public async openAddTransaction(prefill?: TransactionPrefill): Promise<void> {
    const ledgerFile = await this.createLedgerFileIfMissing();
    new LedgerModifier(this, ledgerFile).openExpenseModal(
      'new',
      undefined,
      prefill,
    );
  }

  /**
   * saveSettings persists the settings and re-parses the ledger file, since
   * the file path and account prefixes affect the cache.
   */
  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.updateTransactionCache();
  }

  private async loadSettings(): Promise<void> {
    this.settings = settingsWithDefaults(await this.loadData());
  }

  private readonly openLedgerDashboard = async (): Promise<void> => {
    const ledgerTFile = await this.createLedgerFileIfMissing();
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: LedgerViewType,
      state: { file: ledgerTFile.path },
      active: true,
    });
  };

  private readonly generateLedgerFileExampleContent = (): string =>
    `alias a=${this.settings.assetAccountsPrefix}
alias b=${this.settings.assetAccountsPrefix}:Banking
alias c=${this.settings.liabilityAccountsPrefix}:Credit
alias l=${this.settings.liabilityAccountsPrefix}
alias e=${this.settings.expenseAccountsPrefix}
alias i=${this.settings.incomeAccountsPrefix}

; Lines starting with a semicolon are comments and will not be parsed.

; This is an example of what a transaction looks like.
; Every transaction must balance to 0 if you add up all the lines.
; If the last line is left empty, it will automatically balance the transaction.
;
; 2021-12-25 Starbucks Coffee
;     e:Food:Treats     $5.25   ; To this account
;     c:Chase                           ; From this account

; Use this transaction to fill in the balances from your bank accounts.
; This only needs to be done once, and enables you to reconcile your
; Ledger file with your bank account statements.

${window.moment().format('YYYY/MM/DD')} Starting Balances
    ; Add a line for each bank account or credit card
    c:Chase                   $-250.45
    b:BankOfAmerica    $450.27
    Equity:StartingBalance      ; Leave this line alone

; I highly recommend reading through the Ledger documentation about the basics
; of accounting with Ledger
;     https://www.ledger-cli.org/3.0/doc/ledger3.html#Principles-of-Accounting-with-Ledger

; Lots more information about this format can be found on the
; Ledger CLI homepage.
;     https://www.ledger-cli.org

; You can add transactions here easily using the "Add to Ledger"
; Command in Obsidian. You can even make a shortcut to it on your
; mobile phone homescreen. See the README for more information.
`;

  /**
   * updateTransactionCache is called whenever a modification to the ledger file
   * is detected. The file will be reparsed and the txCache on this object will
   * be replaced. Subscriptions will be notified with the new txCache.
   */
  private readonly updateTransactionCache = async (): Promise<void> => {
    try {
      this.txCache = await getTransactionCache(
        this.app.vault,
        this.settings,
        this.settings.ledgerFile,
      );
    } catch (error) {
      console.error('ledger: failed to parse the ledger file', error);
      new Notice('Ledger: failed to read the ledger file. See the console for details.');
      return;
    }

    this.txCacheSubscriptions.forEach((fn) => fn(this.txCache));
  };

  private readonly handleProtocolAction = async (
    params: ObsidianProtocolData,
  ): Promise<void> => {
    await this.openAddTransaction(parsePrefillParams(params));
  };
}
