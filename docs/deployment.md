# Deployment: production compose + Cloudflare Tunnel

Scriptorium runs behind the same Cloudflare Tunnel used by other apps on this
server: `scriptorium-client` joins the external `shared-edge` Docker network,
and an ingress rule in the existing tunnel config routes a hostname to it.
Nothing binds a public port — the tunnel reaches the container over the
Docker network only.

`scriptorium-server` also joins the external `shared-mongo` network and stores
its data in a `scriptorium` database on the shared MongoDB there. Prod does
not run its own Mongo container.

Deploys are automated. `.github/workflows/deploy.yml` runs on every push to
`main`. It builds both images in GitHub Actions, pushes them to GHCR
(`ghcr.io/meoridlan/scriptorium-{server,client}`, tagged with the first 12
characters of the commit SHA and `latest`), then SSHes into the droplet and runs
`docker compose pull && up -d` in `/opt/apps/scriptorium`. Nothing is built on
the server. The shared workflow lives in `MeorIdlan/deploy-workflows`; the
droplet-side setup (deploy user, firewall, repo secrets) is described in that
template's README.

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

2. **Environment**: start from `.env.example`. The server reads `.env` via
   `env_file`. CI writes it to `/opt/apps/scriptorium/.env` from the repo's
   `ENV_FILE` secret on each deploy; if that secret is empty, the existing file
   on the server is kept. For production, set:

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

3. **Tunnel ingress**: add a Public Hostname entry to the existing Cloudflare
   Tunnel (Zero Trust dashboard → Networks → Tunnels → your tunnel → Public
   Hostname), or the equivalent ingress rule if the tunnel config is a local
   `config.yml`:

       - hostname: scriptorium.yourdomain.com
         service: http://scriptorium-client:80

   The service name must match the compose service name exactly, since
   Docker's embedded DNS resolves it on the shared network.

4. **First deploy**: push to `main`, or run the Deploy workflow manually from
   the Actions tab.

5. **Admin account**: register at `/register` with `ADMIN_EMAIL`. That
   account is flagged as admin and can manage users at `/admin/users`.

## Updating

Push to `main`. To update env vars, change the `ENV_FILE` secret
(`gh secret set ENV_FILE -R MeorIdlan/scriptorium < prod.env`) and re-run the
Deploy workflow.

To roll back, open Actions → Deploy → Run workflow and set `image-tag` to an
earlier tag. Past tags are listed in `/opt/apps/scriptorium/.deploy-history` on
the droplet.

To run compose by hand on the droplet:

    cd /opt/apps/scriptorium
    docker compose -f compose.prod.yml ps        # or logs, restart, ...

## Data

All persistent state (users, passkeys, sessions, works, chapters, codex,
settings, API keys) lives in the `scriptorium` database on the shared MongoDB.
The containers themselves are stateless.

### Nightly dump

| | |
|---|---|
| Schedule | daily at 03:30 UTC, from `/etc/cron.d/scriptorium-backup` (runs as root) |
| What | `mongodump --db scriptorium --archive --gzip` inside the shared Mongo container `mongo-mongo-1`. Other databases on that Mongo are not included |
| Where | `/var/backups/scriptorium/scriptorium-<YYYYMMDDTHHMMSSZ>.archive.gz` on the droplet (folder `700`, files `600`) |
| Retention | 7 days. Older archives are deleted only after a successful dump, so failures never age out the last good copy |
| Log | `/var/log/scriptorium-backup.log`, a `wrote …` / `pruned …` / `FAILED: …` line per run |
| Alerts | none yet: a failed dump only writes `FAILED:` to the log, so check it by hand |

The dumps hold passkey credentials, session tokens and writers' AI API keys:
treat them as secrets. They live only on the droplet for now, so losing the
droplet loses them too; copying them off-box is a planned follow-up.

The scripts live in `ops/backup/` and take env overrides (`MONGO_CONTAINER`,
`DB`, `BACKUP_DIR`, `RETENTION_DAYS`, `DUMP_TIMEOUT` in seconds, default 1h;
the restore check also `RESTORE_DB`, which must end in `_restorecheck`, and
`VOLATILE_COLLECTIONS`).

**Install or update** (from a repo checkout, then on the droplet as root):

    scp ops/backup/mongo-dump.sh          root@<droplet>:/usr/local/sbin/scriptorium-mongo-dump
    scp ops/backup/mongo-restore-check.sh root@<droplet>:/usr/local/sbin/scriptorium-mongo-restore-check
    scp ops/backup/scriptorium-backup.cron root@<droplet>:/etc/cron.d/scriptorium-backup

    chmod 755 /usr/local/sbin/scriptorium-mongo-dump /usr/local/sbin/scriptorium-mongo-restore-check
    chmod 644 /etc/cron.d/scriptorium-backup     # cron.d files must not be writable by others
    scriptorium-mongo-dump                       # first dump by hand; check it says "wrote"

**Check it's running**: `tail /var/log/scriptorium-backup.log` and
`ls -l /var/backups/scriptorium` should show one new archive per day and no
more than about 7–8 of them.

### Restore drill

Run this after installing, after changing the scripts, and now and then to
prove the dumps are usable:

    scriptorium-mongo-restore-check              # newest archive
    scriptorium-mongo-restore-check /var/backups/scriptorium/<file> --keep

It restores the archive into a throwaway `scriptorium_restorecheck` database
on the same Mongo (never into `scriptorium`), prints live vs restored document
counts per collection, and drops the throwaway database (unless `--keep`). It
fails on a missing collection, or one that came back empty while live has
documents. Counts that differ only because of writes since the dump (audit
logs, sessions) are flagged as `changed since dump` but pass. The short-lived
auth collections (`authsessions`, `otpcodes`, `webauthnchallenges`, which
expire by TTL) are only ever flagged, never failed.

### Real restore

This replaces the live data with the archive's contents. Work in this order,
because the safety dump in step 3 becomes the newest archive, and the nightly
job keeps pruning while you investigate:

    # 1. Choose the archive to restore *first* and copy it out of the
    #    retention folder, so neither pruning nor a mix-up can touch it.
    ls -l /var/backups/scriptorium
    cp /var/backups/scriptorium/<good file> /root/restore-from.archive.gz

    # 2. Pause the nightly job so it doesn't dump bad data or prune good copies.
    mv /etc/cron.d/scriptorium-backup /root/scriptorium-backup.cron.paused

    # 3. Stop the app and keep a safety copy of the current (bad) state.
    cd /opt/apps/scriptorium
    docker compose -f compose.prod.yml stop scriptorium-server
    scriptorium-mongo-dump

    # 4. Restore, start the app, check it, then re-enable the nightly job.
    docker exec -i mongo-mongo-1 mongorestore --archive --gzip \
      --nsInclude 'scriptorium.*' --drop < /root/restore-from.archive.gz
    docker compose -f compose.prod.yml start scriptorium-server
    mv /root/scriptorium-backup.cron.paused /etc/cron.d/scriptorium-backup

`--drop` replaces each restored collection; `--nsInclude` keeps the restore
to the `scriptorium` database. Delete `/root/restore-from.archive.gz` once the
restore is confirmed; it holds the same secrets as any dump.

## Production smoke checklist

- [ ] `https://scriptorium.yourdomain.com` loads the Shelves room over HTTPS
- [ ] `GET /api/health` returns `{"status":"ok", ...}`
- [ ] Server logs show `Connected to MongoDB`
- [ ] Register, receive the one-time code by email, set up a passkey, and
      log in with it
- [ ] Create a work, add a chapter, confirm autosave persists after reload
- [ ] Open `/settings`, add a provider API key, confirm an AI-assisted action
      works end-to-end
- [ ] Push a trivial commit and let the Deploy workflow redeploy. Works are
      still there afterwards (they live in Mongo, not in the container).

## Troubleshooting

- **Deploy workflow fails at "Wait for SSH"**: the runner couldn't get through
  the DigitalOcean firewall. Check the `DO_FIREWALL_ID`, `DO_API_TOKEN` and
  `DEPLOY_PORT` secrets.
- **Deploy fails at `up --wait`**: `scriptorium-server`'s healthcheck
  (`/api/health`) didn't pass. Check `docker compose -f compose.prod.yml logs
  scriptorium-server` in `/opt/apps/scriptorium`.

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
