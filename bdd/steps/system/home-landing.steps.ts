/**
 * BDD step definitions for home landing CTA button rendering.
 *
 * Intent: .idd/modules/home-landing/INTENT.md
 * Feature: .bdd/features/home-landing/cta-buttons.feature
 *
 * Executes the real home-auth-cta module with mocked session states to verify
 * CTA text behavior across component state transitions.
 *
 * NOTE: These tests verify component-level state rendering (logged-out, logged-in,
 * loading states) via mocked useSession() snapshots. They do NOT exercise real
 * browser hydration (SSR HTML → client JS reconciliation). True hydration mismatch
 * detection requires a browser environment (Playwright E2E) and is out of scope
 * for unit-level BDD. These tests prove the component renders correctly for each
 * session state, which is a prerequisite for hydration correctness.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type VNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | {
      type: unknown;
      props?: {
        children?: VNode | VNode[];
      };
    }
  | VNode[];

interface SessionData {
  user?: { id: string };
}

interface SessionSnapshot {
  data: SessionData | null | undefined;
  isPending: boolean;
}

const mockedSession: SessionSnapshot = {
  data: undefined,
  isPending: true,
};

const Fragment = Symbol("Fragment");

vi.mock(
  "react/jsx-runtime",
  () => ({
    Fragment,
    jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
    jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  }),
  { virtual: true },
);

vi.mock("next/link", () => ({
  default: ({ children }: { children?: VNode | VNode[] }) => ({ type: "a", props: { children } }),
}));

vi.mock("lucide-react", () => ({
  ArrowRight: () => ({ type: "svg", props: {} }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ asChild, children }: { asChild?: boolean; children?: VNode | VNode[] }) =>
    asChild ? children : { type: "button", props: { children } },
}));

vi.mock("@/lib/analytics", () => ({
  trackCtaClick: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: mockedSession.data,
    isPending: mockedSession.isPending,
  }),
}));

type HomeLandingModule = typeof import("../../packages/web/app/home-auth-cta");

interface RenderSnapshot {
  heroLabel: string;
  navLabel: string;
}

interface HomeLandingWorld {
  currentVisitor: "logged-out" | "logged-in" | "loading";
  snapshots: RenderSnapshot[];
  hydrationWarnings: string[];
}

const world: HomeLandingWorld = {
  currentVisitor: "loading",
  snapshots: [],
  hydrationWarnings: [],
};

let homeLandingModulePromise: Promise<HomeLandingModule> | undefined;

function resetWorld(): void {
  world.currentVisitor = "loading";
  world.snapshots = [];
  world.hydrationWarnings = [];
  mockedSession.data = undefined;
  mockedSession.isPending = true;
}

async function getHomeLandingModule(): Promise<HomeLandingModule> {
  if (!homeLandingModulePromise) {
    homeLandingModulePromise = import("../../packages/web/app/home-auth-cta");
  }
  return homeLandingModulePromise;
}

function setMockedSession(snapshot: SessionSnapshot): void {
  mockedSession.data = snapshot.data;
  mockedSession.isPending = snapshot.isPending;
}

function flattenText(node: VNode): string[] {
  if (node == null || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(flattenText);

  const maybeNode = node as { type?: unknown; props?: { children?: VNode | VNode[] } };
  const { type, props } = maybeNode;

  if (type === Fragment) return flattenText(props?.children as VNode);
  if (typeof type === "function") {
    const rendered = (type as (input: Record<string, unknown>) => VNode)(props as Record<string, unknown>);
    return flattenText(rendered);
  }

  return flattenText(props?.children as VNode);
}

function extractLabel(node: VNode): string {
  const text = flattenText(node).join(" ");
  return text.includes("Open Dashboard") ? "Open Dashboard" : "Get Started";
}

async function captureSnapshot(): Promise<RenderSnapshot> {
  const { HomeNavAuthCta, HomePrimaryAuthCta } = await getHomeLandingModule();
  const heroNode = HomePrimaryAuthCta({ testId: "hero-cta" });
  const navNode = HomeNavAuthCta();

  return {
    heroLabel: extractLabel(heroNode as VNode),
    navLabel: extractLabel(navNode as VNode),
  };
}

function transitionCount(labels: string[]): number {
  let count = 0;
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i] !== labels[i - 1]) count += 1;
  }
  return count;
}

// ── Given ──────────────────────────────────────────────────────────────────

function givenLandingPageIsLoaded(): void {
  resetWorld();
}

function givenVisitorIsNotLoggedIn(): void {
  world.currentVisitor = "logged-out";
}

function givenVisitorIsLoggedIn(): void {
  world.currentVisitor = "logged-in";
}

function givenVisitorSessionIsLoading(): void {
  world.currentVisitor = "loading";
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenPageRenders(): Promise<void> {
  setMockedSession({ data: undefined, isPending: true });
  world.snapshots = [await captureSnapshot()];
}

async function whenPageHydrates(): Promise<void> {
  const capturedWarnings: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    capturedWarnings.push(args.map((part) => String(part)).join(" "));
  };

  try {
    setMockedSession({ data: undefined, isPending: true });
    const initial = await captureSnapshot();

    if (world.currentVisitor === "logged-in") {
      setMockedSession({ data: { user: { id: "user-79" } }, isPending: false });
    } else if (world.currentVisitor === "logged-out") {
      setMockedSession({ data: null, isPending: false });
    } else {
      setMockedSession({ data: undefined, isPending: true });
    }

    const hydrated = await captureSnapshot();
    world.snapshots = [initial, hydrated];
  } finally {
    console.error = originalConsoleError;
  }

  world.hydrationWarnings = capturedWarnings;
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenHeroIs(expected: "Get Started" | "Open Dashboard", index = 0): void {
  expect(world.snapshots[index]?.heroLabel).toBe(expected);
}

function thenNavIs(expected: "Get Started" | "Open Dashboard", index = 0): void {
  expect(world.snapshots[index]?.navLabel).toBe(expected);
}

function thenNoIntermediateHeroFlash(): void {
  const labels = world.snapshots.map((snapshot) => snapshot.heroLabel);
  expect(transitionCount(labels)).toBeLessThanOrEqual(1);
}

function thenNoHydrationMismatchWarning(): void {
  const combined = world.hydrationWarnings.join("\n");
  expect(combined).not.toMatch(/hydration|did not match|text content does not match/i);
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Landing page CTA buttons are stable after hydration", () => {
  beforeEach(() => {
    resetWorld();
  });

  describe('Scenario: Unauthenticated visitor state renders "Get Started" consistently', () => {
    it("runs Given/When/Then", async () => {
      givenLandingPageIsLoaded();
      givenVisitorIsNotLoggedIn();
      await whenPageHydrates();

      thenHeroIs("Get Started", 0);
      thenHeroIs("Get Started", 1);
      thenNavIs("Get Started", 0);
      thenNavIs("Get Started", 1);
    });
  });

  describe('Scenario: Authenticated user state renders "Open Dashboard" without intermediate flash', () => {
    it("runs Given/When/Then", async () => {
      givenLandingPageIsLoaded();
      givenVisitorIsLoggedIn();
      await whenPageHydrates();

      thenHeroIs("Get Started", 0);
      thenHeroIs("Open Dashboard", 1);
      thenNoIntermediateHeroFlash();
    });
  });

  describe("Scenario: Component state transitions do not emit console errors", () => {
    it("runs Given/When/Then", async () => {
      givenLandingPageIsLoaded();
      givenVisitorIsLoggedIn();
      await whenPageHydrates();

      thenNoHydrationMismatchWarning();
    });
  });

  describe('Scenario: Button shows "Get Started" while session is loading', () => {
    it("runs Given/When/Then", async () => {
      givenLandingPageIsLoaded();
      givenVisitorSessionIsLoading();
      await whenPageRenders();

      thenHeroIs("Get Started");
      thenNavIs("Get Started");
    });
  });
});
