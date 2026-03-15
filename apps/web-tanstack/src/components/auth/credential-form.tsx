import { useForm } from '@tanstack/react-form';
import { z } from 'zod';

import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const signupSchema = loginSchema.extend({
  name: z.string().min(1, 'Name is required')
});

export interface CredentialValues {
  name: string;
  email: string;
  password: string;
}

interface CredentialFormProps {
  mode: 'signin' | 'signup';
  onModeChange: (mode: 'signin' | 'signup') => void;
  isLoading: boolean;
  onSubmit: (values: CredentialValues) => void;
}

export function CredentialForm({ mode, onModeChange, isLoading, onSubmit }: CredentialFormProps) {
  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: ({ value }) => onSubmit(value)
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();

        const schema = mode === 'signup' ? signupSchema : loginSchema;
        const values = {
          name: form.getFieldValue('name'),
          email: form.getFieldValue('email'),
          password: form.getFieldValue('password')
        };
        const result = schema.safeParse(values);
        if (!result.success) {
          for (const issue of result.error.issues) {
            const field = issue.path?.[0];
            if (field && typeof field === 'string') {
              form.setFieldMeta(field as 'name' | 'email' | 'password', (prev) => ({
                ...prev,
                errorMap: { ...prev.errorMap, onChange: issue.message }
              }));
            }
          }
          return;
        }

        form.handleSubmit();
      }}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === 'signin' ? 'default' : 'outline'}
            onClick={() => onModeChange('signin')}
            disabled={isLoading}>
            Sign in
          </Button>
          <Button
            type="button"
            variant={mode === 'signup' ? 'default' : 'outline'}
            onClick={() => onModeChange('signup')}
            disabled={isLoading}>
            Create account
          </Button>
        </div>

        {mode === 'signup' && (
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Jane Doe"
                  disabled={isLoading}
                />
                {field.state.meta.errorMap.onChange && (
                  <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                )}
              </div>
            )}
          </form.Field>
        )}

        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="you@company.com"
                autoComplete="email"
                disabled={isLoading}
              />
              {field.state.meta.errorMap.onChange && (
                <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="********"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                disabled={isLoading}
              />
              {field.state.meta.errorMap.onChange && (
                <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
              )}
            </div>
          )}
        </form.Field>

        <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
          {isLoading
            ? mode === 'signin'
              ? 'Signing in...'
              : 'Creating account...'
            : mode === 'signin'
              ? 'Sign in with email'
              : 'Create account'}
        </Button>
      </div>
    </form>
  );
}
