# Ledger for Obsidian (fork)

Personal finance tracking from the comfort of Obsidian. All of your data is
stored in a plain text [Ledger](https://www.ledger-cli.org) file in your vault
and stays compatible with `ledger` and other plain text accounting tools.

This is a fork of [tgrosinger/ledger-obsidian](https://github.com/tgrosinger/ledger-obsidian).

## Features

- **Quick entry** with the `Add to Ledger` command, ribbon icon or an
  `obsidian://ledger` link (works on mobile).
  - Payees and accounts are suggested by how recently you used them.
  - Picking a known payee fills in the accounts, amounts, currency and budget
    lines of its last transaction.
  - Any commodity: `$`, `USD`, `EUR`, shares, crypto or quoted commodities like
    `"Gel Beta Fuel"`. The list comes from your ledger file and new amounts are
    written in the same style.
  - Leave one amount empty to balance the transaction automatically.
  - Budget lines are written as virtual postings, e.g.
    `2024/11/29 (Budget:Boston) Star Market` with `(Budget:Boston)  -34.73 USD`.
  - New transactions are inserted in date order.
- **Dashboard** (desktop and mobile) for any `.ledger` file:
  - Net worth and account charts per commodity (commodities are never added
    together or converted).
  - Date presets: this month, last 3 months, year to date, last 12 months, all
    time, or a custom range.
  - **Budgets** tab summarizing every virtual account.
  - **Unreviewed** tab listing transactions tagged `:unreviewed:` with a
    _Mark reviewed_ action.
  - Edit, copy and delete transactions. Edits keep everything the form does not
    show (prices, lots, assertions, metadata comments) exactly as written.

### Supported Ledger syntax

Accounts with spaces, digits, hyphens and accents; `$10`, `-$10`, `$-10`,
`10 USD`, quoted commodities; `@` and `@@` prices, `{lot}` costs and `[lot dates]`;
balance assertions and assignments (`= $500`); `(virtual)` and `[balanced virtual]`
postings; header status, codes, aux dates and notes; `alias`, `account`,
`commodity`, `payee` and `P` directives. Periodic (`~`) and automated (`=`)
transactions and `comment` blocks are skipped. `include` is not supported.

Missing amounts are inferred like ledger-cli, per commodity, and balance
assertions are verified. Problems are listed at the top of the dashboard.

## Commands

- `Add to Ledger` – open the transaction form.
- `Open Ledger dashboard` – open the dashboard for the ledger file configured in
  the settings. Clicking any `.ledger` file also opens its dashboard.
- `Reset Ledger Tutorial progress` – show the dashboard tutorial again.

## Quick entry links

Create a shortcut (e.g. on your phone home screen) to a link like:

```
obsidian://ledger?payee=Uber&amount=149.92&currency=$&account=Expenses:Transport&from=Assets:Checking
```

| Parameter  | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `type`     | `expense`, `income` or `transfer`                                       |
| `payee`    | Payee. Without `account`/`from`, the last transaction for it is copied. |
| `amount`   | Total amount, e.g. `149.92`                                             |
| `currency` | Commodity, e.g. `$` or `USD`                                            |
| `account`  | Expense account (expense), deposit account (income) or "to" (transfer)  |
| `from`     | Paying account (expense), income account (income) or "from" (transfer)  |
| `date`     | `YYYY-MM-DD`                                                            |
| `comment`  | Memo for the first line                                                 |

All parameters are optional and invalid values are ignored. The form always
opens so you can review before saving.

## Development

```sh
yarn install
yarn dev        # rebuild main.js on change
yarn build      # type check and production build
yarn test
yarn lint
```

`yarn check-ledger path/to/file.ledger` parses a ledger file with the plugin and
compares every account balance, per commodity, with `ledger register`. It
requires the `ledger` executable and never modifies the file.

To try a build, copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/ledger-obsidian-pedro/`.

## More info

- <https://www.ledger-cli.org>
- <https://plaintextaccounting.org>

If this plugin is useful to you, consider supporting the original author:

[![GitHub Sponsors](https://img.shields.io/github/sponsors/tgrosinger?style=social)](https://github.com/sponsors/tgrosinger)
[![Paypal](https://img.shields.io/badge/paypal-tgrosinger-yellow?style=social&logo=paypal)](https://paypal.me/tgrosinger)
