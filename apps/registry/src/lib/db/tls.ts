import { X509Certificate } from 'node:crypto';
import { type ConnectionOptions, checkServerIdentity } from 'node:tls';
import postgres from 'postgres';

function isSelfSignedRoot(certificate: X509Certificate): boolean {
  try {
    return certificate.checkIssued(certificate) && certificate.verify(certificate.publicKey);
  } catch {
    // Some runtimes cannot inspect every valid CA public key in a bundle.
    return false;
  }
}

/** A configured CA opts both database clients into verified TLS. */
export function postgresTlsOptions(connectionString: string): ConnectionOptions | undefined {
  const configured = process.env.DATABASE_SSL_CA;
  if (configured === undefined) return undefined;

  const certificates = configured.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  const annotations = configured.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '');
  if (!certificates || /-----\s*(?:BEGIN|END)\b/.test(annotations)) {
    throw new Error('DATABASE_SSL_CA must contain PEM CA certificates');
  }
  try {
    const roots = certificates.map((certificate) => new X509Certificate(certificate));
    if (roots.some((certificate) => !certificate.ca)) throw new Error('Not a CA');
    if (!roots.some(isSelfSignedRoot)) {
      throw new Error('No self-signed CA root');
    }
  } catch {
    throw new Error('DATABASE_SSL_CA must contain PEM CA certificates and include a self-signed root');
  }

  // postgres.js otherwise supplies "localhost" for an IP-only TLS socket.
  // Fail closed for multiple hosts rather than validating against the wrong one.
  const options = postgres(connectionString, { max: 0 }).options as postgres.ParsedOptions & {
    sslnegotiation: string | null;
  };
  if (options.sslnegotiation === 'direct') {
    throw new Error('DATABASE_SSL_CA does not support direct PostgreSQL TLS negotiation');
  }
  const hosts = options.host;
  if (hosts.length !== 1 || !hosts[0] || hosts[0].includes('/')) {
    throw new Error('DATABASE_SSL_CA requires exactly one TCP database host');
  }
  const host = hosts[0];
  return {
    ca: certificates,
    rejectUnauthorized: true,
    checkServerIdentity: (_name, certificate) => checkServerIdentity(host, certificate)
  };
}
