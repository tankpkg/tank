import { createGunzip } from 'node:zlib';
import { extract } from 'tar-stream';

const MAX_TARBALL_FILE_BYTES = 10 * 1024 * 1024;

export function stripCommonRoot(paths: string[]): string[] {
  if (paths.length === 0) return [];
  const firstSegments = paths.map((p) => p.split('/')[0]);
  const allSameRoot = firstSegments.every((s) => s === firstSegments[0]);
  const rootHasNoExtension = !firstSegments[0].includes('.');
  if (allSameRoot && rootHasNoExtension && paths.every((p) => p.includes('/'))) {
    return paths.map((p) => p.replace(/^[^/]+\//, '')).filter(Boolean);
  }
  return paths;
}

export function listFilesInTarball(tarball: Uint8Array): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const extractor = extract();
    const gunzip = createGunzip();
    const rawPaths: string[] = [];

    extractor.on('entry', (header, stream, next) => {
      if (header.type === 'file') {
        rawPaths.push(header.name);
      }
      stream.resume();
      stream.on('end', next);
    });

    extractor.on('finish', () => resolve(stripCommonRoot(rawPaths)));
    extractor.on('error', reject);
    gunzip.on('error', reject);

    gunzip.pipe(extractor);
    gunzip.end(Buffer.from(tarball));
  });
}

export function extractFileFromTarball(tarball: Uint8Array, targetPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const extractor = extract();
    const gunzip = createGunzip();
    let found = false;
    const allRaw: string[] = [];
    const pendingChunks = new Map<string, Buffer[]>();

    extractor.on('entry', (header, stream, next) => {
      if (header.type !== 'file') {
        stream.resume();
        stream.on('end', next);
        return;
      }

      if (header.size && header.size > MAX_TARBALL_FILE_BYTES) {
        stream.resume();
        stream.on('end', next);
        return;
      }

      const raw = header.name;
      allRaw.push(raw);

      const chunks: Buffer[] = [];
      pendingChunks.set(raw, chunks);
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', next);
    });

    extractor.on('finish', () => {
      if (found) return;
      const stripped = stripCommonRoot(allRaw);
      const idx = stripped.indexOf(targetPath);

      if (idx === -1) {
        resolve(null);
        return;
      }

      const matchedRaw = allRaw[idx];
      const chunks = pendingChunks.get(matchedRaw);
      if (!chunks) {
        resolve(null);
        return;
      }

      found = true;
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    extractor.on('error', reject);
    gunzip.on('error', reject);

    gunzip.pipe(extractor);
    gunzip.end(Buffer.from(tarball));
  });
}
