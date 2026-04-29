import type { ProxyPolicy } from '@internals/schemas';

export const PHASE_2_DEFAULTS: Required<Pick<ProxyPolicy, 'perfBudgetMs' | 'blockOnMatch' | 'resetPinsOnMismatch'>> = {
  perfBudgetMs: 5,
  blockOnMatch: true,
  resetPinsOnMismatch: false
};
