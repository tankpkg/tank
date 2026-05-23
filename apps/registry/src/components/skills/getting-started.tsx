import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';

interface StepProps {
  n: string;
  label: string;
  command: string;
}

function Step({ n, label, command }: StepProps) {
  return (
    <div className="flex gap-2.5">
      <div className="flex-none mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-tank/10 text-[11px] font-bold text-tank border border-tank/20">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium mb-1">{label}</p>
        <code className="block w-full overflow-x-auto rounded border bg-muted/50 px-2 py-1.5 font-mono text-[11px] whitespace-nowrap">
          {command}
        </code>
      </div>
    </div>
  );
}

export function GettingStarted() {
  return (
    <Card data-testid="getting-started-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Getting Started</CardTitle>
        <CardDescription className="text-xs">Get Tank running in 3 steps.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Step n="1" label="Install the CLI" command="npm i -g @tankpkg/cli" />
        <Step n="2" label="Search the registry" command="tank search <query>" />
        <Step n="3" label="Install globally" command="tank install -g <pkg>" />
      </CardContent>
    </Card>
  );
}
