/**
 * Mint an activation code — the moment a payment becomes a plan.
 *
 * DukaanOS collects its own ₹499 the same way it asks every business to collect:
 * a direct UPI payment, with a reference in the note. Nobody is auto-debited and
 * no card is stored. When the money lands, an operator (or the owner, on a
 * self-hosted deployment) runs this script and sends the code back:
 *
 *   npm run mint:activation -- --plan growth --months 3 --reference UPI-482910
 *   npm run mint:activation -- --plan scale --months 12 --reference UTR-9931 --valid-days 7
 *
 * The code is an HMAC over the plan, the months paid for, the payment reference,
 * and an expiry, signed with `DUKAANOS_ACTIVATION_SECRET`. The secret lives only
 * on the server, so a code cannot be minted from the browser — by anyone,
 * including the owner. An owner pastes the code into **Your Plan**, and the
 * server verifies the signature before issuing the paid plan cookie.
 *
 * Run it with the *same* secret the deployment uses. On a self-hosted install
 * that is the same `.env.local`; on a hosted deployment, run it wherever the
 * server's environment lives (never on a laptop with a copied key).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;

function parseArgs(argv) {
  const args = { plan: '', months: 0, reference: '', validDays: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split('=');
    const next = inline ?? argv[index + 1];
    switch (flag) {
      case '--plan':
        args.plan = next;
        if (inline === undefined) index += 1;
        break;
      case '--months':
        args.months = Number(next);
        if (inline === undefined) index += 1;
        break;
      case '--reference':
        args.reference = next;
        if (inline === undefined) index += 1;
        break;
      case '--valid-days':
        args.validDays = Number(next);
        if (inline === undefined) index += 1;
        break;
      default:
        break;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!process.env.DUKAANOS_ACTIVATION_SECRET || process.env.DUKAANOS_ACTIVATION_SECRET.trim().length < 32) {
  console.error(
    [
      'DUKAANOS_ACTIVATION_SECRET is not set (32+ characters required).',
      '',
      'This is deliberate: with no secret, activation is OFF rather than open.',
      'Set it in the server environment (and in .env.local for self-hosted use):',
      '',
      "  DUKAANOS_ACTIVATION_SECRET=$(openssl rand -hex 32)",
      '',
      'Then run this script with the same environment.',
    ].join('\n'),
  );
  process.exit(1);
}

if (!['growth', 'scale'].includes(args.plan)) {
  console.error('Usage: npm run mint:activation -- --plan <growth|scale> --months <1-36> --reference <payment ref> [--valid-days 30]');
  process.exit(1);
}
if (!Number.isFinite(args.months) || args.months < 1 || args.months > 36) {
  console.error('--months must be between 1 and 36.');
  process.exit(1);
}
if (!args.reference || args.reference.trim().length < 2) {
  console.error('--reference is required: it is how this plan is tied back to a payment.');
  process.exit(1);
}

// Compile the pure activation module with the project's own TypeScript.
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-activation-'));
const tsconfig = join(outDir, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'es2020',
        lib: ['dom', 'dom.iterable', 'esnext'],
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        module: 'node16',
        moduleResolution: 'node16',
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        outDir,
        rootDir: join(root, 'lib'),
        paths: { '@/*': [`${relative(outDir, root)}/*`] },
      },
      files: [join(root, 'lib/plans/activation.ts')],
    },
    null,
    2,
  ),
);

// The API compiler by package path, not `npx tsc`: both TypeScript
// packages ship a `tsc`, so the one on PATH is whichever npm linked last.
execFileSync(process.execPath, [compiler('api', root).file, '-p', tsconfig], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});

const require = createRequire(import.meta.url);
// (named `nodeModule` rather than `module`: the Next.js lint rule reserves
// that identifier, and a verifier that fails lint is a verifier nobody runs)
const nodeModule = require('node:module');
const resolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function aliased(request, ...rest) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    return resolveFilename.call(this, join(outDir, request.slice(2).replace(/^lib\//, '')), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

const activation = require(join(outDir, 'plans/activation.js'));
const plans = require(join(outDir, 'plans/catalogue.js'));

const code = await activation.mintActivationCode({
  planId: args.plan,
  months: args.months,
  reference: args.reference.trim(),
  validDays: args.validDays,
});

rmSync(outDir, { recursive: true, force: true });

const plan = plans.planById(args.plan);
console.log('');
console.log(`  ${plan.name} — ${args.months} month${args.months === 1 ? '' : 's'} — ref ${args.reference.trim()}`);
console.log('');
console.log(`  ${code}`);
console.log('');
console.log('  Send that to the owner. It is redeemed in Your Plan → paste the code → Activate.');
console.log(`  It expires in ${args.validDays ?? activation.ACTIVATION_VALID_DAYS} days if unused, and it is tied to this payment reference.`);
console.log('');
