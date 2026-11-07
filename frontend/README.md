# TADBIR Frontend (React + TypeScript)

The product SPA: React 19, TypeScript, Vite, Tailwind CSS 4. Canonical documentation index: [`../docs/README.md`](../docs/README.md). UI/Design System standards: [`../docs/ui-standards.md`](../docs/ui-standards.md) (maintained by the frontend contributor).

## Run locally

**Prerequisites:** Node.js 22 (matches CI), a running Laravel backend (see [`../backend/README.md`](../backend/README.md)).

```bash
npm ci
cp .env.example .env.local   # then adjust if your backend is not on localhost:8000
npm run dev                  # Vite dev server on port 3000
```

`.env.local` keys (public build-time values only, never secrets): `VITE_API_URL` (e.g. `http://localhost:8000/api/v1`), `VITE_SANCTUM_URL` (e.g. `http://localhost:8000`). For a same-domain production deployment, `VITE_API_URL=/api/v1` is recommended; keep `VITE_SANCTUM_URL` empty unless Laravel is hosted on a different origin.

## Checks

```bash
npm run lint        # tsc --noEmit (also: npm run typecheck)
npm test            # node --test suites in tests/, incl. the backend permission-catalog parity test
npm run build       # production build into dist/ (tracked release artifact for shared hosting — see ../docs/deployment.md)
```

`VITE_DEMO_MODE=true` runs the in-memory demo (no API calls); it is not a substitute for backend-connected testing.
