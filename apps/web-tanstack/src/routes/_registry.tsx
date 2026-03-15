import { createFileRoute } from '@tanstack/react-router';

import { ErrorFallback } from '~/components/error-fallback';
import { RegistryLayout } from '~/components/layouts/registry-layout';

export const Route = createFileRoute('/_registry')({
  component: RegistryLayout,
  errorComponent: ErrorFallback
});
