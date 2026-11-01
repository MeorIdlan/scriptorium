import net from 'node:net';

// The address to key per-client limits on. Behind Cloudflare, set
// CLIENT_IP_HEADER=cf-connecting-ip: the edge overwrites that header on every
// request, so clients can't spoof it as long as nothing but the tunnel can
// reach the app. The header must hold one address set by a trusted edge; never
// point it at X-Forwarded-For, which clients can prepend to. Unset, it's the
// socket address ('trust proxy' stays off, so X-Forwarded-For is never read).
export function clientIp(req) {
  const header = process.env.CLIENT_IP_HEADER?.trim();
  if (header) {
    const value = req.get(header)?.trim();
    if (value) return value;
  }
  return req.ip;
}

function hextets(v6) {
  const [head, tail = ''] = v6.split('::');
  const part = (s) => (s ? s.split(':') : []);
  const toHex = (groups) =>
    groups.flatMap((g) => {
      if (!g.includes('.')) return [g];
      const [a, b, c, d] = g.split('.').map(Number);
      return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
    });
  const left = toHex(part(head));
  const right = toHex(part(tail));
  const fill = v6.includes('::') ? Array(8 - left.length - right.length).fill('0') : [];
  return [...left, ...fill, ...right].map((h) => parseInt(h, 16));
}

// The bucket a limit counts an address in. IPv4 stays as is. IPv6 collapses to
// its /64, since one subscriber usually holds a whole /64 and could otherwise
// use a fresh address per request. IPv4-mapped IPv6 unwraps to the IPv4.
export function ipBucket(ip) {
  if (!ip) return 'unknown';
  const addr = ip.split('%')[0];
  if (net.isIPv4(addr)) return addr;
  if (!net.isIPv6(addr)) return ip;
  const h = hextets(addr.toLowerCase());
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return [h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255].join('.');
  }
  return `${h.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}
