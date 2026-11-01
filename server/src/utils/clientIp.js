// The address to key per-client limits on. Behind Cloudflare, set
// CLIENT_IP_HEADER=cf-connecting-ip: the edge overwrites that header on every
// request, so clients can't spoof it as long as nothing but the tunnel can
// reach the app. Unset, it's the socket address ('trust proxy' stays off, so
// X-Forwarded-For is never read).
export function clientIp(req) {
  const header = process.env.CLIENT_IP_HEADER?.trim();
  if (header) {
    const value = req.get(header)?.trim();
    if (value) return value;
  }
  return req.ip;
}
