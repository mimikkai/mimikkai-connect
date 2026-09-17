/**
 * Obfuscate a secret string for logging — first 4 chars + "...".
 */
export function obfuscate(value: string): string {
  return value.length > 4 ? `${value.slice(0, 4)}...` : "...";
}