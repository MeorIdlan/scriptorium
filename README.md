# Scriptorium

A full-stack starter scaffold: **React + Vite** frontend, **Express.js** backend, orchestrated with **Docker Compose**.

## Quick start

```bash
docker-compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3001/api/health

## Local dev (without Docker)

```bash
# backend
cd backend && npm install && npm run dev    # http://localhost:3001

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

In Docker, Vite proxies `/api` to the `backend` service. Running the frontend
standalone outside Docker, set the proxy target in `frontend/vite.config.js` to
`http://localhost:3001`.

## Structure

```
scriptorium/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/server.js        # Express app — GET /api/health
└── frontend/
    ├── Dockerfile
    ├── index.html
    ├── vite.config.js       # proxies /api → backend:3001
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx          # fetches /api/health
        └── index.css
```
