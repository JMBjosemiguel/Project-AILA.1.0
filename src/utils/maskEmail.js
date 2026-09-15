// "jose@example.com" -> "j***@example.com". Display-only — never sent anywhere.
export function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return email || '';
  const visible = local.slice(0, 1) || '*';
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
