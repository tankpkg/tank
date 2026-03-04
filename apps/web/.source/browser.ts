// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"api.mdx": () => import("../content/docs/api.mdx?collection=docs"), "cicd.mdx": () => import("../content/docs/cicd.mdx?collection=docs"), "cli.mdx": () => import("../content/docs/cli.mdx?collection=docs"), "getting-started.mdx": () => import("../content/docs/getting-started.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "installing.mdx": () => import("../content/docs/installing.mdx?collection=docs"), "mcp.mdx": () => import("../content/docs/mcp.mdx?collection=docs"), "publish-first-skill.mdx": () => import("../content/docs/publish-first-skill.mdx?collection=docs"), "publishing.mdx": () => import("../content/docs/publishing.mdx?collection=docs"), "security-checklist.mdx": () => import("../content/docs/security-checklist.mdx?collection=docs"), "self-host-quickstart.mdx": () => import("../content/docs/self-host-quickstart.mdx?collection=docs"), "self-hosting.mdx": () => import("../content/docs/self-hosting.mdx?collection=docs"), }),
};
export default browserCollections;