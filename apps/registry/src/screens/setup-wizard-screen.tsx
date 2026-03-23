import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

const STEPS = [
  { title: 'Database', description: 'Connect and initialize your database' },
  { title: 'Instance URL', description: 'Set the public URL for this instance' },
  { title: 'Storage', description: 'Verify MinIO object storage connectivity' },
  { title: 'Admin Account', description: 'Create the initial administrator account' },
  { title: 'Auth Providers', description: 'Configure optional OAuth and SSO providers' },
  { title: 'Scanner LLM', description: 'Configure the AI model for skill scanning' },
  { title: 'Complete', description: 'Review and finalize your setup' }
];

type LLMProvider = 'groq' | 'openrouter' | 'litellm' | 'custom' | 'disabled';

interface StepState {
  db: {
    url: string;
    tested: boolean;
    initialized: boolean;
    checked: boolean;
    tableCount: number;
    hasTankTables: boolean;
    hasSystemConfig: boolean;
    confirmed: boolean;
    tables: string[];
  };
  instanceUrl: { url: string };
  storage: {
    backend: 'minio' | 's3' | 'supabase' | 's3-compatible' | 'filesystem';
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    supabaseUrl: string;
    supabaseServiceKey: string;
    tested: boolean;
    saved: boolean;
  };
  admin: { email: string; password: string; confirmPassword: string };
  auth: {
    githubEnabled: boolean;
    githubClientId: string;
    githubClientSecret: string;
    oidcEnabled: boolean;
    oidcDiscoveryUrl: string;
    oidcClientId: string;
    oidcClientSecret: string;
  };
  llm: { provider: LLMProvider; apiKey: string; baseUrl: string; tested: boolean };
}

function ProgressIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static step indicators never reorder
        <div key={i} className="flex items-center">
          <div
            className={[
              'flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
              i < current
                ? 'bg-primary text-primary-foreground'
                : i === current
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                  : 'bg-muted text-muted-foreground'
            ].join(' ')}>
            {i < current ? (
              <svg className="size-4" viewBox="0 0 16 16" fill="none" role="img" aria-label="completed">
                <path
                  d="M3 8l3.5 3.5L13 4.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          {i < total - 1 && (
            <div className={['h-px w-8 transition-colors', i < current ? 'bg-primary' : 'bg-border'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  );
}

function SuccessBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-emerald-500">
      <svg className="size-4" viewBox="0 0 16 16" fill="none" role="img" aria-label="success">
        <path
          d="M3 8l3.5 3.5L13 4.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </div>
  );
}

function DbTableList({ tables }: { tables: string[] }) {
  const [open, setOpen] = useState(false);
  if (tables.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'Show'} {tables.length} tables
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tables.map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      <p>{message}</p>
    </div>
  );
}

function InstanceUrlStep({
  state,
  setState,
  loading
}: {
  state: StepState;
  setState: React.Dispatch<React.SetStateAction<StepState>>;
  loading: boolean;
}) {
  const [addresses, setAddresses] = useState<{ label: string; url: string }[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (fetched) return;
    fetch('/api/setup/detect-network')
      .then((r) => r.json())
      .then((data) => {
        setAddresses(data.addresses || []);
        setFetched(true);
      })
      .catch(() => setFetched(true));
  }, [fetched]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="instance-url">Public URL</Label>
        <Input
          id="instance-url"
          placeholder="https://tank.company.com"
          value={state.instanceUrl.url}
          onChange={(e) => setState((s) => ({ ...s, instanceUrl: { url: e.target.value } }))}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          This is how users and the CLI will access Tank. Pre-filled with your current browser URL.
        </p>
      </div>
      {addresses.length > 0 && (
        <div className="space-y-2">
          <Label>Detected addresses</Label>
          <div className="flex flex-wrap gap-1.5">
            {addresses.map((addr) => (
              <button
                key={addr.url}
                type="button"
                className={[
                  'rounded-md border px-2.5 py-1 text-xs transition-colors',
                  state.instanceUrl.url === addr.url
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                ].join(' ')}
                onClick={() => setState((s) => ({ ...s, instanceUrl: { url: addr.url } }))}>
                {addr.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Click an address, or type a custom URL above if using a reverse proxy or custom domain.
          </p>
        </div>
      )}
    </div>
  );
}

export function SetupWizardScreen() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envDbDetected, setEnvDbDetected] = useState(false);

  const [state, setState] = useState<StepState>({
    db: {
      url: '',
      tested: false,
      initialized: false,
      checked: false,
      tableCount: 0,
      hasTankTables: false,
      hasSystemConfig: false,
      confirmed: false,
      tables: []
    },
    instanceUrl: { url: typeof window !== 'undefined' ? window.location.origin : '' },
    storage: {
      backend: 'minio',
      endpoint: '',
      region: 'us-east-1',
      bucket: 'packages',
      accessKey: '',
      secretKey: '',
      supabaseUrl: '',
      supabaseServiceKey: '',
      tested: false,
      saved: false
    },
    admin: { email: '', password: '', confirmPassword: '' },
    auth: {
      githubEnabled: false,
      githubClientId: '',
      githubClientSecret: '',
      oidcEnabled: false,
      oidcDiscoveryUrl: '',
      oidcClientId: '',
      oidcClientSecret: ''
    },
    llm: { provider: 'disabled', apiKey: '', baseUrl: '', tested: false }
  });

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.defaults?.hasDatabaseUrl && data.defaults.databaseUrl) {
          setState((s) => ({
            ...s,
            db: { ...s.db, url: data.defaults.databaseUrl }
          }));
          setEnvDbDetected(true);
        }
        const sd = data.defaults?.storage;
        if (sd?.backend) {
          setState((s) => {
            let uiBackend: StepState['storage']['backend'] = s.storage.backend;
            if (sd.backend === 'filesystem') uiBackend = 'filesystem';
            else if (sd.backend === 'supabase') uiBackend = 'supabase';
            else if (sd.backend === 's3' && sd.endpoint) uiBackend = 'minio';
            else if (sd.backend === 's3') uiBackend = 's3';

            return {
              ...s,
              storage: {
                ...s.storage,
                backend: uiBackend,
                endpoint: sd.endpoint || s.storage.endpoint,
                region: sd.region || s.storage.region,
                bucket: sd.bucket || s.storage.bucket,
                accessKey: sd.accessKey || s.storage.accessKey,
                supabaseUrl: sd.supabaseUrl || s.storage.supabaseUrl
              }
            };
          });
        }
      })
      .catch(() => {});
  }, []);

  const post = async (path: string, body?: unknown) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
    return data;
  };

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setError(null);

    if (step === 0) {
      if (!state.db.initialized && !state.db.hasSystemConfig) {
        setError('Please test and initialize the database before continuing.');
        return;
      }
    }

    if (step === 1) {
      await run(async () => {
        await post('/api/setup/instance-url', { instanceUrl: state.instanceUrl.url });
        setStep(2);
      });
      return;
    }

    if (step === 2) {
      if (!state.storage.tested) {
        setError('Please test storage connectivity before continuing.');
        return;
      }
      if (!state.storage.saved) {
        await run(async () => {
          const s = state.storage;
          await post('/api/setup/storage', {
            backend: s.backend === 'minio' ? 's3' : s.backend,
            endpoint: s.endpoint || undefined,
            region: s.region || undefined,
            bucket: s.bucket || undefined,
            accessKey: s.accessKey || undefined,
            secretKey: s.secretKey || undefined,
            supabaseUrl: s.supabaseUrl || undefined,
            supabaseServiceKey: s.supabaseServiceKey || undefined
          });
          setState((prev) => ({ ...prev, storage: { ...prev.storage, saved: true } }));
          setStep(3);
        });
        return;
      }
    }

    if (step === 3) {
      if (!state.admin.email) {
        setError('Email is required.');
        return;
      }
      if (state.admin.password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (state.admin.password !== state.admin.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      await run(async () => {
        await post('/api/setup/admin', { email: state.admin.email, password: state.admin.password });
        setStep(4);
      });
      return;
    }

    if (step === 4) {
      if (!state.auth.githubEnabled && !state.auth.oidcEnabled) {
        setStep(5);
        return;
      }
      await run(async () => {
        await post('/api/setup/auth-providers', {
          githubEnabled: state.auth.githubEnabled,
          githubClientId: state.auth.githubClientId || undefined,
          githubClientSecret: state.auth.githubClientSecret || undefined,
          oidcEnabled: state.auth.oidcEnabled,
          oidcDiscoveryUrl: state.auth.oidcDiscoveryUrl || undefined,
          oidcClientId: state.auth.oidcClientId || undefined,
          oidcClientSecret: state.auth.oidcClientSecret || undefined
        });
        setStep(5);
      });
      return;
    }

    if (step === 5) {
      await run(async () => {
        await post('/api/setup/scanner-llm', {
          provider: state.llm.provider,
          apiKey: state.llm.apiKey || undefined,
          baseUrl: state.llm.baseUrl || undefined
        });
        setStep(6);
      });
      return;
    }

    if (step === 6) {
      await run(async () => {
        await post('/api/setup/complete');
        window.location.href = '/';
      });
      return;
    }

    setStep((s) => s + 1);
  };

  const db = state.db;
  const auth = state.auth;
  const llm = state.llm;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground">Tank Setup</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your on-premises instance</p>
        </div>

        <ProgressIndicator current={step} total={STEPS.length} />

        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                {step + 1}
              </div>
              <div>
                <CardTitle>{STEPS[step]?.title}</CardTitle>
                <CardDescription className="mt-0.5">{STEPS[step]?.description}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                {envDbDetected && (
                  <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-sm">
                    <span className="text-primary font-medium">Database detected from environment.</span>
                    <span className="text-muted-foreground">
                      {' '}
                      You can test and initialize it directly, or change the connection below.
                    </span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="db-provider">Provider</Label>
                  <select
                    id="db-provider"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onChange={(e) => {
                      const templates: Record<string, string> = {
                        docker: 'postgresql://tank:change-this-password@postgres:5432/tank',
                        supabase:
                          'postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres',
                        neon: 'postgresql://[user]:[password]@[endpoint].neon.tech/[database]?sslmode=require',
                        rds: 'postgresql://[user]:[password]@[instance].[region].rds.amazonaws.com:5432/[database]',
                        azure:
                          'postgresql://[user]:[password]@[server].postgres.database.azure.com:5432/[database]?sslmode=require',
                        railway: 'postgresql://postgres:[password]@[host].railway.internal:5432/railway',
                        render: 'postgresql://[user]:[password]@[host].render.com:5432/[database]',
                        custom: ''
                      };
                      const val = templates[e.target.value] ?? '';
                      setState((s) => ({
                        ...s,
                        db: { ...s.db, url: val, tested: false, initialized: false, checked: false, confirmed: false }
                      }));
                    }}
                    disabled={loading}>
                    <option value="docker">Docker Compose (default)</option>
                    <option value="supabase">Supabase</option>
                    <option value="neon">Neon</option>
                    <option value="rds">AWS RDS</option>
                    <option value="azure">Azure Database</option>
                    <option value="railway">Railway</option>
                    <option value="render">Render</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="db-url">Connection String</Label>
                  <Input
                    id="db-url"
                    placeholder="postgresql://user:pass@host:5432/tank"
                    value={db.url}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        db: {
                          ...s.db,
                          url: e.target.value,
                          tested: false,
                          initialized: false,
                          checked: false,
                          confirmed: false
                        }
                      }))
                    }
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    {db.url
                      ? db.url.replace(/:[^:@/]+@/, ':***@')
                      : 'Select a provider above or type a connection string'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || (!db.url && !envDbDetected)}
                    onClick={() =>
                      run(async () => {
                        const connPayload = envDbDetected ? { useEnv: true } : { databaseUrl: db.url };
                        await post('/api/setup/test-db', connPayload);
                        setState((s) => ({ ...s, db: { ...s.db, tested: true } }));
                        const checkResult = await post('/api/setup/check-db', connPayload);
                        setState((s) => ({
                          ...s,
                          db: {
                            ...s.db,
                            checked: true,
                            tableCount: checkResult.tableCount ?? 0,
                            tables: checkResult.tables ?? [],
                            hasTankTables: checkResult.hasTankTables ?? false,
                            hasSystemConfig: checkResult.hasSystemConfig ?? false
                          }
                        }));
                      })
                    }>
                    {loading ? 'Testing…' : 'Test Connection'}
                  </Button>
                  {db.tested && db.checked && (db.tableCount === 0 || db.confirmed) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() =>
                        run(async () => {
                          await post('/api/setup/init-db');
                          setState((s) => ({ ...s, db: { ...s.db, initialized: true } }));
                        })
                      }>
                      {loading ? 'Initializing…' : 'Initialize Schema'}
                    </Button>
                  )}
                </div>
                {db.tested && !db.checked && <SuccessBadge label="Connection successful, checking database…" />}

                {db.tested && db.checked && db.tableCount === 0 && !db.initialized && (
                  <SuccessBadge label="Connection successful — database is empty, ready to initialize" />
                )}

                {db.tested && db.checked && db.hasSystemConfig && !db.initialized && (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm space-y-2">
                    <p className="font-medium text-emerald-500">Database already configured</p>
                    <p className="text-muted-foreground">
                      Found an existing Tank database with {db.tableCount} tables. You can continue to the next step or
                      re-initialize to update the schema.
                    </p>
                    <DbTableList tables={db.tables} />
                  </div>
                )}

                {db.tested && db.checked && db.tableCount > 0 && !db.hasSystemConfig && !db.confirmed && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-2">
                    <p className="font-medium text-amber-500">
                      This database has {db.tableCount} existing table{db.tableCount !== 1 ? 's' : ''}
                    </p>
                    {db.hasTankTables ? (
                      <p className="text-muted-foreground">
                        Tank tables detected but setup hasn't completed. Initialize to update the schema (existing data
                        is preserved).
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        These don't look like Tank tables. Initializing will add Tank tables alongside the existing
                        ones. Make sure this is the right database.
                      </p>
                    )}
                    <DbTableList tables={db.tables} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setState((s) => ({ ...s, db: { ...s.db, confirmed: true } }))}>
                      {db.hasTankTables ? 'Continue with this database' : 'Yes, use this database'}
                    </Button>
                  </div>
                )}

                {db.tested &&
                  db.checked &&
                  db.tableCount > 0 &&
                  !db.hasSystemConfig &&
                  db.confirmed &&
                  !db.initialized && <SuccessBadge label="Database confirmed — ready to initialize" />}

                {db.initialized && <SuccessBadge label="Database initialized" />}
              </>
            )}

            {step === 1 && <InstanceUrlStep state={state} setState={setState} loading={loading} />}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="storage-backend">Provider</Label>
                  <select
                    id="storage-backend"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={state.storage.backend}
                    onChange={(e) => {
                      const backend = e.target.value as StepState['storage']['backend'];
                      const defaults: Record<string, Partial<StepState['storage']>> = {
                        minio: {
                          endpoint: 'http://minio:9000',
                          region: 'us-east-1',
                          bucket: 'packages',
                          accessKey: '',
                          secretKey: ''
                        },
                        s3: { endpoint: '', region: 'us-east-1', bucket: '', accessKey: '', secretKey: '' },
                        's3-compatible': {
                          endpoint: '',
                          region: 'us-east-1',
                          bucket: '',
                          accessKey: '',
                          secretKey: ''
                        },
                        supabase: { supabaseUrl: '', supabaseServiceKey: '' },
                        filesystem: {}
                      };
                      setState((s) => ({
                        ...s,
                        storage: { ...s.storage, ...defaults[backend], backend, tested: false, saved: false }
                      }));
                    }}
                    disabled={loading}>
                    <option value="minio">MinIO (Docker Compose)</option>
                    <option value="s3">AWS S3</option>
                    <option value="s3-compatible">S3-Compatible (R2, DigitalOcean, Backblaze)</option>
                    <option value="supabase">Supabase Storage</option>
                    <option value="filesystem">Local Filesystem</option>
                  </select>
                </div>

                {(['minio', 's3', 's3-compatible'] as string[]).includes(state.storage.backend) && (
                  <>
                    {state.storage.backend !== 's3' && (
                      <div className="space-y-2">
                        <Label htmlFor="storage-endpoint">Endpoint URL</Label>
                        <Input
                          id="storage-endpoint"
                          placeholder={
                            state.storage.backend === 'minio'
                              ? 'http://minio:9000'
                              : 'https://s3.us-east-1.amazonaws.com'
                          }
                          value={state.storage.endpoint}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              storage: { ...s.storage, endpoint: e.target.value, tested: false, saved: false }
                            }))
                          }
                          disabled={loading}
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="storage-region">Region</Label>
                        <Input
                          id="storage-region"
                          placeholder="us-east-1"
                          value={state.storage.region}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              storage: { ...s.storage, region: e.target.value, tested: false, saved: false }
                            }))
                          }
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="storage-bucket">Bucket</Label>
                        <Input
                          id="storage-bucket"
                          placeholder="packages"
                          value={state.storage.bucket}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              storage: { ...s.storage, bucket: e.target.value, tested: false, saved: false }
                            }))
                          }
                          disabled={loading}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="storage-access-key">Access Key</Label>
                        <Input
                          id="storage-access-key"
                          placeholder="Access key ID"
                          value={state.storage.accessKey}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              storage: { ...s.storage, accessKey: e.target.value, tested: false, saved: false }
                            }))
                          }
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="storage-secret-key">Secret Key</Label>
                        <Input
                          id="storage-secret-key"
                          type="password"
                          placeholder="Secret access key"
                          value={state.storage.secretKey}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              storage: { ...s.storage, secretKey: e.target.value, tested: false, saved: false }
                            }))
                          }
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </>
                )}

                {state.storage.backend === 'supabase' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="supabase-url">Supabase URL</Label>
                      <Input
                        id="supabase-url"
                        placeholder="https://your-project.supabase.co"
                        value={state.storage.supabaseUrl}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            storage: { ...s.storage, supabaseUrl: e.target.value, tested: false, saved: false }
                          }))
                        }
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supabase-key">Service Role Key</Label>
                      <Input
                        id="supabase-key"
                        type="password"
                        placeholder="eyJhbGci..."
                        value={state.storage.supabaseServiceKey}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            storage: { ...s.storage, supabaseServiceKey: e.target.value, tested: false, saved: false }
                          }))
                        }
                        disabled={loading}
                      />
                    </div>
                  </>
                )}

                {state.storage.backend === 'filesystem' && (
                  <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-sm">
                    <p className="text-muted-foreground">
                      Files will be stored at <code className="font-mono text-foreground">/app/data/packages</code>{' '}
                      inside the container. Mount a Docker volume to persist data. No additional configuration needed.
                    </p>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() =>
                    run(async () => {
                      const s = state.storage;
                      await post('/api/setup/test-storage', {
                        backend: s.backend,
                        endpoint: s.endpoint || undefined,
                        region: s.region || undefined,
                        bucket: s.bucket || undefined,
                        accessKey: s.accessKey || undefined,
                        secretKey: s.secretKey || undefined,
                        supabaseUrl: s.supabaseUrl || undefined,
                        supabaseServiceKey: s.supabaseServiceKey || undefined
                      });
                      setState((prev) => ({ ...prev, storage: { ...prev.storage, tested: true } }));
                    })
                  }>
                  {loading ? 'Testing…' : 'Test Storage'}
                </Button>
                {state.storage.tested && <SuccessBadge label="Storage reachable" />}
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="admin@company.com"
                    value={state.admin.email}
                    onChange={(e) => setState((s) => ({ ...s, admin: { ...s.admin, email: e.target.value } }))}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={state.admin.password}
                    onChange={(e) => setState((s) => ({ ...s, admin: { ...s.admin, password: e.target.value } }))}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-confirm">Confirm Password</Label>
                  <Input
                    id="admin-confirm"
                    type="password"
                    placeholder="Repeat password"
                    value={state.admin.confirmPassword}
                    onChange={(e) =>
                      setState((s) => ({ ...s, admin: { ...s.admin, confirmPassword: e.target.value } }))
                    }
                    disabled={loading}
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Email/password login is always enabled. Optionally add OAuth or SSO below, or click Continue to skip.
                </p>
                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="github-toggle"
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={auth.githubEnabled}
                      onChange={(e) =>
                        setState((s) => ({ ...s, auth: { ...s.auth, githubEnabled: e.target.checked } }))
                      }
                    />
                    <Label htmlFor="github-toggle" className="font-semibold">
                      GitHub OAuth
                    </Label>
                  </div>
                  {auth.githubEnabled && (
                    <div className="space-y-3 pl-6">
                      <div className="space-y-2">
                        <Label htmlFor="gh-client-id">Client ID</Label>
                        <Input
                          id="gh-client-id"
                          placeholder="Ov23li..."
                          value={auth.githubClientId}
                          onChange={(e) =>
                            setState((s) => ({ ...s, auth: { ...s.auth, githubClientId: e.target.value } }))
                          }
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gh-client-secret">Client Secret</Label>
                        <Input
                          id="gh-client-secret"
                          type="password"
                          placeholder="••••••••"
                          value={auth.githubClientSecret}
                          onChange={(e) =>
                            setState((s) => ({ ...s, auth: { ...s.auth, githubClientSecret: e.target.value } }))
                          }
                          disabled={loading}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="oidc-toggle"
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={auth.oidcEnabled}
                      onChange={(e) => setState((s) => ({ ...s, auth: { ...s.auth, oidcEnabled: e.target.checked } }))}
                    />
                    <Label htmlFor="oidc-toggle" className="font-semibold">
                      OIDC / SSO
                    </Label>
                  </div>
                  {auth.oidcEnabled && (
                    <div className="space-y-3 pl-6">
                      <div className="space-y-2">
                        <Label htmlFor="oidc-discovery">Discovery URL</Label>
                        <Input
                          id="oidc-discovery"
                          placeholder="https://accounts.google.com/.well-known/openid-configuration"
                          value={auth.oidcDiscoveryUrl}
                          onChange={(e) =>
                            setState((s) => ({ ...s, auth: { ...s.auth, oidcDiscoveryUrl: e.target.value } }))
                          }
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oidc-client-id">Client ID</Label>
                        <Input
                          id="oidc-client-id"
                          placeholder="client_id"
                          value={auth.oidcClientId}
                          onChange={(e) =>
                            setState((s) => ({ ...s, auth: { ...s.auth, oidcClientId: e.target.value } }))
                          }
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oidc-client-secret">Client Secret</Label>
                        <Input
                          id="oidc-client-secret"
                          type="password"
                          placeholder="••••••••"
                          value={auth.oidcClientSecret}
                          onChange={(e) =>
                            setState((s) => ({ ...s, auth: { ...s.auth, oidcClientSecret: e.target.value } }))
                          }
                          disabled={loading}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="llm-provider">Provider</Label>
                  <select
                    id="llm-provider"
                    className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow]"
                    value={llm.provider}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        llm: { ...s.llm, provider: e.target.value as LLMProvider, tested: false }
                      }))
                    }
                    disabled={loading}>
                    <option value="disabled">Disabled</option>
                    <option value="groq">Groq</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="litellm">LiteLLM</option>
                    <option value="custom">Custom (OpenAI-compatible)</option>
                  </select>
                </div>

                {llm.provider !== 'disabled' && (
                  <>
                    {(llm.provider === 'groq' || llm.provider === 'openrouter') && (
                      <div className="space-y-2">
                        <Label htmlFor="llm-api-key">API Key</Label>
                        <Input
                          id="llm-api-key"
                          type="password"
                          placeholder="sk-..."
                          value={llm.apiKey}
                          onChange={(e) =>
                            setState((s) => ({ ...s, llm: { ...s.llm, apiKey: e.target.value, tested: false } }))
                          }
                          disabled={loading}
                        />
                      </div>
                    )}
                    {(llm.provider === 'litellm' || llm.provider === 'custom') && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="llm-base-url">Base URL</Label>
                          <Input
                            id="llm-base-url"
                            placeholder="http://litellm:4000/v1"
                            value={llm.baseUrl}
                            onChange={(e) =>
                              setState((s) => ({ ...s, llm: { ...s.llm, baseUrl: e.target.value, tested: false } }))
                            }
                            disabled={loading}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="llm-api-key-2">API Key (optional)</Label>
                          <Input
                            id="llm-api-key-2"
                            type="password"
                            placeholder="sk-..."
                            value={llm.apiKey}
                            onChange={(e) =>
                              setState((s) => ({ ...s, llm: { ...s.llm, apiKey: e.target.value, tested: false } }))
                            }
                            disabled={loading}
                          />
                        </div>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() =>
                        run(async () => {
                          await post('/api/setup/test-llm', {
                            provider: llm.provider,
                            apiKey: llm.apiKey || undefined,
                            baseUrl: llm.baseUrl || undefined
                          });
                          setState((s) => ({ ...s, llm: { ...s.llm, tested: true } }));
                        })
                      }>
                      {loading ? 'Testing…' : 'Test Connection'}
                    </Button>
                    {llm.tested && <SuccessBadge label="LLM reachable" />}
                  </>
                )}
              </>
            )}

            {step === 6 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your instance is ready to be finalized. Review the configuration below.
                </p>
                <div className="rounded-md border divide-y divide-border text-sm">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Database</span>
                    <SuccessBadge label="Initialized" />
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Instance URL</span>
                    <span className="font-mono text-xs truncate max-w-[200px]">{state.instanceUrl.url}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Storage</span>
                    <SuccessBadge label="Verified" />
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Admin</span>
                    <span className="truncate max-w-[200px]">{state.admin.email}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">GitHub OAuth</span>
                    <span>{auth.githubEnabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">OIDC / SSO</span>
                    <span>{auth.oidcEnabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Scanner LLM</span>
                    <span className="capitalize">{llm.provider}</span>
                  </div>
                </div>
              </div>
            )}

            {error && <ErrorMessage message={error} />}

            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={step === 0 || loading}
                onClick={() => {
                  setError(null);
                  setStep((s) => s - 1);
                }}>
                Back
              </Button>
              <Button size="sm" disabled={loading} onClick={handleContinue}>
                {loading ? 'Please wait…' : step === 6 ? 'Complete Setup' : 'Continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
