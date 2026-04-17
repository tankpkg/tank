import { Link } from '@tanstack/react-router';

import { Badge } from '~/components/ui/badge';
import { type AtomDisplayKind, atomDisplayConfig, isBundle } from '~/lib/skills/atoms';
import { cn } from '~/lib/utils';

interface AtomKindBadgeProps {
  kind: AtomDisplayKind;
  size?: 'sm' | 'xs';
  asLink?: boolean;
}

export function AtomKindBadge({ kind, size = 'sm', asLink = false }: AtomKindBadgeProps) {
  const config = atomDisplayConfig[kind];
  const className = cn(
    'inline-flex items-center gap-1 font-normal',
    config.badgeClassName,
    size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs',
    asLink && 'cursor-pointer hover:opacity-80 transition-opacity'
  );
  const content = (
    <>
      <span role="img" aria-hidden="true">
        {config.emoji}
      </span>
      {config.label}
    </>
  );

  if (asLink) {
    return (
      <Badge variant="outline" className={className} asChild>
        <Link to="/skills" search={(prev) => ({ ...prev, atomKind: kind, page: 1 }) as never}>
          {content}
        </Link>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={className}>
      {content}
    </Badge>
  );
}

interface AtomKindBadgesProps {
  kinds: string[];
  size?: 'sm' | 'xs';
  className?: string;
  asLinks?: boolean;
}

export function AtomKindBadges({ kinds, size = 'sm', className, asLinks = false }: AtomKindBadgesProps) {
  const bundle = isBundle(kinds as AtomDisplayKind[]);
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} data-testid="atom-kind-badges">
      {kinds.map((kind) => (
        <AtomKindBadge key={kind} kind={kind as AtomDisplayKind} size={size} asLink={asLinks} />
      ))}
      {bundle && (
        <Badge
          variant="outline"
          data-testid="bundle-badge"
          className={cn(
            'inline-flex items-center gap-1 font-normal bg-orange-500/10 text-orange-400 border-orange-500/20',
            size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
          )}>
          <span role="img" aria-hidden="true">
            🗂
          </span>
          Bundle
        </Badge>
      )}
    </div>
  );
}
