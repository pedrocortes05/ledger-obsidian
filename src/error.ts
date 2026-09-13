import { EnhancedTransaction, FileBlock } from './parser';

export type Error = TxError | ParseError;

export interface ParseError {
  message: string;
  error?: unknown;
  block: FileBlock;
}

export interface TxError {
  message: string;
  transaction: EnhancedTransaction;
}
