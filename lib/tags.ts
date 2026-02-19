export function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    const out = input
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    return [...new Set(out)];
  }
  if (typeof input === 'string') return parseTagsInput(input);
  return [];
}

export function parseTagsInput(input: string): string[] {
  const out = input
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(out)];
}

export function tagsToInput(tags?: string[]): string {
  return (tags || []).join(', ');
}

export function tagsLabel(tags?: string[]) {
  if (!tags?.length) return 'No tags';
  return tags.map((tag) => `#${tag}`).join(' ');
}

export function firstTag(tags?: string[]) {
  return tags?.[0] || '';
}
