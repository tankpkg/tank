import { createFileRoute } from "@tanstack/react-router";
import { setResponseHeader } from "@tanstack/react-start/server";
import { readDocFile } from "~/lib/docs-fs";

export const Route = createFileRoute("/_registry/docs/$slug/llms.txt")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        setResponseHeader("Content-Type", "text/plain; charset=utf-8");
        setResponseHeader("Cache-Control", "public, max-age=0, must-revalidate");
        setResponseHeader("CDN-Cache-Control", "max-age=86400, stale-while-revalidate=86400");

        try {
          const content = readDocFile(params.slug + ".mdx");
          return new Response(content);
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
