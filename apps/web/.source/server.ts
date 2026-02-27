// @ts-nocheck
import * as __fd_glob_11 from "../content/docs/self-hosting.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/self-host-quickstart.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/security-checklist.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/publishing.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/publish-first-skill.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/installing.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/index.mdx?collection=docs"
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

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"api.mdx": __fd_glob_1, "cicd.mdx": __fd_glob_2, "cli.mdx": __fd_glob_3, "getting-started.mdx": __fd_glob_4, "index.mdx": __fd_glob_5, "installing.mdx": __fd_glob_6, "publish-first-skill.mdx": __fd_glob_7, "publishing.mdx": __fd_glob_8, "security-checklist.mdx": __fd_glob_9, "self-host-quickstart.mdx": __fd_glob_10, "self-hosting.mdx": __fd_glob_11, });