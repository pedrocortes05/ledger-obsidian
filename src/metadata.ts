/**
 * Ledger metadata and tags in comments:
 *
 *   ; :tag1:tag2:          tags (stored with an empty value)
 *   ; Edition: 26          metadata
 *   ; note Edition: 26     metadata after other words, like ledger-cli
 */

export type Metadata = Record<string, string>;

const TAGS_TOKEN = /^:(?:[^\s:]+:)+$/;
const KEY_TOKEN = /^([^\s:]+)::?$/;

/**
 * parseMetadata reads tags and `Key: value` pairs from a comment, following
 * ledger-cli: tokens like `:a:b:` are tags, and the first token ending in a
 * colon starts a key whose value is the rest of the comment.
 */
export const parseMetadata = (comment: string | undefined): Metadata => {
  const result: Metadata = {};
  if (!comment) {
    return result;
  }
  for (const match of comment.matchAll(/\S+/g)) {
    const token = match[0];
    if (TAGS_TOKEN.test(token)) {
      token
        .split(':')
        .filter(Boolean)
        .forEach((tag) => {
          if (result[tag] === undefined) {
            result[tag] = '';
          }
        });
      continue;
    }
    const key = KEY_TOKEN.exec(token);
    if (key) {
      result[key[1]] = comment.slice((match.index ?? 0) + token.length).trim();
      break;
    }
  }
  return result;
};

/**
 * isMetadataOnly is true for a comment that consists only of tags, or starts
 * with a `Key: value` pair, so it can be shown and edited as metadata fields.
 */
export const isMetadataOnly = (comment: string): boolean => {
  const trimmed = comment.trim();
  if (trimmed === '') {
    return false;
  }
  const tokens = trimmed.split(/\s+/);
  if (tokens.every((token) => TAGS_TOKEN.test(token))) {
    return true;
  }
  return KEY_TOKEN.test(tokens[0]);
};

/**
 * stripMetadata removes tags and `Key: value` pairs from a comment, keeping
 * any other text.
 */
export const stripMetadata = (comment: string): string => {
  let result = '';
  for (const [token] of comment.matchAll(/\S+/g)) {
    if (TAGS_TOKEN.test(token)) {
      continue;
    }
    if (KEY_TOKEN.test(token)) {
      break;
    }
    result += (result ? ' ' : '') + token;
  }
  return result;
};

export const isValidMetadataKey = (key: string): boolean =>
  /^[^\s:]+$/.test(key);

/**
 * formatMetadataComment writes one metadata entry as comment text: a tag when
 * the value is empty, `Key: value` otherwise.
 */
export const formatMetadataComment = (key: string, value: string): string =>
  value.trim() === '' ? `:${key}:` : `${key}: ${value.trim()}`;

/**
 * MetadataFilter selects postings by metadata. Without a value it matches any
 * posting that has the key; with `missing` it matches postings without it.
 */
export interface MetadataFilter {
  key: string;
  value?: string;
  missing?: boolean;
}

export const matchesMetadata = (
  metadata: Metadata,
  filter: MetadataFilter,
): boolean => {
  const value = metadata[filter.key];
  if (filter.missing) {
    return value === undefined;
  }
  if (value === undefined) {
    return false;
  }
  return filter.value === undefined || value === filter.value;
};

export const describeFilter = (filter: MetadataFilter): string => {
  if (filter.missing) {
    return `no ${filter.key}`;
  }
  return filter.value === undefined
    ? `has ${filter.key}`
    : `${filter.key} = ${filter.value === '' ? '(tag)' : filter.value}`;
};

const isNumeric = (value: string): boolean => /^-?\d+(\.\d+)?$/.test(value);

/**
 * nextNumericValue suggests the next number for keys like `Edition` whose
 * values are numbers.
 */
export const nextNumericValue = (values: string[]): string | undefined => {
  const numbers = values.filter(isNumeric).map(Number);
  if (numbers.length === 0 || numbers.length < values.length * 0.8) {
    return undefined;
  }
  const max = Math.max(...numbers);
  return Number.isInteger(max) ? String(max + 1) : undefined;
};

/**
 * compareMetadataValues sorts numbers numerically (largest first) and other
 * values alphabetically.
 */
export const compareMetadataValues = (a: string, b: string): number => {
  if (isNumeric(a) && isNumeric(b)) {
    return Number(b) - Number(a);
  }
  return a.localeCompare(b, undefined, { numeric: true });
};
