import { cn } from "~/lib/utils";
import { atomDisplayConfig, isBundle, type AtomDisplayKind } from "~/lib/skills/atoms";
import { Badge } from "~/components/ui/badge";

interface AtomKindBadgeProps {
  kind: AtomDisplayKind;
  size?: "sm" | "xs";
}

export function AtomKindBadge({ kind, size = "sm" }: AtomKindBadgeProps) {
  const config = atomDisplayConfig[kind];
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1 font-normal",
        config.badgeClassName,
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
      )}>
      <span role="img" aria-hidden="true">
        {config.emoji}
      </span>
      {config.label}
    </Badge>
  );
}

interface AtomKindBadgesProps {
  kinds: string[];
  size?: "sm" | "xs";
  className?: string;
}

export function AtomKindBadges({ kinds, size = "sm", className }: AtomKindBadgesProps) {
  const bundle = isBundle(kinds as AtomDisplayKind[]);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} data-testid="atom-kind-badges">
      {kinds.map((kind) => (
        <AtomKindBadge key={kind} kind={kind as AtomDisplayKind} size={size} />
      ))}
      {bundle && (
        <Badge
          variant="outline"
          data-testid="bundle-badge"
          className={cn(
            "inline-flex items-center gap-1 font-normal bg-orange-500/10 text-orange-400 border-orange-500/20",
            size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
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
