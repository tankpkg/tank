import { createFileRoute } from '@tanstack/react-router';

import { ScanPage } from '~/screens/scan-screen';

export const Route = createFileRoute('/scan/')({
  component: ScanPage
});
