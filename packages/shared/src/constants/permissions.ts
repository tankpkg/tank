export const PERMISSION_CATEGORIES = ['network', 'filesystem', 'subprocess'] as const;
export type PermissionCategory = typeof PERMISSION_CATEGORIES[number];

export const DEFAULT_PERMISSIONS = {
  network: undefined,
  filesystem: undefined,
  subprocess: false,
} as const;
