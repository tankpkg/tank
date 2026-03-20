import { Hono } from 'hono';

import { authRoutes } from './v1/auth';
import { badgeRoutes } from './v1/badge';
import { cliAuthRoutes } from './v1/cli-auth';
import { searchRoutes } from './v1/search';
import { skillsConfirmRoutes } from './v1/skills-confirm';
import { skillsPublishRoutes } from './v1/skills-publish';
import { skillsReadRoutes } from './v1/skills-read';
import { starRoutes } from './v1/star';

export const v1Routes = new Hono()
  .route('/auth', authRoutes)
  .route('/badge', badgeRoutes)
  .route('/cli-auth', cliAuthRoutes)
  .route('/search', searchRoutes)
  .route('/skills', skillsPublishRoutes)
  .route('/skills', skillsConfirmRoutes)
  .route('/skills', skillsReadRoutes)
  .route('/skills', starRoutes);
