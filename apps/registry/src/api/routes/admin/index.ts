import { Hono } from 'hono';

import { auditLogsRoutes } from './audit-logs';
import { orgsRoutes } from './orgs';
import { packagesRoutes } from './packages';
import { serviceAccountsRoutes } from './service-accounts';
import { settingsRoutes } from './settings';
import { usersRoutes } from './users';

export const adminRoutes = new Hono()
  .route('/users', usersRoutes)
  .route('/packages', packagesRoutes)
  .route('/orgs', orgsRoutes)
  .route('/audit-logs', auditLogsRoutes)
  .route('/service-accounts', serviceAccountsRoutes)
  .route('/settings', settingsRoutes);
