import {
  deleteBlock,
  insertTransaction,
  replaceBlock,
  StaleTransactionError,
} from './file-edits';
import LedgerPlugin from './main';
import { AddExpenseModal, ConfirmModal, Operation } from './modals';
import { EnhancedTransaction, parse, TransactionCache } from './parser';
import { TransactionPrefill } from './prefill';
import type { ISettings } from './settings';
import { removeTag } from './transaction-utils';
import { Notice, TFile, Vault } from 'obsidian';

export class LedgerModifier {
  private readonly plugin: LedgerPlugin;
  private ledgerFile: TFile;

  constructor(plugin: LedgerPlugin, ledgerFile: TFile) {
    this.plugin = plugin;
    this.ledgerFile = ledgerFile;
  }

  public setLedgerFile(ledgerFile: TFile): void {
    this.ledgerFile = ledgerFile;
  }

  public openExpenseModal(
    operation: Operation,
    initialState?: EnhancedTransaction,
    prefill?: TransactionPrefill,
  ): void {
    new AddExpenseModal(
      this.plugin,
      this,
      operation,
      initialState,
      prefill,
    ).open();
  }

  /**
   * updateTransaction replaces the transaction with new text. It fails with a
   * notice if the transaction is no longer where it was when the file was
   * parsed.
   */
  public async updateTransaction(
    oldTx: EnhancedTransaction,
    newTx: string,
  ): Promise<boolean> {
    return this.process((contents) =>
      replaceBlock(contents, oldTx.block, newTx),
    );
  }

  public async deleteTransaction(tx: EnhancedTransaction): Promise<boolean> {
    const confirmed = await new ConfirmModal(
      this.plugin.app,
      'Delete transaction?',
      `${tx.value.date} ${tx.value.payee}`,
      'Delete',
    ).openAndWait();
    if (!confirmed) {
      return false;
    }
    return this.process((contents) => deleteBlock(contents, tx.block));
  }

  /**
   * addTransaction inserts the transaction after the last transaction dated
   * on or before it.
   */
  public async addTransaction(txText: string, dateISO: string): Promise<boolean> {
    return this.process((contents) =>
      insertTransaction(contents, txText, dateISO),
    );
  }

  public async removeTag(tx: EnhancedTransaction, tag: string): Promise<boolean> {
    return this.process((contents) =>
      replaceBlock(contents, tx.block, removeTag(tx.block.block, tag)),
    );
  }

  private async process(fn: (contents: string) => string): Promise<boolean> {
    try {
      await this.plugin.app.vault.process(this.ledgerFile, fn);
      return true;
    } catch (error) {
      if (error instanceof StaleTransactionError) {
        new Notice(error.message);
      } else {
        console.error('ledger: failed to update the ledger file', error);
        new Notice('Ledger: failed to update the ledger file. See the console for details.');
      }
      return false;
    }
  }
}

/**
 * getTransactionCache parses the file at the given vault path. A missing file
 * produces an empty cache.
 */
export const getTransactionCache = async (
  vault: Vault,
  settings: ISettings,
  ledgerFilePath: string,
): Promise<TransactionCache> => {
  const file = vault.getFileByPath(ledgerFilePath);
  if (!file) {
    return parse('', settings);
  }
  const fileContents = await vault.read(file);
  return parse(fileContents, settings);
};
