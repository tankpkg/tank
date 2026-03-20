import { Check, X } from 'lucide-react';

interface QualityChecksProps {
  hasReadme: boolean;
  hasDescription: boolean;
  hasRepository: boolean;
  hasScanComplete: boolean;
  hasPermissions: boolean;
}

const checks = [
  { key: 'hasReadme', label: 'Has readme' },
  { key: 'hasDescription', label: 'Has description' },
  { key: 'hasRepository', label: 'Has repository URL' },
  { key: 'hasScanComplete', label: 'Security scan complete' },
  { key: 'hasPermissions', label: 'Permissions declared' }
] as const;

export function QualityChecks(props: QualityChecksProps) {
  return (
    <div className="space-y-1.5">
      {checks.map(({ key, label }) => {
        const passed = props[key];
        return (
          <div key={key} className="flex items-center gap-2 text-sm">
            {passed ? (
              <Check className="size-3.5 text-green-600 shrink-0" />
            ) : (
              <X className="size-3.5 text-red-500 shrink-0" />
            )}
            <span className={passed ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
