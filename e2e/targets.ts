export type AppTarget = 'next' | 'tanstack';

export interface AppTargetConfig {
  id: AppTarget;
  displayName: string;
  registryUrl: string;
}

function resolveRegistryUrl(target: AppTarget): string {
  if (target === 'tanstack') {
    return process.env.TANSTACK_E2E_REGISTRY_URL ?? process.env.APP_URL ?? 'http://127.0.0.1:3001';
  }

  return process.env.NEXT_E2E_REGISTRY_URL ?? process.env.E2E_REGISTRY_URL ?? 'http://127.0.0.1:3000';
}

export function getAppTarget(target: AppTarget): AppTargetConfig {
  return {
    id: target,
    displayName: target === 'tanstack' ? 'TanStack registry' : 'Next.js registry',
    registryUrl: resolveRegistryUrl(target)
  };
}

export function getCurrentAppTarget(target = process.env.TANK_APP_TARGET): AppTargetConfig {
  if (target === 'tanstack') {
    return getAppTarget('tanstack');
  }

  return getAppTarget('next');
}

export function getRequestedAppTargets(target = process.env.TANK_APP_TARGET): AppTargetConfig[] {
  if (target === 'all') {
    return [getAppTarget('next'), getAppTarget('tanstack')];
  }

  return [getCurrentAppTarget(target)];
}
