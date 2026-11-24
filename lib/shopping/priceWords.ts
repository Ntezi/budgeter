// BUDG-8 design review D-9: plain words for the catalog price line. The comparison rules stay in
// lib/rules/priceCompare.ts; this only turns their labels into sentences a first-time user reads.

const LABEL_WORDS: Record<string, string> = {
  'No earlier price': '',
  Return: 'Last one was a return',
  'Other currency': 'Other currency, not compared',
  'Different unit': 'Other unit, not compared',
  'Missing quantity or price': 'Quantity or price missing',
};

/** A comparison label or "Last … · up 4.5%" chip text in plain words; '' when there is nothing to add. */
export function plainPriceWords(text: string): string {
  if (text in LABEL_WORDS) return LABEL_WORDS[text];
  return text.replace(/ · up (\d)/, ' · price went up $1').replace(/ · down (\d)/, ' · price went down $1');
}

/** Joins the parts of a price line, dropping empty ones. */
export function priceLine(...parts: string[]): string {
  return parts.filter(Boolean).join(' · ');
}
