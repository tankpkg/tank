import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { InstallSnippet } from '~/components/skills/install-snippet';
import { Button } from '~/components/ui/button';

export function DocsBottomCta() {
  return (
    <div data-testid="docs-bottom-cta" className="not-prose mt-12 pt-6 border-t border-border/50">
      <div className="rounded-lg border border-tank/15 bg-tank/[0.02] px-5 py-4">
        <p className="text-sm font-medium mb-2 text-foreground">Ready to try?</p>
        <p className="text-xs text-muted-foreground mb-3">
          Install the CLI and start adding secure, verified packages to your AI agent.
        </p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="w-full sm:w-auto sm:flex-1 min-w-0">
            <InstallSnippet skillName="@org/package" testId="docs-bottom-install" />
          </div>
          <Button size="sm" asChild>
            <Link to="/skills" search={{} as never} className="!text-primary-foreground !no-underline">
              Browse Packages
              <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
