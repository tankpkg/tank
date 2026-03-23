import { Check, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

interface SettingsData {
  instanceUrl: string;
  storage: {
    backend: string;
    endpoint: string;
    publicEndpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    hasSecretKey: boolean;
    supabaseUrl: string;
    hasSupabaseServiceKey: boolean;
  };
  scanner: {
    provider: string;
    baseUrl: string;
    model: string;
    litellmUrl: string;
    hasApiKey: boolean;
  };
  auth: {
    githubEnabled: boolean;
    githubClientId: string;
    hasGithubSecret: boolean;
    oidcEnabled: boolean;
    oidcDiscoveryUrl: string;
    oidcClientId: string;
    hasOidcSecret: boolean;
    oidcProviderId: string;
  };
}

type SectionKey = 'instance' | 'storage' | 'scanner' | 'auth';

function StatusMessage({ status }: { status: { type: 'success' | 'error'; message: string } | null }) {
  if (!status) return null;
  const isError = status.type === 'error';
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        isError ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-tank/30 bg-tank/10 text-tank'
      }`}>
      {!isError && <Check className="size-4" />}
      {status.message}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]">
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SecretField({
  label,
  hasSaved,
  value,
  onChange,
  placeholder
}: {
  label: string;
  hasSaved: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (hasSaved && !editing) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-soft">••••••••• (saved)</span>
          <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || `Enter ${label.toLowerCase()}`}
      />
    </div>
  );
}

function SaveButton({ saving, section }: { saving: SectionKey | null; section: SectionKey }) {
  const isSaving = saving === section;
  return (
    <Button type="submit" disabled={isSaving} size="sm">
      {isSaving && <Loader2 className="size-4 animate-spin" />}
      {isSaving ? 'Saving...' : 'Save'}
    </Button>
  );
}

export function AdminSettingsScreen() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<SectionKey | null>(null);
  const [sectionStatus, setSectionStatus] = useState<
    Record<SectionKey, { type: 'success' | 'error'; message: string } | null>
  >({
    instance: null,
    storage: null,
    scanner: null,
    auth: null
  });

  const [instanceUrl, setInstanceUrl] = useState('');
  const [storageBackend, setStorageBackend] = useState('');
  const [storageEndpoint, setStorageEndpoint] = useState('');
  const [storagePublicEndpoint, setStoragePublicEndpoint] = useState('');
  const [storageRegion, setStorageRegion] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [storageAccessKey, setStorageAccessKey] = useState('');
  const [storageSecretKey, setStorageSecretKey] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');

  const [scannerProvider, setScannerProvider] = useState('disabled');
  const [scannerApiKey, setScannerApiKey] = useState('');
  const [scannerBaseUrl, setScannerBaseUrl] = useState('');
  const [scannerModel, setScannerModel] = useState('');
  const [scannerLitellmUrl, setScannerLitellmUrl] = useState('');

  const [githubEnabled, setGithubEnabled] = useState(false);
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcDiscoveryUrl, setOidcDiscoveryUrl] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcProviderId, setOidcProviderId] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load settings');
      }
      const data: SettingsData = await res.json();
      setSettings(data);
      setInstanceUrl(data.instanceUrl);
      setStorageBackend(data.storage.backend);
      setStorageEndpoint(data.storage.endpoint);
      setStoragePublicEndpoint(data.storage.publicEndpoint);
      setStorageRegion(data.storage.region);
      setStorageBucket(data.storage.bucket);
      setStorageAccessKey(data.storage.accessKey);
      setSupabaseUrl(data.storage.supabaseUrl);
      setScannerProvider(data.scanner.provider);
      setScannerBaseUrl(data.scanner.baseUrl);
      setScannerModel(data.scanner.model);
      setScannerLitellmUrl(data.scanner.litellmUrl);
      setGithubEnabled(data.auth.githubEnabled);
      setGithubClientId(data.auth.githubClientId);
      setOidcEnabled(data.auth.oidcEnabled);
      setOidcDiscoveryUrl(data.auth.oidcDiscoveryUrl);
      setOidcClientId(data.auth.oidcClientId);
      setOidcProviderId(data.auth.oidcProviderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSection = async (section: SectionKey, body: Record<string, unknown>) => {
    setSaving(section);
    setSectionStatus((prev) => ({ ...prev, [section]: null }));
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Save failed');
      }
      setSectionStatus((prev) => ({ ...prev, [section]: { type: 'success', message: 'Saved successfully' } }));
      await loadSettings();
    } catch (e) {
      setSectionStatus((prev) => ({
        ...prev,
        [section]: { type: 'error', message: e instanceof Error ? e.message : 'Save failed' }
      }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <section className="tank-shell py-10">
        <div className="flex items-center gap-2 text-ink-soft">
          <Loader2 className="size-4 animate-spin" />
          Loading settings...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="tank-shell py-10">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </section>
    );
  }

  const isS3Backend = ['s3', 'minio', 's3-compatible'].includes(storageBackend);
  const isSupabaseBackend = storageBackend === 'supabase';

  return (
    <section className="tank-shell py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-ink-soft">Manage instance configuration. Changes apply at runtime.</p>
      </div>

      {/* Instance URL */}
      <Card>
        <CardHeader>
          <CardTitle>Instance URL</CardTitle>
          <CardDescription>The public URL of this Tank instance.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSection('instance', { instanceUrl });
            }}
            className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instanceUrl">URL</Label>
              <Input
                id="instanceUrl"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                placeholder="https://tank.example.com"
              />
            </div>
            <div className="flex items-center gap-3">
              <SaveButton saving={saving} section="instance" />
              <StatusMessage status={sectionStatus.instance} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Storage */}
      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>Configure where skill packages are stored.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const payload: Record<string, unknown> = {
                storage: {
                  backend: storageBackend,
                  endpoint: storageEndpoint,
                  publicEndpoint: storagePublicEndpoint,
                  region: storageRegion,
                  bucket: storageBucket,
                  accessKey: storageAccessKey,
                  ...(storageSecretKey ? { secretKey: storageSecretKey } : {}),
                  supabaseUrl,
                  ...(supabaseServiceKey ? { supabaseServiceKey } : {})
                }
              };
              saveSection('storage', payload);
            }}
            className="space-y-4">
            <SelectField
              label="Backend"
              value={storageBackend}
              onChange={setStorageBackend}
              options={[
                { value: 's3', label: 'Amazon S3' },
                { value: 'minio', label: 'MinIO' },
                { value: 's3-compatible', label: 'S3-Compatible' },
                { value: 'supabase', label: 'Supabase Storage' },
                { value: 'filesystem', label: 'Filesystem' }
              ]}
            />

            {isS3Backend && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="storageEndpoint">Endpoint</Label>
                  <Input
                    id="storageEndpoint"
                    value={storageEndpoint}
                    onChange={(e) => setStorageEndpoint(e.target.value)}
                    placeholder="https://s3.amazonaws.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storagePublicEndpoint">Public Endpoint</Label>
                  <Input
                    id="storagePublicEndpoint"
                    value={storagePublicEndpoint}
                    onChange={(e) => setStoragePublicEndpoint(e.target.value)}
                    placeholder="https://cdn.example.com (for signed download URLs)"
                  />
                  <p className="text-xs text-ink-soft">
                    Used for generating download URLs accessible to clients. Leave empty to use the main endpoint.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storageRegion">Region</Label>
                  <Input
                    id="storageRegion"
                    value={storageRegion}
                    onChange={(e) => setStorageRegion(e.target.value)}
                    placeholder="us-east-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storageBucket">Bucket</Label>
                  <Input
                    id="storageBucket"
                    value={storageBucket}
                    onChange={(e) => setStorageBucket(e.target.value)}
                    placeholder="tank-packages"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storageAccessKey">Access Key</Label>
                  <Input
                    id="storageAccessKey"
                    value={storageAccessKey}
                    onChange={(e) => setStorageAccessKey(e.target.value)}
                    placeholder="AKIA..."
                  />
                </div>
                <SecretField
                  label="Secret Key"
                  hasSaved={settings?.storage.hasSecretKey ?? false}
                  value={storageSecretKey}
                  onChange={setStorageSecretKey}
                />
              </>
            )}

            {isSupabaseBackend && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="supabaseUrl">Supabase URL</Label>
                  <Input
                    id="supabaseUrl"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://xxx.supabase.co"
                  />
                </div>
                <SecretField
                  label="Supabase Service Key"
                  hasSaved={settings?.storage.hasSupabaseServiceKey ?? false}
                  value={supabaseServiceKey}
                  onChange={setSupabaseServiceKey}
                />
              </>
            )}

            {storageBackend === 'filesystem' && (
              <p className="text-sm text-ink-soft">
                Filesystem storage uses the local disk. Packages are stored at the path configured via STORAGE_FS_PATH
                environment variable.
              </p>
            )}

            <div className="flex items-center gap-3">
              <SaveButton saving={saving} section="storage" />
              <StatusMessage status={sectionStatus.storage} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Scanner */}
      <Card>
        <CardHeader>
          <CardTitle>Security Scanner</CardTitle>
          <CardDescription>Configure the LLM-powered security analysis provider.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSection('scanner', {
                scanner: {
                  provider: scannerProvider,
                  ...(scannerApiKey ? { apiKey: scannerApiKey } : {}),
                  baseUrl: scannerBaseUrl,
                  model: scannerModel,
                  litellmUrl: scannerLitellmUrl
                }
              });
            }}
            className="space-y-4">
            <SelectField
              label="Provider"
              value={scannerProvider}
              onChange={setScannerProvider}
              options={[
                { value: 'disabled', label: 'Disabled' },
                { value: 'groq', label: 'Groq' },
                { value: 'openrouter', label: 'OpenRouter' },
                { value: 'litellm', label: 'LiteLLM' },
                { value: 'custom', label: 'Custom (OpenAI-compatible)' }
              ]}
            />

            {scannerProvider !== 'disabled' && (
              <>
                <SecretField
                  label="API Key"
                  hasSaved={settings?.scanner.hasApiKey ?? false}
                  value={scannerApiKey}
                  onChange={setScannerApiKey}
                />

                {scannerProvider === 'custom' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="scannerBaseUrl">Base URL</Label>
                      <Input
                        id="scannerBaseUrl"
                        value={scannerBaseUrl}
                        onChange={(e) => setScannerBaseUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scannerModel">Model</Label>
                      <Input
                        id="scannerModel"
                        value={scannerModel}
                        onChange={(e) => setScannerModel(e.target.value)}
                        placeholder="gpt-4o"
                      />
                    </div>
                  </>
                )}

                {scannerProvider === 'litellm' && (
                  <div className="space-y-2">
                    <Label htmlFor="scannerLitellmUrl">LiteLLM URL</Label>
                    <Input
                      id="scannerLitellmUrl"
                      value={scannerLitellmUrl}
                      onChange={(e) => setScannerLitellmUrl(e.target.value)}
                      placeholder="http://litellm:4000"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-3">
              <SaveButton saving={saving} section="scanner" />
              <StatusMessage status={sectionStatus.scanner} />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Auth Providers */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Providers</CardTitle>
          <CardDescription>
            Configure external authentication providers. Email/password is always enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSection('auth', {
                auth: {
                  githubEnabled,
                  githubClientId,
                  ...(githubClientSecret ? { githubClientSecret } : {}),
                  oidcEnabled,
                  oidcDiscoveryUrl,
                  oidcClientId,
                  ...(oidcClientSecret ? { oidcClientSecret } : {}),
                  oidcProviderId
                }
              });
            }}
            className="space-y-6">
            {/* GitHub */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="githubEnabled"
                  checked={githubEnabled}
                  onChange={(e) => setGithubEnabled(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                <Label htmlFor="githubEnabled">Enable GitHub OAuth</Label>
              </div>

              {githubEnabled && (
                <div className="ml-7 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="githubClientId">Client ID</Label>
                    <Input
                      id="githubClientId"
                      value={githubClientId}
                      onChange={(e) => setGithubClientId(e.target.value)}
                      placeholder="Ov23li..."
                    />
                  </div>
                  <SecretField
                    label="Client Secret"
                    hasSaved={settings?.auth.hasGithubSecret ?? false}
                    value={githubClientSecret}
                    onChange={setGithubClientSecret}
                  />
                </div>
              )}
            </div>

            {/* OIDC */}
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="oidcEnabled"
                  checked={oidcEnabled}
                  onChange={(e) => setOidcEnabled(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                <Label htmlFor="oidcEnabled">Enable OIDC / Enterprise SSO</Label>
              </div>

              {oidcEnabled && (
                <div className="ml-7 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="oidcDiscoveryUrl">Discovery URL</Label>
                    <Input
                      id="oidcDiscoveryUrl"
                      value={oidcDiscoveryUrl}
                      onChange={(e) => setOidcDiscoveryUrl(e.target.value)}
                      placeholder="https://idp.example.com/.well-known/openid-configuration"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oidcClientId">Client ID</Label>
                    <Input id="oidcClientId" value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} />
                  </div>
                  <SecretField
                    label="Client Secret"
                    hasSaved={settings?.auth.hasOidcSecret ?? false}
                    value={oidcClientSecret}
                    onChange={setOidcClientSecret}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="oidcProviderId">Provider ID</Label>
                    <Input
                      id="oidcProviderId"
                      value={oidcProviderId}
                      onChange={(e) => setOidcProviderId(e.target.value)}
                      placeholder="enterprise-oidc"
                    />
                    <p className="text-xs text-ink-soft">Identifier used in login URLs. Default: enterprise-oidc</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <SaveButton saving={saving} section="auth" />
              <StatusMessage status={sectionStatus.auth} />
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
