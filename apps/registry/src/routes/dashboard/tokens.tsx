import { createFileRoute } from '@tanstack/react-router';

import { TokensScreen } from '~/screens/tokens-screen';

export const Route = createFileRoute('/dashboard/tokens')({
  component: TokensScreen
});
