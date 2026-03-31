const PROXY_URL = process.env.TANK_VAULT_PROXY_URL;
if (PROXY_URL) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function tankVaultFetch(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-target-url', url);

    let body = init?.body ?? (input instanceof Request ? input.body : undefined);
    if (body instanceof ReadableStream) {
      const reader = body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      body = merged;
    }

    return originalFetch(`${PROXY_URL}/proxy`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body
    });
  };
}
