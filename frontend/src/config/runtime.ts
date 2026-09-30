const PRODUCTION_API_ORIGIN = 'https://api-tadbir.morvarid-daron.ir';

const value = (candidate: unknown): string => typeof candidate === 'string' ? candidate.trim() : '';

export function readRuntime(env: Record<string, unknown>) {
  const production = env.PROD === true;
  const configuredApiUrl = value(env.VITE_API_URL);
  const configuredSanctumUrl = value(env.VITE_SANCTUM_URL);

  return Object.freeze({
    // The production fallback is intentional: shared-host builds do not load
    // *.example files, and silently falling back to the panel origin makes all
    // auth calls hit a non-existent /api route on the static frontend host.
    apiUrl: (configuredApiUrl || (production ? `${PRODUCTION_API_ORIGIN}/api/v1` : '/api/v1')).replace(/\/$/, ''),
    sanctumUrl: (configuredSanctumUrl || (production ? PRODUCTION_API_ORIGIN : '')).replace(/\/$/, ''),
    demoMode: env.VITE_DEMO_MODE === 'true',
    development: env.DEV === true,
    production,
  });
}
export const runtime = readRuntime(import.meta.env ?? {});
