import { createFileRoute } from '@tanstack/react-router';

import { SetupWizardScreen } from '~/screens/setup-wizard-screen';

export const Route = createFileRoute('/setup')({
  component: SetupWizardScreen
});
