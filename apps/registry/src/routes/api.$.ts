import { createFileRoute } from '@tanstack/react-router';

import { app } from '~/api/app';

export const Route = createFileRoute('/api/$')({
  server: { handlers: { ANY: ({ request }) => app.fetch(request) } }
});
