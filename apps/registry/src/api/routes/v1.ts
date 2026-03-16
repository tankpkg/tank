import { Hono } from 'hono';

import { createRateLimiter } from '~/api/middleware/rate-limit';
import { cliAuthRoutes } from '~/api/routes/v1/cli-auth';
import { searchRoutes } from '~/api/routes/v1/search';
import { skillsConfirmRoutes } from '~/api/routes/v1/skills-confirm';
import { skillsPublishRoutes } from '~/api/routes/v1/skills-publish';
import { skillsReadRoutes } from '~/api/routes/v1/skills-read';

export const v1Routes = new Hono()
  .use('*', createRateLimiter())
  .route('/cli-auth', cliAuthRoutes)
  .route('/search', searchRoutes)
  .route('/skills', skillsPublishRoutes)
  .route('/skills', skillsConfirmRoutes)
  .route('/skills', skillsReadRoutes);
