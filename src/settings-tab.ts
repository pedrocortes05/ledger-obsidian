import { buyMeACoffee, paypal } from './graphics';
import LedgerPlugin from './main';
import { ISettings } from './settings';
import { debounce, normalizePath, PluginSettingTab, Setting } from 'obsidian';

type StringSetting = {
  [K in keyof ISettings]: ISettings[K] extends string ? K : never;
}[keyof ISettings];

export class SettingsTab extends PluginSettingTab {
  private readonly plugin: LedgerPlugin;
  private readonly save = debounce(() => this.plugin.saveSettings(), 500, true);

  constructor(plugin: LedgerPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Ledger').setHeading();

    new Setting(containerEl)
      .setName('Ledger file')
      .setDesc(
        'Path in the vault to your ledger file. NOTE: If you use Obsidian Sync, you must enable "Sync all other types".',
      )
      .addText((text) => {
        text
          .setValue(this.plugin.settings.ledgerFile)
          .setPlaceholder('transactions.ledger')
          .onChange((value) => {
            const path = normalizePath(value.trim());
            if (path.endsWith('.ledger')) {
              text.inputEl.removeClass('ledger-input-error');
              text.inputEl.setCustomValidity('');
              this.plugin.settings.ledgerFile = path;
              this.save();
            } else {
              text.inputEl.addClass('ledger-input-error');
              text.inputEl.setCustomValidity('File must end with .ledger');
            }
            text.inputEl.reportValidity();
          });
      });

    this.addTextSetting(
      'currencySymbol',
      'Default commodity',
      'Commodity selected for new transactions, e.g. "$", "USD" or "EUR". Other commodities are read from your ledger file.',
      '$',
    );

    new Setting(containerEl).setName('Account prefixes').setHeading();

    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Ledger uses accounts to group expense types. Accounts are grouped into a hierarchy by separating with a colon. For example \'Expenses:Food:Grocery\' and \'Expenses:Food:Restaurants\'. If you use aliases in your ledger file, use the unaliased prefix, e.g. "Assets" instead of "a". Virtual accounts are detected from their parentheses.',
    });

    this.addTextSetting(
      'assetAccountsPrefix',
      'Asset account prefix',
      'Accounts under this prefix count towards net worth.',
      'Assets',
    );
    this.addTextSetting(
      'expenseAccountsPrefix',
      'Expense account prefix',
      'Accounts suggested first for expenses.',
      'Expenses',
    );
    this.addTextSetting(
      'incomeAccountsPrefix',
      'Income account prefix',
      'Accounts suggested first for income.',
      'Income',
    );
    this.addTextSetting(
      'liabilityAccountsPrefix',
      'Liability account prefix',
      'Accounts under this prefix are subtracted from net worth.',
      'Liabilities',
    );

    new Setting(containerEl).setName('Support').setHeading();

    const div = containerEl.createEl('div', {
      cls: 'ledger-donation',
    });
    div.createEl('p', {
      text:
        'This plugin is a fork of Ledger for Obsidian by Tony Grosinger. ' +
        'If it adds value for you, consider supporting the original author:',
    });

    const parser = new DOMParser();
    div.appendChild(
      createDonateButton(
        'https://paypal.me/tgrosinger',
        parser.parseFromString(paypal, 'text/xml').documentElement,
      ),
    );
    div.appendChild(
      createDonateButton(
        'https://www.buymeacoffee.com/tgrosinger',
        parser.parseFromString(buyMeACoffee, 'text/xml').documentElement,
      ),
    );
  }

  private addTextSetting(
    key: StringSetting,
    name: string,
    description: string,
    placeholder: string,
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text
          .setPlaceholder(placeholder)
          .setValue(this.plugin.settings[key])
          .onChange((value) => {
            this.plugin.settings[key] = value.trim() || placeholder;
            this.save();
          });
      });
  }
}

const createDonateButton = (link: string, img: HTMLElement): HTMLElement => {
  const a = document.createElement('a');
  a.setAttribute('href', link);
  a.addClass('ledger-donate-button');
  a.appendChild(img);
  return a;
};
