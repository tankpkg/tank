import type { APIRoute } from 'astro';

import { app } from '~/routes/app';

export const prerender = false;

export const ALL: APIRoute = ({ request }) => app.fetch(request);
