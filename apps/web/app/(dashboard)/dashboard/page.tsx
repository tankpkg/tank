import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const userName = session?.user?.name || 'there';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {userName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your API tokens, organizations, and skills.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLinkCard
          href="/tokens"
          title="Manage Tokens"
          description="Create and revoke API keys for CLI authentication and programmatic access."
        />
        <QuickLinkCard
          href="/orgs"
          title="Manage Organizations"
          description="Create organizations and manage team members and permissions."
        />
        <QuickLinkCard
          href="/skills"
          title="Browse Skills"
          description="Discover and install verified AI agent skills from the registry."
        />
      </div>
    </div>
  );
}

function QuickLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
