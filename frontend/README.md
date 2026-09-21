<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/da1357b0-9c0e-496c-917b-b807f2843713

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Laravel API connection

The frontend API layer is located under `src/api`. It currently provides a shared
HTTP client plus initial Auth, Projects, and Tasks services.

Create `.env.local` from `.env.example` and configure the Laravel server:

```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_SANCTUM_URL=http://localhost:8000
```

For a same-domain production deployment, `VITE_API_URL=/api/v1` is recommended.
Keep `VITE_SANCTUM_URL` empty unless Laravel is hosted on a different origin.

The existing `AppContext` still uses demo/localStorage data. The API services are
intentionally isolated so each module can be migrated to the backend gradually.
