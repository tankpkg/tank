import type { ReactNode } from 'react';

interface StatusPageProps {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}

export function StatusPage({ icon, title, description, children }: StatusPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="tank-gradient-bg tank-grid-overlay flex flex-1 items-center justify-center px-4">
        <div className="mx-auto max-w-lg text-center">
          <div className="mb-6 inline-flex items-center justify-center rounded-full border border-border/50 bg-muted/30 p-4">
            {icon}
          </div>

          <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-foreground">{title}</h1>
          <p className="mb-8 text-muted-foreground">{description}</p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}
