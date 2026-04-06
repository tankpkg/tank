import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ScanPage } from '~/screens/scan-screen';

export const Route = createFileRoute('/scan/')({
  validateSearch: z.object({ url: z.string().optional() }),
  component: ScanRouteWrapper
});

function ScanRouteWrapper() {
  const { url } = Route.useSearch();
  return <ScanPage initialUrl={url} />;
}
