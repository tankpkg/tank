import { Hono } from 'hono';

import { createRateLimiter } from '../middleware/rate-limit';
import { cliAuthRoutes } from './v1/cli-auth';
import { searchRoutes } from './v1/search';
import { skillsConfirmRoutes } from './v1/skills-confirm';
import { skillsPublishRoutes } from './v1/skills-publish';
import { skillsReadRoutes } from './v1/skills-read';

export const v1Routes = new Hono()
  .use('*', createRateLimiter())
  .route('/cli-auth', cliAuthRoutes)
  .route('/search', searchRoutes)
  .route('/skills', skillsPublishRoutes)
  .route('/skills', skillsConfirmRoutes)
  .route('/skills', skillsReadRoutes);
