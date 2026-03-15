import { createFileRoute } from '@tanstack/react-router';

import { app } from '~/api/app';

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => app.fetch(request),
      POST: ({ request }) => app.fetch(request),
      PUT: ({ request }) => app.fetch(request),
      DELETE: ({ request }) => app.fetch(request),
      PATCH: ({ request }) => app.fetch(request)
    }
  }
});
