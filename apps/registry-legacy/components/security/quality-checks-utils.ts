export type QualityCategoryName = 'Documentation' | 'Package Hygiene' | 'Permissions' | 'Security Scan';

export interface QualityCategory {
  name: QualityCategoryName;
  passed: boolean;
  details: string;
}

export function computeQualityChecks(input: {
  readme: string | null;
  description: string | null;
  license: string | null;
  repositoryUrl: string | null;
  permissions: Record<string, unknown>;
}): QualityCategory[] {
  return [
    {
      name: 'Documentation',
      passed:
        !!(input.readme && input.readme.trim().length > 0) &&
        !!(input.description && input.description.trim().length > 0),
      details:
        input.readme && input.description
          ? 'README + description'
          : input.readme
            ? 'README only'
            : input.description
              ? 'Description only'
              : 'Missing'
    },
    {
      name: 'Package Hygiene',
      passed: !!(input.license || input.repositoryUrl),
      details:
        input.license && input.repositoryUrl
          ? 'License + repo'
          : input.license
            ? 'License only'
            : input.repositoryUrl
              ? 'Repo only'
              : 'Missing'
    },
    {
      name: 'Permissions',
      passed: Object.keys(input.permissions).length > 0,
      details:
        Object.keys(input.permissions).length > 0
          ? `${Object.keys(input.permissions).length} declared`
          : 'None declared'
    }
  ];
}
