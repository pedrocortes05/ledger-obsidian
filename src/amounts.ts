/**
 * Amount parsing and formatting helpers shared by the parser, the formatter
 * and the UI.
 */

export interface Amount {
  commodity: string;
  quantity: number;
}

/**
 * CommodityInfo describes how a commodity is written in the ledger file so new
 * amounts can be formatted the same way.
 */
export interface CommodityInfo {
  symbol: string;
  /** Number of amounts using this commodity. */
  count: number;
  /** Symbol written before the number ($10.00) instead of after (10.00 USD). */
  prefix: boolean;
  /** Space between symbol and number. */
  spaced: boolean;
  /** Largest number of decimals seen. */
  precision: number;
  /** Negative sign written before the symbol (-$10) instead of after ($-10). */
  negativeBeforeSymbol: boolean;
  /** Thousands separators used (1,000.00). */
  thousands: boolean;
  /** Most recent transaction date (YYYY-MM-DD) using this commodity. */
  lastDate: string;
}

/**
 * ParsedAmount is an amount as written in the file, including its formatting.
 */
export interface ParsedAmount extends Amount {
  prefix: boolean;
  spaced: boolean;
  precision: number;
  negativeBeforeSymbol: boolean;
  thousands: boolean;
}

const quotedCommodity = /^"([^"]*)"/;
// Anything that is not whitespace, a digit, or ledger syntax.
const bareCommodity = /^[^\s\d\-+.,;:@={}[\]()"*/!]+/;
const numberPattern = /^\d[\d,]*(?:\.\d*)?|^\.\d+/;

const readCommodity = (s: string): [string, string] | undefined => {
  const quoted = quotedCommodity.exec(s);
  if (quoted) {
    return [quoted[1], s.slice(quoted[0].length)];
  }
  const bare = bareCommodity.exec(s);
  if (bare) {
    return [bare[0], s.slice(bare[0].length)];
  }
  return undefined;
};

const readNumber = (
  s: string,
):
  | { value: number; precision: number; thousands: boolean; rest: string }
  | undefined => {
  const match = numberPattern.exec(s);
  if (!match) {
    return undefined;
  }
  const text = match[0];
  const cleaned = text.replace(/,/g, '');
  const dot = cleaned.indexOf('.');
  return {
    value: parseFloat(cleaned),
    precision: dot === -1 ? 0 : cleaned.length - dot - 1,
    thousands: text.includes(','),
    rest: s.slice(text.length),
  };
};

/**
 * parseAmount reads an amount from the beginning of the provided string. It
 * supports `$10`, `-$10`, `$-10`, `$ 10`, `10 USD`, `-1.5 AAPL`, `USD 10` and
 * quoted commodities such as `30 "Gel Beta Fuel"`. The remainder of the string
 * is returned untrimmed.
 */
export const parseAmount = (
  input: string,
): { amount: ParsedAmount; rest: string } | undefined => {
  let s = input.trimStart();
  let negative = false;
  let negativeBeforeSymbol = true;

  if (s.startsWith('-') || s.startsWith('+')) {
    negative = s.startsWith('-');
    s = s.slice(1).trimStart();
  }

  // Prefix commodity: $10, $ 10, $-10, USD 10
  const prefix = readCommodity(s);
  if (prefix) {
    const [symbol, afterSymbol] = prefix;
    let rest = afterSymbol;
    const spaced = /^\s/.test(rest);
    rest = rest.trimStart();
    if (rest.startsWith('-')) {
      negative = true;
      negativeBeforeSymbol = false;
      rest = rest.slice(1);
    }
    const num = readNumber(rest);
    if (!num) {
      return undefined;
    }
    return {
      amount: {
        commodity: symbol,
        quantity: negative ? -num.value : num.value,
        prefix: true,
        spaced,
        precision: num.precision,
        negativeBeforeSymbol,
        thousands: num.thousands,
      },
      rest: num.rest,
    };
  }

  // Suffix commodity (or none): 10 USD, 10USD, 10
  const num = readNumber(s);
  if (!num) {
    return undefined;
  }
  const spaced = /^[ \t]/.test(num.rest);
  const suffix = readCommodity(num.rest.trimStart());
  const commodity = suffix ? suffix[0] : '';
  const rest = suffix ? suffix[1] : num.rest;
  return {
    amount: {
      commodity,
      quantity: negative ? -num.value : num.value,
      prefix: false,
      spaced: suffix ? spaced : true,
      precision: num.precision,
      negativeBeforeSymbol: true,
      thousands: num.thousands,
    },
    rest,
  };
};

const needsQuotes = (commodity: string): boolean =>
  commodity !== '' && !new RegExp(bareCommodity.source + '$').test(commodity);

/**
 * defaultCommodityInfo guesses a style for a commodity that has not been seen
 * in the ledger file: single-symbol commodities ($, €) go before the amount,
 * codes (USD, AAPL) go after it.
 */
export const defaultCommodityInfo = (symbol: string): CommodityInfo => {
  const isSymbol = symbol.length === 1 && !/[A-Za-z0-9]/.test(symbol);
  return {
    symbol,
    count: 0,
    prefix: isSymbol,
    spaced: !isSymbol,
    precision: 2,
    negativeBeforeSymbol: true,
    thousands: false,
    lastDate: '',
  };
};

/**
 * formatQuantity formats a number with at least `minDecimals` decimals while
 * never dropping significant digits.
 */
export const formatQuantity = (
  quantity: number,
  minDecimals: number,
  thousands = false,
): string => {
  const abs = Math.abs(quantity);
  // Up to 10 decimals avoids float noise (0.1 + 0.2) without truncating
  // crypto or share quantities.
  let text = parseFloat(abs.toFixed(10)).toString();
  if (text.includes('e')) {
    text = abs.toFixed(10).replace(/0+$/, '');
  }
  const [intPart, decPart = ''] = text.split('.');
  const decimals = decPart.padEnd(minDecimals, '0');
  const grouped = thousands
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : intPart;
  return decimals ? `${grouped}.${decimals}` : grouped;
};

/**
 * formatAmount writes an amount using the style observed for its commodity.
 * `minDecimals` defaults to the commodity precision (capped at 2 so that
 * `1 SOL` does not become `1.00000000 SOL`).
 */
export const formatAmount = (
  amount: Amount,
  info?: CommodityInfo,
  minDecimals?: number,
): string => {
  const style = info || defaultCommodityInfo(amount.commodity);
  const decimals =
    minDecimals !== undefined ? minDecimals : Math.min(style.precision, 2);
  const number = formatQuantity(amount.quantity, decimals, style.thousands);
  const negative =
    amount.quantity < 0 && parseFloat(number.replace(/,/g, '')) !== 0;
  const symbol = needsQuotes(amount.commodity)
    ? `"${amount.commodity}"`
    : amount.commodity;

  if (!symbol) {
    return `${negative ? '-' : ''}${number}`;
  }
  const space = style.spaced ? ' ' : '';
  if (style.prefix) {
    return style.negativeBeforeSymbol
      ? `${negative ? '-' : ''}${symbol}${space}${number}`
      : `${symbol}${space}${negative ? '-' : ''}${number}`;
  }
  return `${negative ? '-' : ''}${number}${space}${symbol}`;
};

/**
 * countDecimals returns the number of decimals typed in a numeric string.
 */
export const countDecimals = (text: string): number => {
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
};

/**
 * tolerance returns the difference below which two quantities of a commodity
 * are considered equal, based on the precision used in the file.
 */
export const tolerance = (precision: number): number =>
  0.5 * Math.pow(10, -Math.min(Math.max(precision, 2), 8)) + 1e-9;

/**
 * AmountMap accumulates quantities per commodity.
 */
export type AmountMap = Map<string, number>;

export const addToAmountMap = (
  map: AmountMap,
  commodity: string,
  quantity: number,
): void => {
  map.set(commodity, (map.get(commodity) || 0) + quantity);
};

/**
 * formatAmountMap formats multiple commodities, e.g. "$500.00, 20.00 USD".
 */
export const formatAmountMap = (
  map: AmountMap,
  commodities: Map<string, CommodityInfo>,
): string => {
  const parts = [...map.entries()]
    .filter(([commodity, quantity]) => {
      const info = commodities.get(commodity);
      return Math.abs(quantity) > tolerance(info ? info.precision : 2);
    })
    .map(([commodity, quantity]) =>
      formatAmount({ commodity, quantity }, commodities.get(commodity)),
    );
  return parts.length > 0 ? parts.join(', ') : '0';
};
