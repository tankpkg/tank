import { createFileRoute } from '@tanstack/react-router';

import { RegistryLayout } from '~/layouts/registry-layout';

export const Route = createFileRoute('/_registry')({
  component: RegistryLayout
});
