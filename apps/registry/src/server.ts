import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

import { serveDocMarkdown } from '~/lib/docs-fs';

const DOCS_RAW_PATTERN = /^\/docs\/([a-z0-9_-]+)\.(md|txt)$/;

export default createServerEntry({
  fetch: (request, opts) => {
    const url = new URL(request.url);
    const match = url.pathname.match(DOCS_RAW_PATTERN);

    if (match) {
      const { content, found } = serveDocMarkdown(match[1]);
      const contentType = match[2] === 'txt' ? 'text/plain' : 'text/markdown';

      return new Response(content, {
        status: found ? 200 : 404,
        headers: {
          'Content-Type': `${contentType}; charset=utf-8`,
          'X-Robots-Tag': 'noindex',
          'Cache-Control': 'public, max-age=300, s-maxage=300'
        }
      });
    }

    return handler.fetch(request, opts);
  }
});
