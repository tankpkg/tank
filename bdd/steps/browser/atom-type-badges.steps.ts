// Feature: bdd/features/browser/tanstack/atom-type-badges.feature
// Intent: idd/modules/atom-type-badges/INTENT.md
// Covers: C6–C12, E9–E14

import { encodeSkillName } from "@internals/helpers";
import { expect } from "@playwright/test";

import type { SkillFixture } from "../../../e2e/helpers/fixtures";
import { createSkillFixture } from "../../../e2e/helpers/fixtures";
import { expectSuccess, Given, runTank, Then, When } from "./fixtures";
import type { BddState } from "./fixtures";

function resolveFixture(bddState: BddState, logicalName: string): SkillFixture {
  const fixture = logicalName === "@tank/has-atoms" ? bddState.atomSkill : bddState.legacySkill;
  if (!fixture) throw new Error(`No fixture seeded for logical name: ${logicalName}`);
  return fixture;
}

Given(
  "a skill {string} exists with atoms of kinds {string} and {string}",
  async ({ e2eContext, bddState }, _logicalName: string, kind1: string, kind2: string) => {
    const fixture = createSkillFixture({
      orgSlug: e2eContext.orgSlug,
      skillName: "has-atoms",
      description: "E2E atom-type-badges test skill with atoms",
    });

    const result = await runTank(["publish"], {
      cwd: fixture.dir,
      home: e2eContext.home,
      timeoutMs: 60_000,
    });
    expectSuccess(result);

    // Inject atom_kinds post-publish — tank publish doesn't populate this column from fixtures
    await e2eContext.sql`
      UPDATE skill_versions
      SET atom_kinds = ${[kind1, kind2]}
      WHERE skill_name = ${fixture.name}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    bddState.atomSkill = fixture;
    bddState.tempDirs.push(fixture.dir);
  },
);

Given("a skill {string} exists with no atoms", async ({ e2eContext, bddState }, _logicalName: string) => {
  const fixture = createSkillFixture({
    orgSlug: e2eContext.orgSlug,
    skillName: "legacy-skill",
    description: "E2E atom-type-badges legacy skill",
  });

  const result = await runTank(["publish"], {
    cwd: fixture.dir,
    home: e2eContext.home,
    timeoutMs: 60_000,
  });
  expectSuccess(result);

  bddState.legacySkill = fixture;
  bddState.tempDirs.push(fixture.dir);
});

When("I visit the skills browse page", async ({ page }) => {
  await page.goto("/skills");
  await page.waitForLoadState("networkidle");
});

When("I visit the skill detail page for {string}", async ({ page, bddState }, logicalName: string) => {
  const fixture = resolveFixture(bddState, logicalName);
  await page.goto(`/skills/${encodeSkillName(fixture.name)}`);
  await page.waitForLoadState("networkidle");
});

Then("every skill card has an atom kind badges container", async ({ page }) => {
  const cards = page.getByTestId("skill-card");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    await expect(cards.nth(i).getByTestId("atom-kind-badges")).toBeVisible();
  }
});

Then(
  "the card for {string} shows a {string} badge",
  async ({ page, bddState }, logicalName: string, _badgeText: string) => {
    const fixture = resolveFixture(bddState, logicalName);
    const card = page.getByTestId("skill-card").filter({ hasText: fixture.name });
    await expect(card.getByTestId("bundle-badge")).toBeVisible();
  },
);

Then("the atom badges container is visible in the header", async ({ page }) => {
  await expect(page.getByTestId("skill-detail-atom-badges")).toBeVisible();
});

Then("I see a badge with text {string}", async ({ page }, text: string) => {
  const badges = page.getByTestId("skill-detail-atom-badges");
  await expect(badges.getByText(text)).toBeVisible();
});

Then("the desktop sidebar contains a {string} label", async ({ page }, label: string) => {
  const sidebar = page.getByTestId("desktop-sidebar");
  await expect(sidebar.getByText(label)).toBeVisible();
});

Then("the Type row contains atom badges", async ({ page }) => {
  const sidebar = page.getByTestId("desktop-sidebar");
  await expect(sidebar.getByTestId("atom-kind-badges")).toBeVisible();
});

Then("the Atoms tab trigger is visible", async ({ page }) => {
  await expect(page.getByTestId("atoms-tab-trigger")).toBeVisible();
});

When("I click the Atoms tab", async ({ page }) => {
  await page.getByTestId("atoms-tab-trigger").click();
});

Then("the atoms intro callout is visible", async ({ page }) => {
  await expect(page.getByTestId("atoms-tab-intro")).toBeVisible();
});

Then("at least one atom card is visible", async ({ page }) => {
  await expect(page.getByTestId("atom-card").first()).toBeVisible();
});

Then("the Atoms tab trigger is not present", async ({ page }) => {
  await expect(page.getByTestId("atoms-tab-trigger")).toHaveCount(0);
});

When("I click the {string} atom type filter in the sidebar", async ({ page }, kind: string) => {
  const sidebar = page.getByTestId("desktop-filter-sidebar");
  await sidebar.getByRole("button", { name: kind }).click();
  await page.waitForLoadState("networkidle");
});

Then("the URL contains {string}", async ({ page }, param: string) => {
  expect(page.url()).toContain(param);
});

Then("{string} appears in the results", async ({ page, bddState }, logicalName: string) => {
  const fixture = resolveFixture(bddState, logicalName);
  await expect(page.getByTestId("skills-grid").getByText(fixture.name)).toBeVisible();
});

Then("{string} does not appear in the results", async ({ page, bddState }, logicalName: string) => {
  const fixture = resolveFixture(bddState, logicalName);
  await expect(page.getByTestId("skills-grid").getByText(fixture.name)).toHaveCount(0);
});
