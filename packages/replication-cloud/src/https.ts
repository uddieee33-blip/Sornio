import { createHmac, timingSafeEqual } from 'node:crypto';
import * as https from 'node:https';
import { verifyToken } from './auth';
import { ReplicationError, type IngestAck, type Principal, type TokenVerifier } from './types';

function encodePrincipal(principal: Principal): string {
  return Buffer.from(JSON.stringify(principal), 'utf8').toString('base64url');
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Staging HMAC issuer. Never a production or service-role credential. */
export function issueStagingToken(secret: string, principal: Principal): string {
  if (!secret || secret.length < 32) {
    throw new ReplicationError('UNAUTHENTICATED', 'Staging issuer secret is missing.');
  }
  const body = encodePrincipal(principal);
  return `${body}.${sign(secret, body)}`;
}

export function verifyStagingToken(secret: string): TokenVerifier {
  if (!secret || secret.length < 32) {
    throw new ReplicationError('UNAUTHENTICATED', 'Staging issuer secret is missing.');
  }
  return (token: string) => {
    const dot = token.indexOf('.');
    if (dot < 1) throw new ReplicationError('UNAUTHENTICATED', 'Credential could not be verified.');
    const body = token.slice(0, dot);
    const mac = token.slice(dot + 1);
    if (!equal(mac, sign(secret, body))) {
      throw new ReplicationError('UNAUTHENTICATED', 'Credential could not be verified.');
    }
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Principal;
  };
}

const MAX_BODY_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

export type StagingIngestHandler = (principal: Principal, body: unknown) => Promise<IngestAck>;

export function listenStagingIngest(options: {
  key: string | Buffer;
  cert: string | Buffer;
  ca?: string | Buffer;
  ingest: StagingIngestHandler;
  verify: TokenVerifier;
  nowMs: () => number;
}): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = https.createServer(
      {
        key: options.key,
        cert: options.cert,
        ca: options.ca,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      },
      (request, response) => {
        void (async () => {
          const fail = (status: number, code: string, message: string) => {
            response.writeHead(status, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ code, message }));
          };
          if (request.method !== 'POST' || request.url !== '/v1/replication/ingest') {
            fail(404, 'NOT_FOUND', 'Unknown replication path.');
            return;
          }
          const header = request.headers.authorization;
          const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            const buf = chunk as Buffer;
            size += buf.length;
            if (size > MAX_BODY_BYTES) {
              fail(413, 'INVALID_ENVELOPE', 'Replication request is too large.');
              return;
            }
            chunks.push(buf);
          }
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
          } catch {
            fail(400, 'INVALID_ENVELOPE', 'Envelope is missing.');
            return;
          }
          try {
            const principal = verifyToken(options.verify, token, options.nowMs());
            const ack = await options.ingest(principal, body);
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify(ack));
          } catch (error) {
            const code = error instanceof ReplicationError ? error.code : 'UNAUTHENTICATED';
            const status = code === 'UNAUTHENTICATED' || code === 'EXPIRED' || code === 'REVOKED' ? 401 : 409;
            fail(status, code, error instanceof Error ? error.message : 'Ingest failed.');
          }
        })();
      },
    );
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Staging ingest did not bind a port.'));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done, failClose) => {
            server.close((error) => (error ? failClose(error) : done()));
          }),
      });
    });
    server.on('error', reject);
  });
}

export function postStagingIngest(options: {
  hostname: string;
  port: number;
  ca: string | Buffer;
  token: string;
  body: unknown;
}): Promise<IngestAck> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: options.hostname,
        port: options.port,
        path: '/v1/replication/ingest',
        method: 'POST',
        ca: options.ca,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        headers: {
          authorization: `Bearer ${options.token}`,
          'content-type': 'application/json',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk as Buffer));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            const parsed = JSON.parse(text) as IngestAck & { code?: string; message?: string };
            if (response.statusCode && response.statusCode >= 400) {
              reject(new ReplicationError((parsed.code as never) || 'UNAUTHENTICATED', parsed.message || text));
              return;
            }
            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new ReplicationError('UNAUTHENTICATED', 'Replication request timed out.'));
    });
    request.on('error', reject);
    request.write(JSON.stringify(options.body));
    request.end();
  });
}
