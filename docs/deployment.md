# Deployment: production compose + Cloudflare Tunnel

Scriptorium runs behind the same Cloudflare Tunnel used by other apps on this
server: `scriptorium-client` joins the external `shared-edge` Docker network,
and an ingress rule in the existing tunnel config routes a hostname to it.
Nothing binds a public port — the tunnel reaches the container over the
Docker network only.

`scriptorium-server` also joins the external `shared-mongo` network and stores
its data in a `scriptorium` database on the shared MongoDB there. Prod does
not run its own Mongo container.

The server is a Tencent Cloud Lighthouse instance, and everything runs under
rootless Podman as the `deploy` user. Deploys are automated.
`.github/workflows/deploy.yml` runs on every push to `main`. It builds both
images in GitHub Actions, pushes them to GHCR
(`ghcr.io/meoridlan/scriptorium-{server,client}`, tagged with the first 12
characters of the commit SHA and `latest`), then SSHes in and restarts the stack
in `/opt/apps/scriptorium` with `podman-compose`. Nothing is built on the server.
The shared workflow lives in `MeorIdlan/deploy-workflows`, and the shared Mongo
and cloudflared stacks are in `MeorIdlan/cell1337-stacks`.

## One-time setup

1. **Networks**: as `deploy`, confirm both shared networks exist. The stacks in
   `cell1337-stacks` create them, once for the whole server:

       podman network exists shared-edge && podman network exists shared-mongo

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
       CLIENT_IP_HEADER=cf-connecting-ip

   Passkeys only work if `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` match the public
   hostname exactly. `CLIENT_IP_HEADER` is explained in
   [Client IP](#client-ip-behind-the-tunnel).

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
   If a verified account with that email already exists, restarting the
   server flags it as admin too. The flag is only ever added: changing
   `ADMIN_EMAIL` later doesn't remove admin from the previous account, so
   unset `isAdmin` on it in mongosh if it shouldn't keep it.

## Client IP behind the tunnel

The sign-up and recovery throttles (`emailThrottle`: 5 code requests an hour
per client and email, 10 per client) need each visitor's own address. Every
request reaches the server from nginx, so the socket address is the same for
everyone, and without the setting below the caps apply to the whole site.

`CLIENT_IP_HEADER=cf-connecting-ip` makes the server read the client address
from that header (`server/src/utils/clientIp.js`). Cloudflare's edge sets
`CF-Connecting-IP` on every request and overwrites any value the client sent,
and cloudflared and nginx pass it through unchanged, so a client can't pick
its own bucket. Express's `trust proxy` stays off, so `X-Forwarded-For`, which
clients can add to freely, is never read. Leave the variable unset when the app
isn't behind Cloudflare (local dev, tests): the socket address is used.

This is only safe while the tunnel is the only way in: no published ports, and
no untrusted container on `shared-edge` or `shared-mongo` (both can reach the
app without going through Cloudflare). Anyone who reaches nginx or the server
directly, or through another proxy that doesn't overwrite the header, can send
their own `CF-Connecting-IP`. Keep `ports:` out of `docker-compose.prod.yml`.

The throttle counts an IPv6 client by its /64 (one subscriber usually holds a
whole /64), and it rejects a missing, non-string or over-254-character email
with a 400 before counting anything.

To check the header on production, watch the server's traffic while sending
one request from a phone, then compare with the phone's public IP:

    podman run --rm --net container:scriptorium_scriptorium-server_1 --cap-add NET_RAW --cap-add NET_ADMIN \
      docker.io/nicolaka/netshoot tcpdump -l -A -s0 -i any 'tcp dst port 3001' | grep --line-buffered -i -E 'cf-connecting-ip|x-forwarded-for'

## Updating

Push to `main`. To update env vars, change the `ENV_FILE` secret
(`gh secret set ENV_FILE -R MeorIdlan/scriptorium < prod.env`) and re-run the
Deploy workflow.

To roll back, open Actions → Deploy → Run workflow and set `image-tag` to an
earlier tag. Past tags are listed in `/opt/apps/scriptorium/.deploy-history` on
the server.

To look at the stack by hand, as `deploy` on the server. The containers are
named `<project>_<service>_1`:

    podman ps --filter label=io.podman.compose.project=scriptorium
    podman logs scriptorium_scriptorium-server_1

## Data

All persistent state (users, passkeys, sessions, works, chapters, codex,
settings, API keys) lives in the `scriptorium` database on the shared MongoDB.
The containers themselves are stateless.

### Nightly dump

| | |
|---|---|
| Schedule | nightly at 02:00 Kuala Lumpur time (18:00 UTC, as the server runs on UTC), from `/etc/cron.d/scriptorium-backup` (runs as root), which calls `scriptorium-backup-run` (`ops/backup/backup-run.sh`): dump, upload, then the Healthchecks ping |
| What | `mongodump --db scriptorium --archive --gzip` inside the shared Mongo container `mongo_mongo_1`. Other databases on that Mongo are not included |
| Where | `/var/backups/scriptorium/scriptorium-<YYYYMMDDTHHMMSSZ>.archive.gz` on the server (folder `700`, files `600`) |
| Retention | 7 days. Older archives are deleted only after a successful dump, so failures never age out the last good copy |
| Off-box copy | right after a successful dump, the same cron job uploads the new archive to COS (see [Off-box copy](#off-box-copy-cos)). A failed dump skips the upload |
| Log | `/var/log/scriptorium-backup.log`, a `wrote …` / `pruned …` / `uploaded …` / `FAILED: …` line per step, then `pinged healthchecks (ok\|fail)` or a `WARN: …` about the ping |
| Alerts | a [Healthchecks.io](https://healthchecks.io) check emails the dev when a run fails (dump or upload) or doesn't report by 20:00 UTC. A successful run sends nothing. See [Alerts](#alerts-healthchecksio) |

The dumps hold passkey credentials, session tokens and writers' AI API keys:
treat them as secrets, both on the server and in COS.

The backup scripts run as root, while Mongo belongs to `deploy`, so they reach
it through `scriptorium-container` (`ops/backup/container-as-deploy.sh`).

The scripts live in `ops/backup/` and take env overrides (`MONGO_CONTAINER`,
`DB`, `BACKUP_DIR`, `CONTAINER_CMD`, `RETENTION_DAYS`, `DUMP_TIMEOUT` in seconds, default 1h;
the restore check also `RESTORE_DB`, which must end in `_restorecheck`, and
`VOLATILE_COLLECTIONS`; the upload also `SPACES_CONFIG`, `SPACES_URI` and
`UPLOAD_TIMEOUT` in seconds, default 30 min; the nightly run also
`HC_URL_FILE`, `DUMP_CMD` and `UPLOAD_CMD`).

**Install or update** (from a repo checkout, then on the server as root). Set
up COS first ([below](#off-box-copy-cos)): without it, every nightly
upload logs `FAILED: no Spaces config`. Set up the [Healthchecks
check](#alerts-healthchecksio) too: without its URL file, runs log `WARN: no
healthchecks URL` and nothing alerts.

    scp -P 22137 ops/backup/container-as-deploy.sh root@<server>:/usr/local/sbin/scriptorium-container
    scp -P 22137 ops/backup/mongo-dump.sh          root@<server>:/usr/local/sbin/scriptorium-mongo-dump
    scp -P 22137 ops/backup/mongo-restore-check.sh root@<server>:/usr/local/sbin/scriptorium-mongo-restore-check
    scp -P 22137 ops/backup/spaces-upload.sh       root@<server>:/usr/local/sbin/scriptorium-spaces-upload
    scp -P 22137 ops/backup/backup-run.sh          root@<server>:/usr/local/sbin/scriptorium-backup-run
    scp -P 22137 ops/backup/scriptorium-backup.cron root@<server>:/etc/cron.d/scriptorium-backup   # last, once the scripts it calls are there

    chmod 755 /usr/local/sbin/scriptorium-container /usr/local/sbin/scriptorium-mongo-dump \
              /usr/local/sbin/scriptorium-mongo-restore-check /usr/local/sbin/scriptorium-spaces-upload \
              /usr/local/sbin/scriptorium-backup-run
    chmod 644 /etc/cron.d/scriptorium-backup     # cron.d files must not be writable by others
    scriptorium-mongo-dump                       # first dump by hand; check it says "wrote"
    scriptorium-spaces-upload                    # first upload by hand; check it says "uploaded"
    scriptorium-backup-run                       # the whole nightly job; check it ends "pinged healthchecks (ok)"

**Check it's running**: `tail /var/log/scriptorium-backup.log` should show a
`wrote`, an `uploaded` and a `pinged healthchecks (ok)` line per night,
`ls -l /var/backups/scriptorium` one new archive per day and no more than
about 7–8 of them. The Healthchecks dashboard shows the check as up.

### Alerts (Healthchecks.io)

The check is a dead-man's switch: Healthchecks expects a ping every night and
emails the dev when one is a failure or doesn't come.

| | |
|---|---|
| Success | `scriptorium-backup-run` pings the check URL. No email |
| Failed dump or upload | it pings `<url>/fail` with the last 10 KB of the run's output, so the email shows the `FAILED:` line. Email within a minute or so |
| Missed run | cron not running, the server down, or the ping failing 3 tries in a row (logged as `WARN: healthchecks ping failed`): no ping by 18:00 UTC + 2 h grace, so an email at about 20:00 UTC (04:00 KL). The grace is longer than the slowest run the timeouts allow (1 h dump + 30 min upload), so a slow but good night doesn't alert |
| Back to normal | the next successful run turns the check back up and sends an "up" email |
| Ping URL | `/etc/scriptorium-backup/healthchecks-url` on the server, root-only (`600`). Never in the repo: anyone holding it can mark the check green |

The ping never changes the backup's own result or exit code.

**One-time setup:**

1. Sign up at healthchecks.io (free plan) with the email that should get the
   alerts. Email to the account address is on by default under Integrations.
2. Add a check named `scriptorium-backup`: **Schedule** Cron, expression
   `0 18 * * *`, **Time Zone** UTC, **Grace Time** 2 hours. Copy its ping URL
   (`https://hc-ping.com/<uuid>`).
3. On the server, as root (an editor, so the URL doesn't land in shell
   history):

       install -d -m 700 /etc/scriptorium-backup
       install -m 600 /dev/null /etc/scriptorium-backup/healthchecks-url
       nano /etc/scriptorium-backup/healthchecks-url    # the ping URL, one line

4. Run `scriptorium-backup-run` once by hand. It should end with `pinged
   healthchecks (ok)`, and the check should turn up on the dashboard.

**Test it** after setup, and after changing the scripts or the check:

- *Failure*: `MONGO_CONTAINER=nope scriptorium-backup-run`. The dump fails
  (nothing is written or pruned), the run ends with `pinged healthchecks
  (fail)`, and a "down" email arrives with the `FAILED:` line in it. Then run
  `scriptorium-backup-run` again to get back to up (an "up" email
  follows).
- *Missed run*: once the check is up again, rename the URL file for one night (`mv
  /etc/scriptorium-backup/healthchecks-url{,.off}` before 18:00 UTC). The
  backup still runs but logs `WARN: no healthchecks URL`, and the "down" email
  arrives at about 20:00 UTC. Move the file back afterwards.

**Replace the URL** (if it leaks): make a new check with the same settings,
put its URL in the file, run `scriptorium-backup-run` to confirm, then delete
the old check.

### Off-box copy (COS)

| | |
|---|---|
| Where | the dev's private Tencent COS bucket `cell1337-bucket-1523630779` (`ap-singapore`), under `scriptorium/backups/scriptorium-<YYYYMMDDTHHMMSSZ>.archive.gz`, uploaded with a private ACL |
| How | `scriptorium-spaces-upload` (`ops/backup/spaces-upload.sh`, named for the earlier provider) runs `s3cmd put` on the newest archive, or on one given as an argument. It never touches the local copy |
| Retention | 30 days, from a lifecycle rule on the prefix `scriptorium/backups/`, which also aborts stalled multipart uploads after 1 day. It's set in the COS console, because the key can't change bucket settings |
| Credentials | the CAM user `cell1337-server-backup` in `/etc/scriptorium-backup/s3cfg` on the server, root-only (`600`, folder `700`). Never in the repo |
| Failures | `FAILED: …` in the backup log, exit 1 and a Healthchecks [alert](#alerts-healthchecksio); the local archive stays. Failed uploads aren't retried: the next night only uploads its own dump, so send a missed night by hand with `scriptorium-spaces-upload /var/backups/scriptorium/<file>` while it's still within the 7 local days |

The key's policy allows only `scriptorium/backups/` and `tender/backups/`, so it
can't reach other apps' files, and their keys can't read these dumps. It can
list a folder only with that exact prefix.

**One-time setup:**

1. In CAM, create a user with programmatic access only, and a policy allowing
   the object actions on those two folders, plus `name/cos:GetBucket` limited by
   `cos:prefix` to `scriptorium%2Fbackups%2F` and `tender%2Fbackups%2F`.
2. On the server, as root, install s3cmd and write its config. Use an editor so
   the secret doesn't land in shell history:

       apt install s3cmd
       install -d -m 700 /etc/scriptorium-backup
       install -m 600 /dev/null /etc/scriptorium-backup/s3cfg
       nano /etc/scriptorium-backup/s3cfg

   with:

       [default]
       access_key = <key id>
       secret_key = <key secret>
       host_base = cos.ap-singapore.myqcloud.com
       host_bucket = %(bucket)s.cos.ap-singapore.myqcloud.com
       bucket_location = ap-singapore
       use_https = True

3. In the COS console, add the lifecycle rule above.
4. Run the first upload by hand (`scriptorium-spaces-upload`), then
   `s3cmd -c /etc/scriptorium-backup/s3cfg ls s3://cell1337-bucket-1523630779/scriptorium/backups/`.

**Rotate the key**: create a new key on the CAM user, swap it into
`/etc/scriptorium-backup/s3cfg`, run `scriptorium-spaces-upload`, then delete
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

### Restore from COS

When the server's copies are gone or too new (COS keeps 30 days, the server 7),
fetch the archive from COS, prove it with the drill, then use
it for a [real restore](#real-restore). Skip the copy in step 1 there: the
archive is already at `/root/restore-from.archive.gz`.

    s3cmd -c /etc/scriptorium-backup/s3cfg ls s3://cell1337-bucket-1523630779/scriptorium/backups/
    (umask 077; s3cmd -c /etc/scriptorium-backup/s3cfg get --force \
      s3://cell1337-bucket-1523630779/scriptorium/backups/<file> /root/restore-from.archive.gz)
    scriptorium-mongo-restore-check /root/restore-from.archive.gz   # must say PASS

On a new server, bring up the shared Mongo stack and do step 2 of the one-time
setup above (s3cmd and its config, with the same key) first.

### Real restore

This replaces the live data with the archive's contents. Work in this order,
because the safety dump in step 3 becomes the newest archive, and the nightly
job keeps pruning while you investigate:

    # 1. Choose the archive to restore *first* and copy it out of the
    #    retention folder, so neither pruning nor a mix-up can touch it.
    ls -l /var/backups/scriptorium
    cp /var/backups/scriptorium/<good file> /root/restore-from.archive.gz

    # 2. Pause the nightly job so it doesn't dump bad data or prune good copies.
    #    Also pause the Healthchecks check (dashboard → Pause), or it emails
    #    about the missed run.
    mv /etc/cron.d/scriptorium-backup /root/scriptorium-backup.cron.paused

    # 3. Stop the app and keep a safety copy of the current (bad) state.
    scriptorium-container stop scriptorium_scriptorium-server_1
    scriptorium-mongo-dump

    # 4. Restore, start the app, check it, then re-enable the nightly job.
    scriptorium-container exec -i mongo_mongo_1 mongorestore --archive --gzip \
      --nsInclude 'scriptorium.*' --drop < /root/restore-from.archive.gz
    scriptorium-container start scriptorium_scriptorium-server_1
    mv /root/scriptorium-backup.cron.paused /etc/cron.d/scriptorium-backup
    #    The check un-pauses on the next night's ping.

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
  the Lighthouse firewall. Check the `TC_INSTANCE_ID`, `TC_SECRET_ID`,
  `TC_SECRET_KEY` and `DEPLOY_PORT` secrets.
- **Deploy fails at "Pull and restart stack"**: a service didn't become healthy.
  The run's log lists each container's state. As `deploy`, check
  `podman logs scriptorium_scriptorium-server_1`.

- **502 from the tunnel**: `scriptorium-client` isn't on `shared-edge`, or
  the ingress rule's service name doesn't match the compose service name —
  check `podman network inspect shared-edge` lists the container.
- **`/api/*` requests 404 through the tunnel but work on `localhost`**: nginx
  in the client image proxies `/api/` to `scriptorium-server:3001` — confirm
  both containers are on the same (default) compose network in addition to
  `shared-edge`.
- **Server exits on start with `Failed to connect to MongoDB`**:
  `scriptorium-server` isn't on `shared-mongo`, the Mongo container isn't
  named/aliased `mongo` there, or it isn't running as replica set `rs0`.
  Check with `podman network inspect shared-mongo`.
- **Data missing after a redeploy**: check the server is pointed at the right
  database (`scriptorium`). An empty shelf usually means a different
  `MONGODB_URI` or a different Mongo instance.
- **Passkey registration or login fails**: `WEBAUTHN_RP_ID` and
  `WEBAUTHN_ORIGIN` in `.env` don't match the public hostname.
- **One-time code emails never arrive**: check the Mailgun values in `.env`
  and the server logs.
