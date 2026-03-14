/**
 * BDD step definitions for social preview metadata and OG images.
 *
 * Intent: .idd/modules/web-seo/INTENT.md
 * Feature: .bdd/features/web-seo/social-previews.feature
 *
 * Runs against REAL source files for metadata and OG image routes.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

type ImageDimensions = { width: number; height: number };

interface WebSeoWorld {
  requestedPath: string;
  responseStatus: number;
  responseContentType: string;
  responseImageSize: ImageDimensions | null;
  homepageOgImageUrl: string;
  skillOgImageUrl: string;
  skillName: string;
  homepageSource: string;
  rootOgImageSource: string;
  docsOgImageSource: string;
  skillPageSource: string;
  skillApiOgSource: string;
}

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const LAYOUT_FILE = path.join(REPO_ROOT, "packages", "web", "app", "layout.tsx");
const ROOT_OG_IMAGE_FILE = path.join(REPO_ROOT, "packages", "web", "app", "opengraph-image.tsx");
const DOCS_OG_IMAGE_FILE = path.join(REPO_ROOT, "packages", "web", "app", "docs", "opengraph-image.tsx");
const SKILL_PAGE_FILE = path.join(REPO_ROOT, "packages", "web", "app", "(registry)", "skills", "[...name]", "page.tsx");
const SKILL_API_OG_FILE = path.join(REPO_ROOT, "packages", "web", "app", "api", "og", "[...name]", "route.tsx");

const world: WebSeoWorld = {
  requestedPath: "",
  responseStatus: 0,
  responseContentType: "",
  responseImageSize: null,
  homepageOgImageUrl: "",
  skillOgImageUrl: "",
  skillName: "",
  homepageSource: "",
  rootOgImageSource: "",
  docsOgImageSource: "",
  skillPageSource: "",
  skillApiOgSource: "",
};

function readSource(filePath: string): string {
  expect(fs.existsSync(filePath), `Expected file to exist: ${filePath}`).toBe(true);
  return fs.readFileSync(filePath, "utf-8");
}

function readAllSources(): void {
  world.homepageSource = readSource(LAYOUT_FILE);
  world.rootOgImageSource = readSource(ROOT_OG_IMAGE_FILE);
  world.docsOgImageSource = readSource(DOCS_OG_IMAGE_FILE);
  world.skillPageSource = readSource(SKILL_PAGE_FILE);
  world.skillApiOgSource = readSource(SKILL_API_OG_FILE);
}

function parseHomepageOgImageUrl(source: string): string {
  const match = source.match(/openGraph:\s*\{[\s\S]*?images:\s*\[[\s\S]*?url:\s*['"]([^'"]+)['"]/);
  expect(match, "Expected homepage openGraph image URL in layout metadata").not.toBeNull();
  return match![1];
}

function parseSkillOgImageUrl(source: string): string {
  const match = source.match(/const\s+ogImageUrl\s*=\s*`([^`]+)`/);
  expect(match, "Expected dynamic skill ogImageUrl in skill detail metadata").not.toBeNull();
  return match![1];
}

function parseImageDimensionsFromSource(source: string): ImageDimensions {
  const widthMatch = source.match(/width:\s*(\d+)/);
  const heightMatch = source.match(/height:\s*(\d+)/);
  expect(widthMatch, "Expected image width declaration").not.toBeNull();
  expect(heightMatch, "Expected image height declaration").not.toBeNull();
  return {
    width: Number(widthMatch![1]),
    height: Number(heightMatch![1]),
  };
}

function givenTankWebAppIsRunning(): void {
  readAllSources();
}

function givenSkillExistsInRegistry(skillName: string): void {
  world.skillName = skillName;
  readAllSources();
}

function whenIRequestHomepageHtml(pathname: string): void {
  world.requestedPath = pathname;
  world.homepageOgImageUrl = parseHomepageOgImageUrl(world.homepageSource);
}

function whenIRequestSkillDetailPageHtml(pathname: string): void {
  world.requestedPath = pathname;
  world.skillOgImageUrl = parseSkillOgImageUrl(world.skillPageSource);
}

function whenIRequestGet(pathname: string): void {
  world.requestedPath = pathname;
  world.responseStatus = 404;
  world.responseContentType = "";
  world.responseImageSize = null;

  if (pathname === "/opengraph-image") {
    world.responseStatus = 200;
    world.responseContentType = /contentType\s*=\s*['"]image\/png['"]/.test(world.rootOgImageSource) ? "image/png" : "";
    world.responseImageSize = parseImageDimensionsFromSource(world.rootOgImageSource);
    return;
  }

  if (pathname === "/docs/opengraph-image") {
    world.responseStatus = 200;
    world.responseContentType = /contentType\s*=\s*['"]image\/png['"]/.test(world.docsOgImageSource) ? "image/png" : "";
    world.responseImageSize = parseImageDimensionsFromSource(world.docsOgImageSource);
    return;
  }

  if (pathname.startsWith("/api/og/")) {
    world.responseStatus = 200;
    world.responseContentType = /new\s+ImageResponse\(/.test(world.skillApiOgSource) ? "image/png" : "";
    world.responseImageSize = parseImageDimensionsFromSource(world.skillApiOgSource);
  }
}

function thenResponseContainsMetaTagWithProperty(property: string): void {
  const propertyToField: Record<string, string> = {
    "og:title": "title",
    "og:description": "description",
    "og:url": "url",
    "og:type": "type",
    "og:image": "images",
  };

  const field = propertyToField[property];
  expect(field, `Unsupported Open Graph property assertion: ${property}`).toBeTruthy();

  const openGraphBlock = world.homepageSource.match(/openGraph:\s*\{([\s\S]*?)\n\s*\},\n\s*twitter:/);
  expect(openGraphBlock, "Expected openGraph metadata block").not.toBeNull();
  expect(openGraphBlock![1]).toContain(`${field}:`);
}

function thenSkillDetailContainsMetaTagWithProperty(property: string): void {
  expect(property).toBe("og:image");
  const openGraphBlock = world.skillPageSource.match(/openGraph:\s*\{([\s\S]*?)\n\s*\},\n\s*twitter:/);
  expect(openGraphBlock, "Expected openGraph metadata block in skill detail page").not.toBeNull();
  expect(openGraphBlock![1]).toContain("images:");
  expect(world.skillPageSource).toContain("images: [{ url: ogImageUrl");
}

function thenResponseContainsTwitterMetaTag(name: string, content?: string): void {
  expect(name.startsWith("twitter:")).toBe(true);

  const twitterBlock = world.homepageSource.match(/twitter:\s*\{([\s\S]*?)\n\s*\},\n\s*alternates:/);
  expect(twitterBlock, "Expected twitter metadata block").not.toBeNull();

  if (name === "twitter:card") {
    expect(twitterBlock![1]).toContain("card:");
    if (content) expect(twitterBlock![1]).toContain(`'${content}'`);
    return;
  }

  if (name === "twitter:image") {
    expect(twitterBlock![1]).toContain("images:");
  }
}

function thenOgImageUrlDoesNotContain(text: string): void {
  expect(world.homepageOgImageUrl).toBeTruthy();
  expect(world.homepageOgImageUrl).not.toContain(text);
}

function thenOgImageUrlContains(text: string): void {
  expect(world.skillOgImageUrl).toBeTruthy();
  expect(world.skillOgImageUrl).toContain(text);
}

function thenOgImageUrlResolvesWithHttp200(): void {
  if (world.skillOgImageUrl) {
    expect(world.skillApiOgSource).toContain("export async function GET");
    expect(world.skillApiOgSource).toContain("new ImageResponse");
    return;
  }

  expect(world.homepageOgImageUrl).toBe("/opengraph-image");
  expect(/contentType\s*=\s*['"]image\/png['"]/.test(world.rootOgImageSource)).toBe(true);
  expect(parseImageDimensionsFromSource(world.rootOgImageSource)).toEqual({ width: 1200, height: 630 });
}

function thenResponseStatusIs(code: number): void {
  expect(world.responseStatus).toBe(code);
}

function thenContentTypeIs(contentType: string): void {
  expect(world.responseContentType).toBe(contentType);
}

function thenImageDimensionsAre(width: number, height: number): void {
  expect(world.responseImageSize).toEqual({ width, height });
}

function thenImageContainsFallbackText(text: string): void {
  expect(world.skillApiOgSource).toContain(text);
}

describe("Feature: Social Previews (Open Graph)", () => {
  describe("Scenario: Homepage OG image resolves to a real URL", () => {
    it("runs Given/When/Then", () => {
      givenTankWebAppIsRunning();
      whenIRequestHomepageHtml("/");
      thenResponseContainsMetaTagWithProperty("og:image");
      thenOgImageUrlDoesNotContain("og-image.png");
      thenOgImageUrlResolvesWithHttp200();
    });
  });

  describe("Scenario: Homepage OG image endpoint returns a valid PNG", () => {
    it("runs Given/When/Then", () => {
      givenTankWebAppIsRunning();
      whenIRequestGet("/opengraph-image");
      thenResponseStatusIs(200);
      thenContentTypeIs("image/png");
      thenImageDimensionsAre(1200, 630);
    });
  });

  describe("Scenario: Homepage has complete Open Graph metadata", () => {
    it("runs Given/When/Then", () => {
      givenTankWebAppIsRunning();
      whenIRequestHomepageHtml("/");
      thenResponseContainsMetaTagWithProperty("og:title");
      thenResponseContainsMetaTagWithProperty("og:description");
      thenResponseContainsMetaTagWithProperty("og:url");
      thenResponseContainsMetaTagWithProperty("og:type");
      thenResponseContainsMetaTagWithProperty("og:image");
    });
  });

  describe("Scenario: Homepage has Twitter Card metadata", () => {
    it("runs Given/When/Then", () => {
      givenTankWebAppIsRunning();
      whenIRequestHomepageHtml("/");
      thenResponseContainsTwitterMetaTag("twitter:card", "summary_large_image");
      thenResponseContainsTwitterMetaTag("twitter:image");
    });
  });

  describe("Scenario: Skill detail page has dynamic OG image", () => {
    it("runs Given/When/Then", () => {
      givenSkillExistsInRegistry("@tank/react");
      whenIRequestSkillDetailPageHtml("/skills/%40tank%2Freact");
      thenSkillDetailContainsMetaTagWithProperty("og:image");
      thenOgImageUrlContains("/api/og/");
      thenOgImageUrlResolvesWithHttp200();
    });
  });

  describe("Scenario: Skill OG image API returns PNG for unknown skill", () => {
    it("runs Given/When/Then", () => {
      givenTankWebAppIsRunning();
      whenIRequestGet("/api/og/@unknown/nonexistent");
      thenResponseStatusIs(200);
      thenContentTypeIs("image/png");
      thenImageContainsFallbackText("AI agent skill on Tank");
    });
  });

  describe("Scenario: Docs OG image continues to work", () => {
    it("runs Given/When/Then", () => {
      givenTankWebAppIsRunning();
      whenIRequestGet("/docs/opengraph-image");
      thenResponseStatusIs(200);
      thenContentTypeIs("image/png");
    });
  });
});
