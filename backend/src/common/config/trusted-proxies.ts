import { isIP } from 'node:net';

/** Trust only explicitly configured proxy addresses, never client headers or hop counts. */
export function configuredTrustedProxies(value: unknown): false | string[] {
  if (value === undefined || value === '') return false;
  if (typeof value !== 'string') throw new Error('TRUSTED_PROXIES must be a comma-separated IP/CIDR allowlist');
  const addresses = value.split(',').map((address) => address.trim());
  for (const address of addresses) {
    const [ip, prefix, extra] = address.split('/');
    const version = isIP(ip);
    if (!version || extra !== undefined || (prefix !== undefined && (
      !/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)
    ))) {
      throw new Error('TRUSTED_PROXIES requires explicit IP addresses or non-universal CIDR ranges');
    }
  }
  return addresses;
}
