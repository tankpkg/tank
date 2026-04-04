import { createFileRoute } from '@tanstack/react-router';

import { TopSkillsScreen } from '~/screens/top-skills-screen';

export const Route = createFileRoute('/scan/top-skills')({
  component: TopSkillsScreen
});
