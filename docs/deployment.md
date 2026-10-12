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
| Schedule | nightly at 02:00 Kuala Lumpur time (18:00 UTC, as the droplet runs on UTC), from `/etc/cron.d/scriptorium-backup` (runs as root) |
| What | `mongodump --db scriptorium --archive --gzip` inside the shared Mongo container `mongo-mongo-1`. Other databases on that Mongo are not included |
| Where | `/var/backups/scriptorium/scriptorium-<YYYYMMDDTHHMMSSZ>.archive.gz` on the droplet (folder `700`, files `600`) |
| Retention | 7 days. Older archives are deleted only after a successful dump, so failures never age out the last good copy |
| Off-box copy | right after a successful dump, the same cron job uploads the new archive to DO Spaces (see [Off-box copy](#off-box-copy-do-spaces)). A failed dump skips the upload |
| Log | `/var/log/scriptorium-backup.log`, a `wrote …` / `pruned …` / `uploaded …` / `FAILED: …` line per run |
| Alerts | none yet: a failed dump or upload only writes `FAILED:` to the log, so check it by hand |

The dumps hold passkey credentials, session tokens and writers' AI API keys:
treat them as secrets, both on the droplet and in Spaces.

The scripts live in `ops/backup/` and take env overrides (`MONGO_CONTAINER`,
`DB`, `BACKUP_DIR`, `RETENTION_DAYS`, `DUMP_TIMEOUT` in seconds, default 1h;
the restore check also `RESTORE_DB`, which must end in `_restorecheck`, and
`VOLATILE_COLLECTIONS`; the upload also `SPACES_CONFIG`, `SPACES_URI` and
`UPLOAD_TIMEOUT` in seconds, default 30 min).

**Install or update** (from a repo checkout, then on the droplet as root). Set
up Spaces first ([below](#off-box-copy-do-spaces)): without it, every nightly
upload logs `FAILED: no Spaces config`.

    scp ops/backup/mongo-dump.sh          root@<droplet>:/usr/local/sbin/scriptorium-mongo-dump
    scp ops/backup/mongo-restore-check.sh root@<droplet>:/usr/local/sbin/scriptorium-mongo-restore-check
    scp ops/backup/spaces-upload.sh       root@<droplet>:/usr/local/sbin/scriptorium-spaces-upload
    scp ops/backup/scriptorium-backup.cron root@<droplet>:/etc/cron.d/scriptorium-backup   # last, once the scripts it calls are there

    chmod 755 /usr/local/sbin/scriptorium-mongo-dump /usr/local/sbin/scriptorium-mongo-restore-check \
              /usr/local/sbin/scriptorium-spaces-upload
    chmod 644 /etc/cron.d/scriptorium-backup     # cron.d files must not be writable by others
    scriptorium-mongo-dump                       # first dump by hand; check it says "wrote"
    scriptorium-spaces-upload                    # first upload by hand; check it says "uploaded"

**Check it's running**: `tail /var/log/scriptorium-backup.log` should show a
`wrote` and an `uploaded` line per night, `ls -l /var/backups/scriptorium` one
new archive per day and no more than about 7–8 of them.

### Off-box copy (DO Spaces)

| | |
|---|---|
| Where | the dev's shared private Space `cell1337-bucket` (sgp1), under `scriptorium/backups/scriptorium-<YYYYMMDDTHHMMSSZ>.archive.gz`, uploaded with a private ACL. Other apps keep to their own top-level folders; scriptorium keeps to `scriptorium/` |
| How | `scriptorium-spaces-upload` (`ops/backup/spaces-upload.sh`) runs `s3cmd put` on the newest archive, or on one given as an argument. It never touches the local copy |
| Retention | 30 days, enforced by a bucket lifecycle rule limited to `scriptorium/backups/` (`ops/backup/spaces-lifecycle.xml`), which also clears stalled multipart uploads there after 1 day. DO applies lifecycle rules about once a day |
| Credentials | a limited (Read/Write/Delete) Spaces key for `cell1337-bucket` in `/etc/scriptorium-backup/s3cfg` on the droplet, root-only (`600`, folder `700`). Never in the repo |
| Failures | `FAILED: …` in the backup log and exit 1; the local archive stays. Failed uploads aren't retried: the next night only uploads its own dump, so send a missed night by hand with `scriptorium-spaces-upload /var/backups/scriptorium/<file>` while it's still within the 7 local days |

DO keys can be limited to a bucket but not to a folder. The dev chose the
shared bucket knowing that this key can read and delete other apps' files in
it, and that any other app's key for `cell1337-bucket` can read these dumps.
Keep every key for the bucket as tightly held as this one.

**One-time setup:**

1. The Space `cell1337-bucket` (sgp1) already exists. Check it has
   **File Listing: Restricted** and no CDN.
2. Under **Spaces Object Storage → Access Keys**, create a **limited access**
   key for `cell1337-bucket` with **Read/Write/Delete**. This is the nightly key.
3. On the droplet, as root, install s3cmd and write its config with the key.
   Use an editor so the secret doesn't land in shell history:

       apt install s3cmd
       install -d -m 700 /etc/scriptorium-backup
       install -m 600 /dev/null /etc/scriptorium-backup/s3cfg
       nano /etc/scriptorium-backup/s3cfg

   with:

       [default]
       access_key = <limited key>
       secret_key = <limited secret>
       host_base = sgp1.digitaloceanspaces.com
       host_bucket = %(bucket)s.sgp1.digitaloceanspaces.com
       use_https = True

4. Add scriptorium's lifecycle rule. Limited keys can't change bucket
   configuration, so use a **Full Access** key once, from a throwaway config.
   `setlifecycle` **replaces the bucket's whole lifecycle config**, so look at
   what's there first:

       install -m 600 /dev/null /root/s3cfg-full && nano /root/s3cfg-full   # as above, full-access key
       s3cmd -c /root/s3cfg-full getlifecycle s3://cell1337-bucket

   If it reports no lifecycle configuration, apply the file as is. If other
   rules exist, save them to a file, add the `<Rule>` from
   `spaces-lifecycle.xml` next to them (in the same format as theirs: if they
   use `<Filter><Prefix>`, wrap this rule's `<Prefix>` the same way), and apply
   that merged file instead:

       s3cmd -c /root/s3cfg-full setlifecycle spaces-lifecycle.xml s3://cell1337-bucket
       s3cmd -c /root/s3cfg-full getlifecycle s3://cell1337-bucket   # Days 30 on scriptorium/backups/, other rules intact
       rm /root/s3cfg-full

   (`scp ops/backup/spaces-lifecycle.xml` to the droplet first.) If the full
   key was made only for this, revoke it in the console. Other apps adding
   lifecycle rules later must merge with this one in the same way.
5. Run the first upload by hand (`scriptorium-spaces-upload`), then
   `s3cmd -c /etc/scriptorium-backup/s3cfg ls s3://cell1337-bucket/scriptorium/backups/`.

**Rotate the key**: create a new limited key, swap it into
`/etc/scriptorium-backup/s3cfg`, run `scriptorium-spaces-upload`, then revoke
the old key.

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

### Restore from Spaces

When the droplet's copies are gone or too new (Spaces keeps 30 days, the
droplet 7), fetch the archive from Spaces, prove it with the drill, then use
it for a [real restore](#real-restore). Skip the copy in step 1 there: the
archive is already at `/root/restore-from.archive.gz`.

    s3cmd -c /etc/scriptorium-backup/s3cfg ls s3://cell1337-bucket/scriptorium/backups/
    (umask 077; s3cmd -c /etc/scriptorium-backup/s3cfg get --force \
      s3://cell1337-bucket/scriptorium/backups/<file> /root/restore-from.archive.gz)
    scriptorium-mongo-restore-check /root/restore-from.archive.gz   # must say PASS

On a new droplet, bring up the shared Mongo stack and do step 3 of the
one-time setup above (s3cmd and its config, with the same limited key) first.

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
