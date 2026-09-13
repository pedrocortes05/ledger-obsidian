const defaultSettings: ISettings = {
  tutorialIndex: 0,

  currencySymbol: '$',
  ledgerFile: 'transactions.ledger',

  assetAccountsPrefix: 'Assets',
  expenseAccountsPrefix: 'Expenses',
  incomeAccountsPrefix: 'Income',
  liabilityAccountsPrefix: 'Liabilities',
};

export interface ISettings {
  tutorialIndex: number;

  /** Default commodity for new transactions, e.g. "$" or "USD". */
  currencySymbol: string;
  ledgerFile: string;

  assetAccountsPrefix: string;
  expenseAccountsPrefix: string;
  incomeAccountsPrefix: string;
  liabilityAccountsPrefix: string;
}

/**
 * settingsWithDefaults fills in missing settings and drops settings that no
 * longer exist (virtual accounts are now detected from their parentheses).
 */
export const settingsWithDefaults = (
  settings: Partial<ISettings> | null | undefined,
): ISettings => {
  const result = { ...defaultSettings };
  if (settings) {
    (Object.keys(defaultSettings) as (keyof ISettings)[]).forEach((key) => {
      const value = settings[key];
      if (value !== undefined && typeof value === typeof defaultSettings[key]) {
        (result as Record<string, unknown>)[key] = value;
      }
    });
  }
  return result;
};
