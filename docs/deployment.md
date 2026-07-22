# Deployment: production compose + Cloudflare Tunnel

Scriptorium runs behind the same Cloudflare Tunnel used by other apps on this
server: `scriptorium-client` joins the external `shared-edge` Docker network,
and an ingress rule in the existing tunnel config routes a hostname to it.
Nothing binds a public port — the tunnel reaches the container over the
Docker network only.

## One-time setup

1. **Network**: confirm the shared network already exists (it's created once
   for the whole server, not per-app):

       docker network inspect shared-edge || docker network create shared-edge

2. **Clone**: `git clone <repo> && cd scriptorium`.

3. **Tunnel ingress**: add a Public Hostname entry to the existing Cloudflare
   Tunnel (Zero Trust dashboard → Networks → Tunnels → your tunnel → Public
   Hostname), or the equivalent ingress rule if the tunnel config is a local
   `config.yml`:

       - hostname: scriptorium.yourdomain.com
         service: http://scriptorium-client:80

   The service name must match the compose service name exactly, since
   Docker's embedded DNS resolves it on the shared network.

4. **Start**:

       docker compose -f docker-compose.prod.yml up -d --build

## Updating

    git pull
    docker compose -f docker-compose.prod.yml up -d --build

## Data

All persistent state (works, chapters, codex, settings, API keys) lives in
`server/data/`, bind-mounted into the server container. Back it up with a
plain file copy — there's no database:

    tar czf scriptorium-backup-$(date +%F).tar.gz server/data

## Production smoke checklist

- [ ] `https://scriptorium.yourdomain.com` loads the Shelves room over HTTPS
- [ ] `GET /api/health` returns `{"status":"ok", ...}`
- [ ] Create a work, add a chapter, confirm autosave persists after reload
- [ ] Open `/settings`, add a provider API key, confirm an AI-assisted action
      works end-to-end
- [ ] `docker compose -f docker-compose.prod.yml restart` — data in
      `server/data/` survives (it's on the bind mount, not in the container)

## Troubleshooting

- **502 from the tunnel**: `scriptorium-client` isn't on `shared-edge`, or
  the ingress rule's service name doesn't match the compose service name —
  check `docker network inspect shared-edge` lists the container.
- **`/api/*` requests 404 through the tunnel but work on `localhost`**: nginx
  in the client image proxies `/api/` to `scriptorium-server:3001` — confirm
  both containers are on the same (default) compose network in addition to
  `shared-edge`.
- **Data missing after a redeploy**: confirm `./server/data:/app/data` is
  still present in `docker-compose.prod.yml` — a rebuild without the volume
  mount starts with an empty data directory.
