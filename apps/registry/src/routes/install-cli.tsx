import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

const getCliInfo = createServerFn({ method: 'GET' }).handler(async () => {
  const isSelfHosted = process.env.TANK_MODE === 'selfhosted';
  const appUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  return { isSelfHosted, appUrl };
});

export const Route = createFileRoute('/install-cli')({
  loader: () => getCliInfo(),
  component: InstallCliPage
});

function InstallCliPage() {
  const { isSelfHosted, appUrl } = Route.useLoaderData();

  if (!isSelfHosted) {
    return (
      <div className="tank-shell py-10 max-w-3xl mx-auto space-y-8">
        <h1 className="text-3xl font-semibold">Install Tank CLI</h1>

        <section className="space-y-4">
          <h2 className="text-xl font-medium">npm (recommended)</h2>
          <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
            <code>npm install -g @tankpkg/cli</code>
          </pre>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium">Homebrew (macOS/Linux)</h2>
          <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
            <code>brew install tankpkg/tap/tank</code>
          </pre>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-medium">Nightly (latest from main)</h2>
          <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
            <code>npm install -g @tankpkg/cli@nightly</code>
          </pre>
        </section>
      </div>
    );
  }

  const installCmd = `curl -fsSL ${appUrl}/api/cli/install.sh | bash`;

  return (
    <div className="tank-shell py-10 max-w-3xl mx-auto space-y-8">
      <h1 className="text-3xl font-semibold">Install Tank CLI</h1>
      <p className="text-ink-soft">Download the CLI pre-configured to connect to this Tank instance.</p>

      <section className="space-y-4">
        <h2 className="text-xl font-medium">Quick Install</h2>
        <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto">
          <code>{installCmd}</code>
        </pre>
        <p className="text-sm text-ink-soft">
          This downloads the CLI binary and configures it to use <code>{appUrl}</code> as the registry.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-medium">Manual Download</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href={`${appUrl}/api/cli/download/linux-x64`}
            className="block rounded-lg border p-4 hover:bg-muted transition-colors">
            <div className="font-medium">Linux x64</div>
            <div className="text-sm text-ink-soft">AMD/Intel 64-bit</div>
          </a>
          <a
            href={`${appUrl}/api/cli/download/linux-arm64`}
            className="block rounded-lg border p-4 hover:bg-muted transition-colors">
            <div className="font-medium">Linux ARM64</div>
            <div className="text-sm text-ink-soft">ARM 64-bit (Graviton, etc.)</div>
          </a>
        </div>
        <p className="text-sm text-ink-soft">
          After downloading, run: <code>chmod +x tank &amp;&amp; sudo mv tank /usr/local/bin/</code>
        </p>
        <p className="text-sm text-ink-soft">
          Then configure: <code>echo '{`{"registry":"${appUrl}"}`}' &gt; ~/.tank/config.json</code>
        </p>
      </section>
    </div>
  );
}
