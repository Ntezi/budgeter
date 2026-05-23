const ITEM_ALIASES: Record<string, string> = {
  avocadoes: 'avocado',
  avocados: 'avocado',
  capsicum: 'bell pepper',
  capsicums: 'bell pepper',
  fusili: 'fusilli',
  inyanya: 'tomatoes',
  lemons: 'lemon',
  tomate: 'tomatoes',
  tomates: 'tomatoes',
  tomato: 'tomatoes',
  tomatoes: 'tomatoes',
  umuceri: 'rice',
  rice: 'rice',
  isukari: 'sugar',
  sucre: 'sugar',
  sugar: 'sugar',
  amata: 'milk',
  lait: 'milk',
  milk: 'milk',
  onions: 'onion',
  prawns: 'prawn',
  radishes: 'radish',
  sausages: 'sausage',
  wings: 'wing',
};

const STOP_WORDS = new Set(['fresh', 'new', 'small', 'large', 'medium', 'pink', 'green', 'red', 'white']);

function singularize(token: string) {
  if (ITEM_ALIASES[token]) return ITEM_ALIASES[token];
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('oes')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function normalizeShoppingItemName(input?: string) {
  const normalized = String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[@=]/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  const tokens = normalized
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token))
    .map(singularize);

  return tokens.join(' ').trim();
}

export function canonicalShoppingItemName(input?: string) {
  return normalizeShoppingItemName(input)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
