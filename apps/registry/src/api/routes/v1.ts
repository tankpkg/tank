import { OpenAPIHono } from '@hono/zod-openapi';

import { authRoutes } from './v1/auth';
import { badgeRoutes } from './v1/badge';
import { cliAuthRoutes } from './v1/cli-auth';
import { scanRoutes } from './v1/scan';
import { searchRoutes } from './v1/search';
import { skillsConfirmRoutes } from './v1/skills-confirm';
import { skillsPublishRoutes } from './v1/skills-publish';
import { skillsReadRoutes } from './v1/skills-read';
import { starRoutes } from './v1/star';

export const v1Routes = new OpenAPIHono()
  .route('/auth', authRoutes)
  .route('/badge', badgeRoutes)
  .route('/cli-auth', cliAuthRoutes)
  .route('/scan', scanRoutes)
  .route('/search', searchRoutes)
  .route('/skills', skillsPublishRoutes)
  .route('/skills', skillsConfirmRoutes)
  .route('/skills', starRoutes)
  .route('/skills', skillsReadRoutes);

v1Routes.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'API key from `tank login` (format: tank_xxx)'
});

v1Routes.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Tank Registry API',
    version: '1.0.0',
    description: 'Security-first package manager for AI agent skills'
  },
  servers: [{ url: '/api/v1' }]
});
