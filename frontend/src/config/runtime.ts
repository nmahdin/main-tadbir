export function readRuntime(env: Record<string, unknown>) {
  return Object.freeze({
    apiUrl: String(env.VITE_API_URL || '/api/v1').replace(/\/$/, ''),
    sanctumUrl: String(env.VITE_SANCTUM_URL || '').replace(/\/$/, ''),
    demoMode: env.VITE_DEMO_MODE === 'true',
    development: env.DEV === true,
    production: env.PROD === true,
  });
}
export const runtime = readRuntime(import.meta.env ?? {});
