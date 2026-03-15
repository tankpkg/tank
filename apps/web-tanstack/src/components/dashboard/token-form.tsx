import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { createTokenFn } from '~/lib/auth/tokens';

const SCOPES = ['skills:read', 'skills:publish', 'skills:admin'] as const;

const EXPIRY_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '365 days', value: 365 }
] as const;

const tokenSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(100, 'Token name must be 100 characters or fewer'),
  scopes: z.array(z.string()).min(1, 'Select at least one scope'),
  expiresInDays: z.number().min(1).max(365)
});

interface TokenFormProps {
  onTokenCreated: (key: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}

export function TokenForm({ onTokenCreated, onError, onRefresh }: TokenFormProps) {
  const form = useForm({
    defaultValues: {
      name: '',
      scopes: ['skills:read'] as string[],
      expiresInDays: 90
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await createTokenFn({
          data: {
            name: value.name.trim(),
            expiresInDays: value.expiresInDays,
            scopes: value.scopes
          }
        });
        if (result && 'key' in result) {
          onTokenCreated(result.key as string);
        }
        form.reset();
        await onRefresh();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to create token');
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Token</CardTitle>
        <CardDescription>Generate a new API key for CLI authentication.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();

            const values = {
              name: form.getFieldValue('name'),
              scopes: form.getFieldValue('scopes'),
              expiresInDays: form.getFieldValue('expiresInDays')
            };
            const result = tokenSchema.safeParse(values);
            if (!result.success) {
              for (const issue of result.error.issues) {
                const field = issue.path?.[0];
                if (field && typeof field === 'string') {
                  form.setFieldMeta(field as 'name' | 'scopes' | 'expiresInDays', (prev) => ({
                    ...prev,
                    errorMap: { ...prev.errorMap, onChange: issue.message }
                  }));
                }
              }
              return;
            }

            form.handleSubmit();
          }}
          className="space-y-4">
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="token-name">Name</Label>
                <Input
                  id="token-name"
                  placeholder="e.g. CI/CD pipeline"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  maxLength={100}
                />
                {field.state.meta.errorMap.onChange && (
                  <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="scopes">
            {(field) => (
              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="flex flex-wrap gap-2">
                  {SCOPES.map((scope) => {
                    const selected = field.state.value.includes(scope);
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => {
                          const current = field.state.value;
                          if (selected) {
                            if (current.length > 1) {
                              field.handleChange(current.filter((s) => s !== scope));
                            }
                          } else {
                            field.handleChange([...current, scope]);
                          }
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                            : 'border-border text-muted-foreground hover:border-foreground/30'
                        }`}>
                        {scope}
                      </button>
                    );
                  })}
                </div>
                {field.state.meta.errorMap.onChange && (
                  <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="expiresInDays">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="token-expiry">Expiry</Label>
                <select
                  id="token-expiry"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  onBlur={field.handleBlur}
                  className="h-9 w-full max-w-50 rounded-md border border-input bg-transparent px-3 text-sm">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.name}>
            {(name) => (
              <Button type="submit" disabled={!name.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Create Token
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
