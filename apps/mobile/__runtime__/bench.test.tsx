/**
 * Measured rendering benchmark.
 *
 * Node benchmark, not a device profile. It measures the JavaScript work needed
 * to build and commit a screen's React tree for a given snapshot size, plus the
 * native node count that work produces. It reports nothing about GPU frames,
 * memory pressure or native view creation — those need Instruments on a
 * simulator or device and are reported as NOT RUN in the Phase 20 review.
 *
 * Run: node scripts/measure-mobile-render.mjs
 */
import { DemoSnapshotAdapter } from '@sornio/mobile-contracts';
import { CompanionProvider } from '../src/app/CompanionContext';
import { ActivityScreen } from '../src/screens/ActivityScreen';
import { InventoryScreen } from '../src/screens/InventoryScreen';
import { CustomersScreen } from '../src/screens/CustomersScreen';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { benchmarkSnapshot } from './fixtures';
import { act, device, render, screen, useDevice, visibleText, waitFor } from './harness';

/** A single screen build beyond this is treated as unusable and reported as such. */
const BUDGET_MS = 20000;

const MEASUREMENTS: string[] = [];

function record(line: string) {
  MEASUREMENTS.push(line);
  // eslint-disable-next-line no-console
  console.log(line);
}

function nodeCount(node: unknown): number {
  if (!node || typeof node !== 'object') return 1;
  const children = (node as { children?: unknown[] }).children ?? [];
  return 1 + children.reduce<number>((total, child) => total + nodeCount(child), 0);
}

async function measure(
  label: string,
  element: React.ReactElement,
  snapshotSize: { activity: number; inventory: number; customers: number },
  rows: number,
) {
  jest.restoreAllMocks();
  const snapshot = benchmarkSnapshot(snapshotSize);
  jest.spyOn(DemoSnapshotAdapter.prototype, 'load').mockResolvedValue(snapshot as never);

  let timedOut = false;
  const mountedAt = performance.now();
  await render(<ThemeProvider><CompanionProvider>{element}</CompanionProvider></ThemeProvider>);
  try {
    await waitFor(() => expect(visibleText(screen)).toContain('DEMO — these figures are not a live business record.'), {
      timeout: BUDGET_MS,
    });
    await act(async () => {
      await Promise.resolve();
    });
  } catch {
    timedOut = true;
  }
  const total = performance.now() - mountedAt;
  const nodes = nodeCount(screen.toJSON());

  record(
    timedOut
      ? `${label}\trows=${rows}\tEXCEEDED ${BUDGET_MS}ms budget\tpartial-nodes=${nodes}`
      : `${label}\trows=${rows}\ttotal=${total.toFixed(0)}ms\tnative-nodes=${nodes}\tnodes/row=${(nodes / rows).toFixed(1)}`,
  );
  screen.unmount();
  jest.restoreAllMocks();
  return { timedOut, total, nodes };
}

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(`\n--- PHASE 20 HEADLESS RENDER MEASUREMENTS ---\n${MEASUREMENTS.join('\n')}`);
});

describe('measured rendering cost', () => {
  beforeEach(() => useDevice(device('iPhone 16 portrait')));

  /**
   * One screen per test. `CompanionContext` holds module-level singletons
   * (engine, cache, secure store), so mounting a second provider inside the same
   * test would resume the previous screen's session and measure the wrong tree.
   * A fresh test gets a fresh module registry.
   */
  const cases: {
    label: string;
    element: React.ReactElement;
    size: { activity: number; inventory: number; customers: number };
    rows: number;
  }[] = [
    { label: 'activity', element: <ActivityScreen />, size: { activity: 200, inventory: 20, customers: 20 }, rows: 200 },
    { label: 'activity', element: <ActivityScreen />, size: { activity: 1000, inventory: 20, customers: 20 }, rows: 1000 },
    { label: 'activity', element: <ActivityScreen />, size: { activity: 3000, inventory: 20, customers: 20 }, rows: 3000 },
    { label: 'inventory', element: <InventoryScreen />, size: { activity: 20, inventory: 2000, customers: 20 }, rows: 2000 },
    { label: 'customers', element: <CustomersScreen />, size: { activity: 20, inventory: 20, customers: 1500 }, rows: 1500 },
  ];

  for (const item of cases) {
    it(
      `records ${item.label} list cost at ${item.rows} rows`,
      async () => {
        await measure(item.label, item.element, item.size, item.rows);
      },
      180000,
    );
  }

  it(
    'records keystroke cost while filtering a large list',
    async () => {
      jest
        .spyOn(DemoSnapshotAdapter.prototype, 'load')
        .mockResolvedValue(benchmarkSnapshot({ activity: 1000, inventory: 20, customers: 20 }) as never);
      await render(
        <ThemeProvider>
          <CompanionProvider>
            <ActivityScreen />
          </CompanionProvider>
        </ThemeProvider>,
      );
      await waitFor(() => expect(visibleText(screen)).toContain('DEMO — these figures are not a live business record.'), { timeout: BUDGET_MS });
      const field = screen.getByLabelText('Search invoices, payments, expenses');
      const { fireEvent } = require('@testing-library/react-native');
      const samples: number[] = [];
      for (const value of ['a', 'am', 'amu', 'amun', 'amund', 'amunde']) {
        const started = performance.now();
        await act(async () => {
          fireEvent.changeText(field, value);
        });
        samples.push(performance.now() - started);
      }
      const average = samples.reduce((total, value) => total + value, 0) / samples.length;
      record(
        `activity filter\trows=1000\tper-keystroke=${samples.map((v) => v.toFixed(0)).join('/')}ms\taverage=${average.toFixed(1)}ms`,
      );
      screen.unmount();
    },
    120000,
  );
});
