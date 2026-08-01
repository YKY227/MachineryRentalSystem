export function getHttpResourceUrlError(value: string | null | undefined, label: string) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return null;
  } catch {
    // Fall through to the field-specific validation message.
  }

  return `${label} must start with http:// or https://`;
}

export function normalizeHttpResourceUrl(
  value: string | null | undefined,
  label: string
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';

  const error = getHttpResourceUrlError(trimmed, label);
  if (error) throw new Error(error);
  return trimmed;
}

export function toSafeHttpResourceUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return getHttpResourceUrlError(trimmed, 'Resource URL') ? '' : trimmed;
}
