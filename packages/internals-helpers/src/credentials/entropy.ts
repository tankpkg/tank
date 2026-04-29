/**
 * Shannon entropy in bits/char. Used to reject low-entropy
 * regex matches (e.g. `sk_live_aaaaaaaaaaaaaaaa`) that pass
 * the pattern but are obviously not real credentials (C25a).
 */
export function shannonEntropy(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const char of value) {
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  }

  const length = value.length;
  let entropy = 0;

  for (const count of frequencies.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

export const DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR = 4.0;
