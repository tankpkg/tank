import { useNavigate } from "@tanstack/react-router";

import { Label } from "~/components/ui/label";
import type { FreshnessBucket, PopularityBucket, SecurityVerdict, VisibilityFilter } from "~/lib/skills/data";
import { ALL_ATOM_DISPLAY_KINDS, atomDisplayConfig } from "~/lib/skills/atoms";

interface SkillsFiltersProps {
  currentVisibility: VisibilityFilter;
  currentSecurityVerdict: SecurityVerdict;
  currentFreshness: FreshnessBucket;
  currentPopularity: PopularityBucket;
  currentHasReadme: boolean;
  isLoggedIn: boolean;
  currentAtomKind?: string;
}

interface FilterGroupProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  current: T;
  paramKey: string;
  defaultValue: T;
}

function FilterGroup<T extends string>({ label, options, current, paramKey, defaultValue }: FilterGroupProps<T>) {
  const navigate = useNavigate();

  function handleChange(value: T) {
    navigate({
      to: "/skills",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        [paramKey]: value === defaultValue ? undefined : value,
        page: 1,
      }),
    } as never);
  }

  return (
    <fieldset className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="space-y-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleChange(opt.value)}
            className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
              current === opt.value
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export const VISIBILITY_OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "public" as const, label: "Public" },
  { value: "private" as const, label: "Private" },
] as const;

export const SECURITY_VERDICT_OPTIONS = [
  { value: "all" as const, label: "All verdicts" },
  { value: "pass" as const, label: "Pass" },
  { value: "pass_with_notes" as const, label: "Pass with notes" },
  { value: "flagged" as const, label: "Flagged" },
  { value: "fail" as const, label: "Fail" },
] as const;

export const FRESHNESS_OPTIONS = [
  { value: "all" as const, label: "Any time" },
  { value: "week" as const, label: "Past week" },
  { value: "month" as const, label: "Past month" },
  { value: "year" as const, label: "Past year" },
] as const;

export const POPULARITY_OPTIONS = [
  { value: "all" as const, label: "All" },
  { value: "popular" as const, label: "Popular" },
  { value: "growing" as const, label: "Growing" },
  { value: "new" as const, label: "New" },
] as const;

export const ATOM_KIND_OPTIONS = [
  { value: "all", label: "All types" },
  ...ALL_ATOM_DISPLAY_KINDS.map((kind) => ({
    value: kind,
    label: `${atomDisplayConfig[kind].emoji} ${atomDisplayConfig[kind].label}`,
  })),
];

export function SkillsFilters({
  currentVisibility,
  currentSecurityVerdict,
  currentFreshness,
  currentPopularity,
  currentHasReadme,
  isLoggedIn,
  currentAtomKind,
}: SkillsFiltersProps) {
  const navigate = useNavigate();

  function toggleReadme() {
    navigate({
      to: "/skills",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        docs: !currentHasReadme,
        page: 1,
      }),
    } as never);
  }

  function handleAtomKindChange(value: string) {
    navigate({
      to: "/skills",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        atomKind: value === "all" ? undefined : value,
        page: 1,
      }),
    } as never);
  }

  return (
    <aside data-testid="desktop-filter-sidebar">
      <div className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-5">
        {isLoggedIn && (
          <FilterGroup
            label="Visibility"
            options={VISIBILITY_OPTIONS}
            current={currentVisibility}
            paramKey="visibility"
            defaultValue="all"
          />
        )}

        <fieldset className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atom Type</Label>
          <div className="space-y-1">
            {ATOM_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAtomKindChange(opt.value)}
                className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                  (currentAtomKind ?? "all") === opt.value
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <FilterGroup
          label="Security"
          options={SECURITY_VERDICT_OPTIONS}
          current={currentSecurityVerdict}
          paramKey="security"
          defaultValue="all"
        />

        <FilterGroup
          label="Freshness"
          options={FRESHNESS_OPTIONS}
          current={currentFreshness}
          paramKey="freshness"
          defaultValue="all"
        />

        <FilterGroup
          label="Popularity"
          options={POPULARITY_OPTIONS}
          current={currentPopularity}
          paramKey="popularity"
          defaultValue="all"
        />

        <fieldset className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documentation</Label>
          <button
            type="button"
            onClick={toggleReadme}
            className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
              currentHasReadme
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
            Has README
          </button>
        </fieldset>
      </div>
    </aside>
  );
}
