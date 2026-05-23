import { canonicalShoppingItemName, normalizeShoppingItemName } from './normalizeShoppingItemName';
import type { ParsedShoppingItem } from './shoppingImportTypes';

const QUANTITY_WITH_UNIT_RE = /^(\d+(?:[.,]\d+)?)(kg|g|l|ml|pcs?|pieces?|packs?|bags?|packets?|bottles?|boxes?|bunches?|trays?)$/i;
const MULTIPLIER_RE = /^x(\d+(?:[.,]\d+)?)$/i;
const NUMBER_RE = /^\d+(?:[.,]\d+)?$/;

function toNumber(input?: string) {
  if (!input) return undefined;
  const value = Number(input.replace(/,/g, '.'));
  return Number.isFinite(value) ? value : undefined;
}

function stripLinePrefix(line: string) {
  return line
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim();
}

function cleanDisplayName(input?: string) {
  return String(input || '').trim().replace(/\s+/g, ' ');
}

function parseQuantityToken(input?: string) {
  const compact = String(input || '').replace(/\s+/g, '').trim();
  if (!compact) return {};

  const multiplier = compact.match(MULTIPLIER_RE);
  const quantityWithUnit = compact.match(QUANTITY_WITH_UNIT_RE);
  if (multiplier) {
    return { quantity: toNumber(multiplier[1]), quantityText: compact };
  }
  if (quantityWithUnit) {
    return {
      quantity: toNumber(quantityWithUnit[1]),
      quantityText: compact,
      unit: quantityWithUnit[2].toLowerCase(),
    };
  }
  if (NUMBER_RE.test(compact)) {
    return { quantity: toNumber(compact), quantityText: compact };
  }
  return {};
}

function parseCommaLine(rawText: string, index: number): ParsedShoppingItem | null {
  const fields = rawText
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (fields.length < 2) return null;

  const name = cleanDisplayName(fields[0]);
  const normalizedName = normalizeShoppingItemName(name);
  if (!normalizedName) return null;

  const quantityInfo = parseQuantityToken(fields[1]);
  const price = toNumber(fields[2]);

  return {
    id: `${index + 1}-${normalizedName}`,
    rawText,
    lineNumber: index + 1,
    name,
    normalizedName,
    quantity: quantityInfo.quantity,
    quantityText: quantityInfo.quantityText,
    unit: quantityInfo.unit,
    totalPrice: price,
  };
}

function parseLine(rawLine: string, index: number): ParsedShoppingItem | null {
  const rawText = stripLinePrefix(rawLine);
  if (!rawText) return null;
  const commaParsed = parseCommaLine(rawText, index);
  if (commaParsed) return commaParsed;

  const normalizedSeparators = rawText
    .replace(/\s+/g, ' ')
    .replace(/\s*@\s*/g, ' @ ')
    .replace(/\s*=\s*/g, ' = ')
    .trim();
  const tokens = normalizedSeparators.split(' ').filter(Boolean);
  if (!tokens.length) return null;

  let totalPrice: number | undefined;
  let unitPrice: number | undefined;
  const equalsIndex = tokens.indexOf('=');
  if (equalsIndex >= 0) {
    totalPrice = toNumber(tokens[equalsIndex + 1]);
    tokens.splice(equalsIndex);
  }

  const atIndex = tokens.indexOf('@');
  if (atIndex >= 0) {
    unitPrice = toNumber(tokens[atIndex + 1]);
    tokens.splice(atIndex);
  }

  if (totalPrice === undefined && unitPrice === undefined && tokens.length > 1 && NUMBER_RE.test(tokens[tokens.length - 1])) {
    totalPrice = toNumber(tokens.pop());
  }

  let quantity: number | undefined;
  let quantityText: string | undefined;
  let unit: string | undefined;
  const last = tokens[tokens.length - 1] || '';

  const quantityInfo = parseQuantityToken(last);
  if (quantityInfo.quantity !== undefined) {
    quantity = quantityInfo.quantity;
    unit = quantityInfo.unit;
    quantityText = quantityInfo.quantityText;
    tokens.pop();
  }

  const name = cleanDisplayName(tokens.join(' '));
  const normalizedName = normalizeShoppingItemName(name);
  if (!normalizedName) return null;

  return {
    id: `${index + 1}-${normalizedName}`,
    rawText,
    lineNumber: index + 1,
    name,
    normalizedName,
    quantity,
    quantityText,
    unit,
    unitPrice,
    totalPrice,
  };
}

export function parseShoppingText(rawText: string): ParsedShoppingItem[] {
  return String(rawText || '')
    .split(/\r?\n/)
    .map(parseLine)
    .filter((row): row is ParsedShoppingItem => Boolean(row));
}
