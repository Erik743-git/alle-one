/** IPv4 privado / loopback / link-local (RFC 1918, 5735, 3927). */
export function isPrivateIpv4(value: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value.trim());
  if (!m) return false;
  const o = m.slice(1, 5).map(Number);
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

const IPV4_IN_TEXT =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;

function redactIpsInString(value: string): string {
  return value.replace(IPV4_IN_TEXT, (octet) =>
    isPrivateIpv4(octet) ? '' : octet,
  );
}

/** Cópia JSON sem endereços RFC1918 (dashboard / Zabbix para o browser). */
export function redactPrivateNetworkFields<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, v: unknown) => {
    if (typeof v === 'string') {
      return redactIpsInString(v);
    }
    return v;
  }) as T;
}
