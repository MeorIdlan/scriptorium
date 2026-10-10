# Scriptorium

A fiction writing app that covers the whole pipeline, from first idea to
exported manuscript, with opt-in AI assistance. Each user has their own
private shelf of works. Sign-in uses passkeys, and the account is set up
with an emailed one-time code.

**React 18 + Vite** client · **Express** + **MongoDB** (Mongoose) server ·
Anthropic/OpenAI for AI features · PDF, EPUB and DOCX export.

## Quick start

```bash
cp .env.example .env        # fill in Mailgun + ADMIN_EMAIL
docker-compose up --build
```

This starts three containers: `mongo`, `server` and `client`.

- App: http://localhost:5173
- API health check: http://localhost:3001/api/health

MongoDB data lives in the `mongo-data` Docker volume, so it survives
`docker-compose down`. `docker-compose down -v` deletes it.

## Configuration

The server reads these from the environment (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Mongo connection string. Compose sets it to `mongodb://mongo:27017/scriptorium`. |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL` | Sending one-time codes by email. |
| `ADMIN_EMAIL` | Registration requests go to this address, and the account with this email is the admin. |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_NAME` | Passkey settings. Must match the hostname and origin the app is served from. |
| `COOKIE_SECURE` | `true` when served over HTTPS. |
| `SESSION_TTL_DAYS` | How long a login lasts (default 30). |

AI provider, API key, model and generation settings are set per user in the
app at `/settings` and stored in MongoDB.

## Local dev (without Docker)

You need a MongoDB instance running. Set `MONGODB_URI` in `server/.env`
(default `mongodb://localhost:27017/scriptorium`).

```bash
# server
cd server && npm install && npm run dev    # http://localhost:3001

# client
cd client && npm install && npm run dev    # http://localhost:5173
```

Vite proxies `/api` to `http://server:3001`, the Docker service name. When
running the client outside Docker, change the proxy target in
`client/vite.config.js` to `http://localhost:3001`.

## Deployment

Production uses `docker-compose.prod.yml` behind a Cloudflare Tunnel, with
the server joining a shared MongoDB. See [docs/deployment.md](docs/deployment.md).

## Structure

```
scriptorium/
├── docker-compose.yml        # dev: mongo + server + client
├── docker-compose.prod.yml   # prod
├── .env.example
├── docs/                     # deployment guide, design specs and plans
├── server/                   # Express API
│   └── src/
│       ├── server.js         # entry: connects Mongo, mounts /api/* routes
│       ├── db.js
│       ├── models/           # Mongoose schemas
│       ├── routes/
│       ├── services/
│       └── middleware/
└── client/                   # React app
    └── src/
        ├── pages/
        ├── components/
        ├── context/
        └── hooks/
```
