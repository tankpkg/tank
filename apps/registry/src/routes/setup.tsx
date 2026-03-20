import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { SetupWizardScreen } from '~/screens/setup-wizard-screen';

const checkSelfHosted = createServerFn({ method: 'GET' }).handler(async () => {
  const { isSelfHosted } = await import('~/consts/env');
  return isSelfHosted;
});

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    const selfHosted = await checkSelfHosted();
    if (!selfHosted) throw redirect({ to: '/' });
  },
  component: SetupWizardScreen
});
