import { createFileRoute } from '@tanstack/react-router';
import { AdminSettingsScreen } from '~/screens/admin-settings-screen';

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettingsScreen
});
