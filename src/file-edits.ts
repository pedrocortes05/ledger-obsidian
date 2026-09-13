import { normalizeDate } from './parser';

/**
 * Pure functions that edit the text of a ledger file. They are used inside
 * Vault.process so the read and the write happen atomically.
 */

export class StaleTransactionError extends Error {
  constructor() {
    super(
      'The ledger file changed since it was loaded, so the transaction could not be found. Please try again.',
    );
    this.name = 'StaleTransactionError';
  }
}

export interface BlockLocation {
  firstLine: number;
  lastLine: number;
}

const isBlank = (line: string | undefined): boolean =>
  line === undefined || line.trim() === '';

/**
 * locateBlock returns where the block currently is in the file. The line
 * numbers from the last parse are tried first; if the file changed, the block
 * text is searched for and must appear exactly once.
 */
export const locateBlock = (
  lines: string[],
  block: { block: string; firstLine: number; lastLine: number },
): BlockLocation => {
  const blockLines = block.block.split('\n');
  const matchesAt = (start: number): boolean =>
    blockLines.every((line, i) => lines[start + i] === line);

  if (block.firstLine >= 0 && matchesAt(block.firstLine)) {
    return {
      firstLine: block.firstLine,
      lastLine: block.firstLine + blockLines.length - 1,
    };
  }

  const matches: number[] = [];
  for (let i = 0; i + blockLines.length <= lines.length; i++) {
    if (matchesAt(i)) {
      matches.push(i);
    }
  }
  if (matches.length !== 1) {
    throw new StaleTransactionError();
  }
  return {
    firstLine: matches[0],
    lastLine: matches[0] + blockLines.length - 1,
  };
};

const splitLines = (contents: string): { lines: string[]; eol: string } => ({
  lines: contents.split(/\r?\n/),
  eol: contents.includes('\r\n') ? '\r\n' : '\n',
});

/**
 * replaceBlock swaps the transaction block for new text.
 */
export const replaceBlock = (
  contents: string,
  block: { block: string; firstLine: number; lastLine: number },
  newText: string,
): string => {
  const { lines, eol } = splitLines(contents);
  const location = locateBlock(lines, block);
  lines.splice(
    location.firstLine,
    location.lastLine - location.firstLine + 1,
    ...newText.split('\n'),
  );
  return lines.join(eol);
};

/**
 * deleteBlock removes the transaction block and one of the blank lines around
 * it so no double blank lines are left behind.
 */
export const deleteBlock = (
  contents: string,
  block: { block: string; firstLine: number; lastLine: number },
): string => {
  const { lines, eol } = splitLines(contents);
  const { firstLine, lastLine } = locateBlock(lines, block);
  let start = firstLine;
  let count = lastLine - firstLine + 1;
  if (isBlank(lines[lastLine + 1]) && lastLine + 1 < lines.length - 1) {
    count++;
  } else if (firstLine > 0 && isBlank(lines[firstLine - 1])) {
    start--;
    count++;
  }
  lines.splice(start, count);
  return lines.join(eol);
};

const headerPattern = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/;

/**
 * insertTransaction adds the transaction after the last transaction (in file
 * order) dated on or before it, separated by blank lines. If every
 * transaction is later, it goes before the first one; if there are none, it
 * is appended.
 */
export const insertTransaction = (
  contents: string,
  txText: string,
  dateISO: string,
): string => {
  const { lines, eol } = splitLines(contents);
  const txLines = txText.split('\n');

  let firstTxLine = -1;
  let insertAfter = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = headerPattern.exec(lines[i]);
    if (!match) {
      continue;
    }
    let end = i;
    while (
      end + 1 < lines.length &&
      /^[ \t]/.test(lines[end + 1]) &&
      !isBlank(lines[end + 1])
    ) {
      end++;
    }
    if (firstTxLine === -1) {
      firstTxLine = i;
    }
    const date = normalizeDate(match[1]);
    if (date && date <= dateISO) {
      insertAfter = end;
    }
    i = end;
  }

  if (insertAfter === -1 && firstTxLine === -1) {
    // No transactions: append at the end of the file.
    while (lines.length > 0 && isBlank(lines[lines.length - 1])) {
      lines.pop();
    }
    const prefix = lines.length > 0 ? [...lines, ''] : [];
    return [...prefix, ...txLines, ''].join(eol);
  }

  if (insertAfter === -1) {
    // Every transaction is later: insert before the first one.
    const before = lines.slice(0, firstTxLine);
    const after = lines.slice(firstTxLine);
    const separator =
      before.length > 0 && !isBlank(before[before.length - 1]) ? [''] : [];
    return [...before, ...separator, ...txLines, '', ...after].join(eol);
  }

  const before = lines.slice(0, insertAfter + 1);
  const after = lines.slice(insertAfter + 1);
  const trailing = after.length > 0 && !isBlank(after[0]) ? [''] : [];
  const endsFile = after.every(isBlank);
  return [
    ...before,
    '',
    ...txLines,
    ...(endsFile ? [''] : trailing),
    ...(endsFile ? [] : after),
  ].join(eol);
};
