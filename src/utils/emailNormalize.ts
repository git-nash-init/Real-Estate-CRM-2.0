/**
 * Normalizes email inputs to prevent formatting issues.
 * Specifically handles the common scenario where an email is entered with multiple '@' symbols,
 * e.g., 'anil@company@gmail.com' -> 'anil.company@gmail.com'
 */
export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = raw.trim().toLowerCase().replace(/\s+/g, '');
  const atCount = (cleaned.match(/@/g) || []).length;
  if (atCount > 1) {
    const lastAtIndex = cleaned.lastIndexOf('@');
    let localPart = cleaned
      .slice(0, lastAtIndex)
      .replace(/@+/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
    let domainPart = cleaned.slice(lastAtIndex + 1);
    cleaned = `${localPart}@${domainPart}`;
  }
  return cleaned;
}

export function isValidEmail(email: string): boolean {
  if (!email) return false;
  // Standard RFC 5322 compatible regex for single '@' and valid domain
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    email.trim()
  );
}
