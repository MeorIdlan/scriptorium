# Deployment: production compose + Cloudflare Tunnel

Scriptorium runs behind the same Cloudflare Tunnel used by other apps on this
server: `scriptorium-client` joins the external `shared-edge` Docker network,
and an ingress rule in the existing tunnel config routes a hostname to it.
Nothing binds a public port — the tunnel reaches the container over the
Docker network only.

`scriptorium-server` also joins the external `shared-mongo` network and stores
its data in a `scriptorium` database on the shared MongoDB there. Prod does
not run its own Mongo container.

## One-time setup

1. **Networks**: confirm both shared networks already exist (they're created
   once for the whole server, not per-app):

       docker network inspect shared-edge || docker network create shared-edge
       docker network inspect shared-mongo

   `shared-mongo` must have a MongoDB container reachable as `mongo` and
   running as replica set `rs0`. The compose file sets
   `MONGODB_URI=mongodb://mongo:27017/scriptorium?replicaSet=rs0&directConnection=true`.
   That value overrides anything in `.env`. The `scriptorium` database is
   created on first write.

2. **Clone**: `git clone <repo> && cd scriptorium`.

3. **Environment**: `cp .env.example .env` and fill it in. The server reads it
   via `env_file`. For production, set:

       MAILGUN_API_KEY=...
       MAILGUN_DOMAIN=...
       MAILGUN_FROM_EMAIL=...
       ADMIN_EMAIL=you@yourdomain.com
       WEBAUTHN_RP_ID=scriptorium.yourdomain.com
       WEBAUTHN_ORIGIN=https://scriptorium.yourdomain.com
       WEBAUTHN_RP_NAME=Scriptorium
       COOKIE_SECURE=true
       SESSION_TTL_DAYS=30

   Passkeys only work if `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` match the public
   hostname exactly.

4. **Tunnel ingress**: add a Public Hostname entry to the existing Cloudflare
   Tunnel (Zero Trust dashboard → Networks → Tunnels → your tunnel → Public
   Hostname), or the equivalent ingress rule if the tunnel config is a local
   `config.yml`:

       - hostname: scriptorium.yourdomain.com
         service: http://scriptorium-client:80

   The service name must match the compose service name exactly, since
   Docker's embedded DNS resolves it on the shared network.

5. **Start**:

       docker compose -f docker-compose.prod.yml up -d --build

## Updating

    git pull
    docker compose -f docker-compose.prod.yml up -d --build

6. **Admin account**: register at `/register` with `ADMIN_EMAIL`. That
   account is flagged as admin and can manage users at `/admin/users`.

## Data

All persistent state (users, passkeys, sessions, works, chapters, codex,
settings, API keys) lives in the `scriptorium` database on the shared MongoDB.
The containers themselves are stateless. Back up with `mongodump` from the
Mongo container:

    docker exec <mongo-container> mongodump --db scriptorium --archive \
      > scriptorium-backup-$(date +%F).archive

Restore with `mongorestore --archive` in the same way:

    docker exec -i <mongo-container> mongorestore --archive \
      < scriptorium-backup-YYYY-MM-DD.archive

## Production smoke checklist

- [ ] `https://scriptorium.yourdomain.com` loads the Shelves room over HTTPS
- [ ] `GET /api/health` returns `{"status":"ok", ...}`
- [ ] Server logs show `Connected to MongoDB`
- [ ] Register, receive the one-time code by email, set up a passkey, and
      log in with it
- [ ] Create a work, add a chapter, confirm autosave persists after reload
- [ ] Open `/settings`, add a provider API key, confirm an AI-assisted action
      works end-to-end
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` — works are
      still there afterwards (they live in Mongo, not in the container)

## Troubleshooting

- **502 from the tunnel**: `scriptorium-client` isn't on `shared-edge`, or
  the ingress rule's service name doesn't match the compose service name —
  check `docker network inspect shared-edge` lists the container.
- **`/api/*` requests 404 through the tunnel but work on `localhost`**: nginx
  in the client image proxies `/api/` to `scriptorium-server:3001` — confirm
  both containers are on the same (default) compose network in addition to
  `shared-edge`.
- **Server exits on start with `Failed to connect to MongoDB`**:
  `scriptorium-server` isn't on `shared-mongo`, the Mongo container isn't
  named/aliased `mongo` there, or it isn't running as replica set `rs0`.
  Check with `docker network inspect shared-mongo`.
- **Data missing after a redeploy**: check the server is pointed at the right
  database (`scriptorium`). An empty shelf usually means a different
  `MONGODB_URI` or a different Mongo instance.
- **Passkey registration or login fails**: `WEBAUTHN_RP_ID` and
  `WEBAUTHN_ORIGIN` in `.env` don't match the public hostname.
- **One-time code emails never arrive**: check the Mailgun values in `.env`
  and the server logs.
