export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? 'Player';
  return local.slice(0, 16) || 'Player';
}
