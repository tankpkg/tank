// @ts-nocheck
import * as __fd_glob_17 from "../content/docs/self-hosting.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/self-host-quickstart.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/security.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/security-checklist.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/search.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/publishing.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/publish-first-skill.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/permissions.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/organizations.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/mcp.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/installing.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/github-action.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/getting-started.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/cli.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/cicd.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/api.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"api.mdx": __fd_glob_1, "cicd.mdx": __fd_glob_2, "cli.mdx": __fd_glob_3, "getting-started.mdx": __fd_glob_4, "github-action.mdx": __fd_glob_5, "index.mdx": __fd_glob_6, "installing.mdx": __fd_glob_7, "mcp.mdx": __fd_glob_8, "organizations.mdx": __fd_glob_9, "permissions.mdx": __fd_glob_10, "publish-first-skill.mdx": __fd_glob_11, "publishing.mdx": __fd_glob_12, "search.mdx": __fd_glob_13, "security-checklist.mdx": __fd_glob_14, "security.mdx": __fd_glob_15, "self-host-quickstart.mdx": __fd_glob_16, "self-hosting.mdx": __fd_glob_17, });