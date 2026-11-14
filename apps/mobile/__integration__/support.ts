/** Level-2 host infrastructure only. No business routes or permission rules.
 * The Rust child links the actual desktop hub sources; TCP forwarding preserves
 * its TLS end to end. The SQLCipher client port is a test adapter, not Keychain.
 */
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import type { SecureStorePort } from '@sornio/mobile-contracts';
import { hubWire, probeHub } from '../src/lan/transport';
import { hubIdentity, type HubPair, type HubSession } from '../../../packages/business-domain/src/restaurant-lan';

export type Json = Record<string, unknown>;
export function binaryPath() {
  return process.env.SORNIO_LAN_HUB_BINARY ?? path.resolve(__dirname, '../../../packages/lan-hub/target/debug/sornio-lan-acceptance');
}
export function privateAddress() {
  const { networkInterfaces } = require('node:os') as typeof import('node:os');
  for (const entries of Object.values(networkInterfaces())) for (const n of entries ?? []) {
    if (n.family !== 'IPv4' || n.internal) continue;
    const [a = 0, b = 0] = n.address.split('.').map(Number);
    if (a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254) return n.address;
  }
  throw new Error('Level 2 requires a private/link-local IPv4 interface; loopback is not accepted by the production hub.');
}
class Control {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  stderr = '';
  constructor(readonly directory: string, private readonly args: string[] = []) {
    this.child = spawn(binaryPath(), args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child.on('error', e => this.fail(new Error(`Cannot execute ${binaryPath()}: ${e.message}. Build packages/lan-hub first.`)));
    this.child.stderr.on('data', b => { this.stderr = (this.stderr + String(b)).slice(-16000); });
    this.child.on('exit', code => this.fail(new Error(`Native control exited ${code}: ${this.stderr}`)));
    createInterface({ input: this.child.stdout }).on('line', line => {
      let reply: { id: number; ok: boolean; result?: unknown; error?: string };
      try { reply = JSON.parse(line); } catch { this.stderr += `\nnon-JSON native output: ${line.slice(0, 200)}`; return; }
      const p = this.pending.get(reply.id); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(reply.id);
      reply.ok ? p.resolve(reply.result) : p.reject(new Error(reply.error ?? 'native control failed'));
    });
  }
  private fail(error: Error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
  command<T = Json>(command: string, params: Json = {}, timeout = 30000): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Native ${command} timed out: ${this.stderr}`)); }, timeout);
      this.pending.set(id, { resolve: v => resolve(v as T), reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, command, params })}\n`, e => { if (e) { clearTimeout(timer); this.pending.delete(id); reject(e); } });
    });
  }
  async close(remove = true) {
    if (this.child.exitCode === null) {
      await this.command('shutdown').catch(() => undefined);
      await new Promise<void>(resolve => { const timer = setTimeout(() => { this.child.kill('SIGKILL'); resolve(); }, 2000); timer.unref(); this.child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    }
    if (remove) rmSync(this.directory, { recursive: true, force: true });
  }
}
export type Certificates = { ca: string; certificate: string; privateKey: string; fingerprint: string; alternate: string; alternateKey: string; alternateCa: string; expired: string; expiredKey: string; wrongHost: string; wrongHostKey: string; directory: string };
export function certificates(directory: string): Certificates {
  const dir = path.join(directory, 'certificates'); mkdirSync(dir, { recursive: true });
  const run = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  const ca = (name: string) => {
    run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-days', '30', '-subj', `/CN=Sornio ${name} test CA`);
    writeFileSync(path.join(dir, `${name}.cnf`), `[ca]\ndefault_ca=CA\n[CA]\ndir=${dir}\ndatabase=${dir}/${name}.index\nnew_certs_dir=${dir}\nserial=${dir}/${name}.serial\ncertificate=${dir}/${name}.pem\nprivate_key=${dir}/${name}.key\ndefault_md=sha256\ndefault_days=30\nunique_subject=no\npolicy=POLICY\nx509_extensions=EXT\n[POLICY]\ncommonName=supplied\n[EXT]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
    writeFileSync(path.join(dir, `${name}.index`), ''); writeFileSync(path.join(dir, `${name}.serial`), '01\n');
  };
  const leaf = (name: string, authority: string, san = 'DNS:localhost,IP:127.0.0.1', dates: string[] = []) => {
    run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', '/CN=localhost');
    writeFileSync(path.join(dir, `${name}.ext`), `subjectAltName=${san}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
    // openssl ca supports explicit historical dates on OpenSSL 3.0 runners too.
    const ext = path.join(dir, `${name}.ext`);
    run('ca', '-batch', '-config', `${authority}.cnf`, '-in', `${name}.csr`, '-out', `${name}.pem`, '-notext', '-extfile', ext, ...dates);
    return { cert: require('node:fs').readFileSync(path.join(dir, `${name}.pem`), 'utf8') as string, key: require('node:fs').readFileSync(path.join(dir, `${name}.key`), 'utf8') as string };
  };
  ca('root'); ca('other');
  const good = leaf('server', 'root');
  const alternate = leaf('alternate', 'other');
  const expired = leaf('expired', 'root', 'DNS:localhost,IP:127.0.0.1', ['-startdate', '20200101000000Z', '-enddate', '20210101000000Z']);
  const wrongHost = leaf('wrong-host', 'root', 'DNS:other.example');
  const der = execFileSync('openssl', ['x509', '-in', 'server.pem', '-outform', 'DER'], { cwd: dir });
  const read = (name: string) => require('node:fs').readFileSync(path.join(dir, name), 'utf8') as string;
  return { ca: read('root.pem'), certificate: good.cert, privateKey: good.key, fingerprint: createHash('sha256').update(der).digest('hex'), alternate: alternate.cert, alternateKey: alternate.key, alternateCa: read('other.pem'), expired: expired.cert, expiredKey: expired.key, wrongHost: wrongHost.cert, wrongHostKey: wrongHost.key, directory: dir };
}

/** TLS-record-aware TCP fault proxy. It never terminates TLS or handles business
 * JSON. With TLS 1.2, server application data after client application data is
 * the HTTP response; the hub has returned from its committed transaction before
 * rustls can emit those bytes. Cutting here is a real lost acknowledgement. */
export class FaultProxy {
  private server: net.Server;
  private sockets = new Set<net.Socket>();
  dropBefore = 0;
  loseAfter = 0;
  lost = 0;
  private constructor(private target: { host: string; port: number }) {
    this.server = net.createServer(client => {
      if (this.dropBefore > 0) { this.dropBefore--; client.destroy(); return; }
      const upstream = net.connect(this.target);
      this.sockets.add(client); this.sockets.add(upstream);
      let clientApp = false;
      const parse = (from: net.Socket, to: net.Socket, isClient: boolean) => {
        let buffer = Buffer.alloc(0);
        from.on('data', (chunk: Buffer | string) => {
          buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
          while (buffer.length >= 5) {
            const length = buffer.readUInt16BE(3); if (length > 18432 + 2048) { client.destroy(); upstream.destroy(); return; }
            if (buffer.length < length + 5) break;
            const record = buffer.subarray(0, length + 5); buffer = buffer.subarray(length + 5);
            const application = record[0] === 23;
            if (isClient && application) clientApp = true;
            if (!isClient && application && clientApp && this.loseAfter > 0) { this.loseAfter--; this.lost++; upstream.destroy(); client.destroy(); return; }
            if (!to.destroyed) to.write(record);
          }
        });
        from.on('error', () => to.destroy()); from.on('close', () => to.end());
      };
      upstream.on('error', () => client.destroy());
      parse(client, upstream, true); parse(upstream, client, false);
      client.on('close', () => { upstream.destroy(); this.sockets.delete(client); this.sockets.delete(upstream); });
      upstream.on('close', () => { client.destroy(); this.sockets.delete(client); this.sockets.delete(upstream); });
    });
  }
  static async open(target: { host: string; port: number }) { const p = new FaultProxy(target); await new Promise<void>((resolve, reject) => { p.server.once('error', reject); p.server.listen(0, '127.0.0.1', resolve); }); return p; }
  get port() { const a = this.server.address(); if (!a || typeof a === 'string') throw new Error('proxy not listening'); return a.port; }
  get origin() { return `https://localhost:${this.port}`; }
  retarget(target: { host: string; port: number }) { this.target = target; }
  async close() { for (const s of this.sockets) s.destroy(); await new Promise<void>(resolve => this.server.close(() => resolve())); }
}

export type LanOptions = { ca: string; pin?: string; tls12?: boolean; timeoutMs?: number };
let lanOptions: LanOptions = { ca: '' };
export function configureHostLan(options: LanOptions) { lanOptions = options; }
function tlsCode(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'CERT_HAS_EXPIRED' || code === 'CERT_NOT_YET_VALID') return 'certificate_expired';
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID' || code.startsWith('CERT_') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return 'certificate_untrusted';
  if (code === 'PIN_MISMATCH') return 'certificate_changed';
  return 'network_unavailable';
}
/** Implements only the platform-native module boundary. The production
 * transport.ts, hubWire/probeHub, schema validation and outboxes are unchanged. */
export const hostNativeLan = {
  async probe(origin: string) { return this.request(origin, '/v1/identity', '{"version":1}', '', ''); },
  request(origin: string, requestPath: string, body: string, bearer: string, pin: string): Promise<{ status: number; body: string; certificateSha256: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(origin); let fingerprint = '';
      const request = https.request({ hostname: url.hostname, port: url.port, path: requestPath, method: 'POST', ca: lanOptions.ca, servername: url.hostname, minVersion: lanOptions.tls12 ? 'TLSv1.2' : undefined, maxVersion: lanOptions.tls12 ? 'TLSv1.2' : undefined, rejectUnauthorized: true, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, checkServerIdentity: (host, cert) => {
        const identityError = tls.checkServerIdentity(host, cert); if (identityError) return identityError;
        fingerprint = createHash('sha256').update(cert.raw).digest('hex');
        // This runs during TLS verification, before https writes HTTP bytes.
        if (pin && fingerprint !== pin) return Object.assign(new Error('certificate pin mismatch'), { code: 'PIN_MISMATCH' });
        return undefined;
      } }, response => {
        let text = ''; response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; if (text.length > 262144) request.destroy(Object.assign(new Error('reply too large'), { code: 'response_too_large' })); });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, certificateSha256: fingerprint }));
        response.on('error', e => reject(Object.assign(e, { code: tlsCode(e) })));
      });
      request.setTimeout(lanOptions.timeoutMs ?? 5000, () => request.destroy(Object.assign(new Error('network timeout'), { code: 'network_unavailable' })));
      request.on('error', e => reject(Object.assign(e, { code: (e as { code?: string }).code === 'response_too_large' ? 'response_too_large' : tlsCode(e) })));
      request.end(body);
    });
  },
  async startDiscovery() { throw Object.assign(new Error('Host adapter does not implement platform multicast'), { code: 'ERR_MODULE_NOT_FOUND' }); },
  async stopDiscovery() {},
};

export class NativeHub {
  readonly directory: string;
  readonly certs: Certificates;
  readonly control: Control;
  readonly bind = privateAddress();
  readonly password = `Synthetic-${randomBytes(12).toString('hex')}`;
  origin = '';
  address = '';
  identity!: Json;
  actors!: Record<string, string>;
  baseline!: Json;
  discovery!: Json;
  proxy!: FaultProxy;
  private constructor() { this.directory = mkdtempSync(path.join(tmpdir(), 'sornio-lan-')); this.certs = certificates(this.directory); this.control = new Control(this.directory); }
  static async open(advertise = false) {
    const hub = new NativeHub();
    try {
      const result = await hub.control.command<{ started: Json; baseline: Json }>('init', { directory: hub.directory, key: randomBytes(32).toString('hex'), password: hub.password, bind: hub.bind, certificate: hub.certs.certificate, privateKey: hub.certs.privateKey, advertise }, 120000);
      hub.setStarted(result.started); hub.baseline = result.baseline;
      const target = new URL(hub.origin); hub.proxy = await FaultProxy.open({ host: hub.bind, port: Number(target.port) });
      configureHostLan({ ca: hub.certs.ca });
      return hub;
    } catch (e) { await hub.close(); throw e; }
  }
  private setStarted(started: Json) { this.origin = String(started.origin); this.address = String(started.address); this.identity = started.identity as Json; this.actors = started.actors as Record<string, string>; this.discovery = started.discovery as Json; }
  get clientOrigin() { return this.proxy.origin; }
  wire(pin = this.certs.fingerprint) { return hubWire(this.clientOrigin, pin); }
  snapshot() { return this.control.command('snapshot'); }
  async restart() { const started = await this.control.command('restart'); this.setStarted(started); const u = new URL(this.origin); this.proxy.retarget({ host: this.bind, port: Number(u.port) }); }
  async rotateTls(certificate: string, privateKey: string) { await this.control.command('rotateTls', { certificate, privateKey }); await this.restart(); }
  async restore() { const started = await this.control.command<Json>('restore', {}, 120000); this.setStarted(started); const u = new URL(this.origin); this.proxy.retarget({ host: this.bind, port: Number(u.port) }); }
  async connect(username = 'chef', deviceId = randomBytes(16).toString('hex')) {
    const probed = await probeHub(this.clientOrigin);
    const hint = probed.identity as { hubId: string; businessId: string };
    const pair: HubPair = { version: 1, origin: this.clientOrigin, hub: hubIdentity(probed.identity, hint), deviceId, name: `Acceptance ${username}`, credential: randomBytes(32).toString('hex'), certificateSha256: probed.certificateSha256, certificateConfirmedAt: new Date().toISOString() };
    const wire = hubWire(pair.origin, pair.certificateSha256);
    const base = { version: 1, hubId: pair.hub.hubId, businessId: pair.hub.businessId, deviceId };
    const enrolled = await wire('/v1/enrol', { ...base, name: pair.name, credential: pair.credential }, '') as Json;
    if (enrolled.state !== 'pending') throw new Error(`expected pending enrolment, got ${JSON.stringify(enrolled)}`);
    await this.control.command('device', { id: deviceId, revision: 1, actorId: this.actors[username] });
    const session = await wire('/v1/session', { ...base, username, password: this.password }, pair.credential) as unknown as HubSession;
    return { pair, session, wire };
  }
  async close() { await this.proxy?.close(); await this.control.close(); }
}
/** A real second SQLCipher process. Reopening it is a genuine client-process
 * restart with the same encrypted records, not a copied in-memory Map. */
export class EncryptedClientPort implements SecureStorePort {
  private control: Control | null = null;
  readonly directory: string;
  private readonly key = randomBytes(32).toString('hex');
  constructor(directory?: string) { this.directory = directory ?? mkdtempSync(path.join(tmpdir(), 'sornio-client-')); }
  async open() { if (!this.control) { this.control = new Control(this.directory, ['client-store']); await this.control.command('init', { directory: this.directory, key: this.key }); } }
  private async call<T>(command: string, params: Json) { await this.open(); return this.control!.command<T>(command, params); }
  async get(key: string) { return this.call<string | null>('get', { key }); }
  async set(key: string, value: string) { await this.call('set', { key, value }); }
  async delete(key: string) { await this.call('delete', { key }); }
  async restart() { await this.control?.close(false); this.control = null; await this.open(); }
  async close() { const c = this.control; this.control = null; if (c) { await c.command('shutdown').catch(() => undefined); } rmSync(this.directory, { recursive: true, force: true }); }
}
export function kitchenCommand(pair: HubPair, actorId: string, operationId: string, expectedRevision = 2, ticketId = 'ticket-1', state: 'preparing' | 'ready' | 'served' = 'preparing') {
  return { version: 1 as const, hubId: pair.hub.hubId, businessId: pair.hub.businessId, actorId, operationId, ticketId, expectedRevision, state };
}
export function assertNoFinancialEffects(snapshot: Json) {
  expect(snapshot.financial).toEqual(Object.fromEntries(Object.keys(snapshot.financial as Json).map(k => [k, 0])));
  expect(snapshot.products).toEqual([expect.objectContaining({ id: 'pizza', stock_milli: 10000, unit_price_paise: 10000, revision: 1 })]);
  expect((snapshot.orders as Json[]).every(o => o.settled_invoice === null)).toBe(true);
}
