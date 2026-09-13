/**
 * Compares the balances computed by the plugin's parser with ledger-cli.
 *
 *   yarn check-ledger path/to/file.ledger
 *
 * Requires the `ledger` executable. The ledger file is only read.
 */
import { parse } from '../src/parser';
import { settingsWithDefaults } from '../src/settings';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import moment from 'moment';

(globalThis as any).window = { moment };

const file = process.argv[2];
if (!file) {
  console.error('Usage: yarn check-ledger <file.ledger>');
  process.exit(2);
}

const key = (account: string, commodity: string): string =>
  `${account}\t${commodity.replace(/^"|"$/g, '')}`;

const expected = new Map<string, number>();
const register = execFileSync(
  'ledger',
  [
    '-f',
    file,
    'register',
    '--format',
    '%(account)\t%(quantity(amount))\t%(commodity(amount))\n',
  ],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);
register
  .split('\n')
  .filter(Boolean)
  .forEach((line) => {
    const [account, quantity, commodity] = line.split('\t');
    const k = key(account, commodity || '');
    expected.set(k, (expected.get(k) || 0) + parseFloat(quantity));
  });

const started = Date.now();
const cache = parse(readFileSync(file, 'utf8'), settingsWithDefaults({}));
const elapsed = Date.now() - started;

const actual = new Map<string, number>();
cache.transactions.forEach((tx) =>
  tx.value.expenselines.forEach((line) => {
    if (!('account' in line)) {
      return;
    }
    line.amounts.forEach((amount) => {
      const k = key(line.dealiasedAccount, amount.commodity);
      actual.set(k, (actual.get(k) || 0) + amount.quantity);
    });
  }),
);

const mismatches: string[] = [];
new Set([...expected.keys(), ...actual.keys()]).forEach((k) => {
  const e = expected.get(k) || 0;
  const a = actual.get(k) || 0;
  if (Math.abs(e - a) > 0.005) {
    mismatches.push(`${k}\tledger=${e.toFixed(4)}\tplugin=${a.toFixed(4)}`);
  }
});

console.log(
  `Parsed ${cache.transactions.length} transactions in ${elapsed} ms, ` +
    `${cache.payees.length} payees, ${cache.accounts.length} accounts, ` +
    `${cache.commodities.length} commodities, ${cache.parsingErrors.length} parse errors`,
);
cache.parsingErrors.forEach((error) => {
  const block = 'block' in error ? error.block : error.transaction.block;
  console.log(`  line ${block.firstLine + 1}: ${error.message}`);
});
if (mismatches.length === 0) {
  console.log(`All ${expected.size} account/commodity balances match ledger-cli.`);
} else {
  console.log(`${mismatches.length} balances differ from ledger-cli:`);
  mismatches.sort().forEach((m) => console.log('  ' + m));
  process.exit(1);
}
