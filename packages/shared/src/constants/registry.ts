export const REGISTRY_URL = 'https://tankpkg.dev';
export const REGISTRY_API_VERSION = 'v1';
export const MAX_PACKAGE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_COUNT = 1000;
export const MAX_NAME_LENGTH = 214;
export const MAX_DESCRIPTION_LENGTH = 500;
export const LOCKFILE_VERSION = 2;
export const SCHEMA_BASE_URL = 'https://www.tankpkg.dev/schemas/v1';
export const MANIFEST_SCHEMA_URL = `${SCHEMA_BASE_URL}/skills.json`;
export const LOCKFILE_SCHEMA_URL = `${SCHEMA_BASE_URL}/skills.lock`;

// Manifest and lockfile filenames
export const MANIFEST_FILENAME = 'tank.json';
export const LEGACY_MANIFEST_FILENAME = 'skills.json';
export const LOCKFILE_FILENAME = 'tank.lock';
export const LEGACY_LOCKFILE_FILENAME = 'skills.lock';
