import { createGunzip } from 'node:zlib';
import { extract } from 'tar-stream';

const MAX_TARBALL_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TARBALL_ENTRIES = 10_000;

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
        if (rawPaths.length >= MAX_TARBALL_ENTRIES) {
          gunzip.destroy();
          reject(new Error(`Tarball exceeds ${MAX_TARBALL_ENTRIES} entry limit`));
          return;
        }
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

export async function extractFileFromTarball(tarball: Uint8Array, targetPath: string): Promise<string | null> {
  const rawPaths = await collectRawPaths(tarball);
  const stripped = stripCommonRoot(rawPaths);
  const idx = stripped.indexOf(targetPath);
  if (idx === -1) return null;

  const rawTarget = rawPaths[idx];
  return extractSingleFile(tarball, rawTarget);
}

function collectRawPaths(tarball: Uint8Array): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const extractor = extract();
    const gunzip = createGunzip();
    const paths: string[] = [];

    extractor.on('entry', (header, stream, next) => {
      if (header.type === 'file') paths.push(header.name);
      stream.resume();
      stream.on('end', next);
    });

    extractor.on('finish', () => resolve(paths));
    extractor.on('error', reject);
    gunzip.on('error', reject);
    gunzip.pipe(extractor);
    gunzip.end(Buffer.from(tarball));
  });
}

function extractSingleFile(tarball: Uint8Array, rawPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const extractor = extract();
    const gunzip = createGunzip();
    let found = false;

    extractor.on('entry', (header, stream, next) => {
      if (!found && header.type === 'file' && header.name === rawPath) {
        if (header.size && header.size > MAX_TARBALL_FILE_BYTES) {
          found = true;
          stream.resume();
          reject(new Error(`File exceeds ${MAX_TARBALL_FILE_BYTES} byte limit`));
          gunzip.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          found = true;
          resolve(Buffer.concat(chunks).toString('utf-8'));
          gunzip.destroy();
        });
      } else {
        stream.resume();
        stream.on('end', next);
      }
    });

    extractor.on('finish', () => {
      if (!found) resolve(null);
    });
    extractor.on('error', (err) => {
      if (!found) reject(err);
    });
    gunzip.on('error', (err) => {
      if (!found) reject(err);
    });
    gunzip.pipe(extractor);
    gunzip.end(Buffer.from(tarball));
  });
}
