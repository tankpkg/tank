export function getRegistryUrl(): string {
  return process.env.E2E_REGISTRY_URL ?? process.env.APP_URL ?? 'http://127.0.0.1:5555';
}
