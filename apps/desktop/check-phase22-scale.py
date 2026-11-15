"""Real native Workspace/SQLCipher workload; no installed-app or duration claim.

All rows are synthetic and written through cashier_review_bridge's native APIs.
Run the read-only phase22_inspect binary after stopping writers to reconcile.
The default dataset is the Phase22 requested initial tier. No automatic upscale.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import platform
from pathlib import Path
import queue
import statistics
import subprocess
import tempfile
import threading
import time

import psutil


class Native:
    def __init__(self, binary, path, archive):
        self.path = path
        self.errors = open(path.with_suffix('.stderr.log'), 'a', encoding='utf-8')
        self.child = subprocess.Popen([binary, str(path)], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=self.errors, text=True,
                                     env={**os.environ, 'SORNIO_REVIEW_BACKUP': str(archive)})
        self.responses = queue.Queue()
        self.scope = None

        def read():
            for line in self.child.stdout:
                self.responses.put(json.loads(line))
            self.responses.put({'ok': False, 'error': 'native process exited'})
        threading.Thread(target=read, daemon=True).start()

    def raw(self, command, **values):
        self.child.stdin.write(json.dumps({'command': command, 'args': {
            **values, **({'scope': self.scope} if self.scope else {})}}) + '\n')
        self.child.stdin.flush()
        return self.responses.get(timeout=120)

    def call(self, command, **values):
        result = self.raw(command, **values)
        assert result.get('ok'), (command, result.get('error'))
        return result.get('value')

    def close(self):
        if self.child.poll() is None:
            self.child.kill()
            self.child.wait(timeout=15)
        self.errors.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bridge', required=True)
    parser.add_argument('--inspect', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--products', type=int, default=5000)
    parser.add_argument('--customers', type=int, default=10000)
    parser.add_argument('--invoices', type=int, default=50000)
    parser.add_argument('--suppliers', type=int, default=1000)
    parser.add_argument('--orders', type=int, default=5000)
    parser.add_argument('--soak-seconds', type=int, default=60)
    args = parser.parse_args()
    binary = str(Path(args.bridge).resolve())
    inspector = str(Path(args.inspect).resolve())
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    result = {'status': 'NOT RUN', 'environment': platform.platform(), 'python': platform.python_version(),
              'sourceSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'workingTreeDiffSha256': hashlib.sha256(subprocess.check_output(['git', 'diff', 'HEAD'])).hexdigest(),
              'executableSha256': hashlib.sha256(Path(binary).read_bytes()).hexdigest(),
              'datasetRequested': vars(args), 'completed': {}, 'measurements': {}, 'assertionsPassed': 0,
              'peakNativeRssBytes': 0, 'nativeCpuSeconds': 0.0,
              'limitations': ['Native stdio acceptance, not installed UI or LAN/TLS',
                              'Concurrent sessions use separate native processes on one encrypted file',
                              'Synthetic kill is a process crash, not physical power loss']}
    secret = 'Synthetic Phase22 owner password'
    native = None
    monitor_stop = threading.Event()
    pids = set()
    cpu = {}

    def save():
        result['elapsedSeconds'] = round(time.monotonic() - started, 3)
        output.write_text(json.dumps(result, indent=2) + '\n')

    def monitor():
        while not monitor_stop.wait(0.25):
            for pid in list(pids):
                try:
                    process = psutil.Process(pid)
                    result['peakNativeRssBytes'] = max(result['peakNativeRssBytes'], process.memory_info().rss)
                    times = process.cpu_times()
                    cpu[pid] = times.user + times.system
                except psutil.Error:
                    pass
            result['nativeCpuSeconds'] = round(sum(cpu.values()), 3)
    threading.Thread(target=monitor, daemon=True).start()

    def check(condition, message):
        assert condition, message
        result['assertionsPassed'] += 1

    def measure(name, task, repetitions=1):
        samples = []
        for _ in range(repetitions):
            before = time.monotonic()
            task()
            samples.append((time.monotonic() - before) * 1000)
        result['measurements'][name] = {'samples': repetitions,
            'medianMs': round(statistics.median(samples), 3), 'maxMs': round(max(samples), 3)}
        save()

    with tempfile.TemporaryDirectory(prefix='sornio-phase22-') as folder:
        path = Path(folder) / 'phase22.db'
        archive = Path(folder) / 'phase22.sorniobackup'

        def start(unlock=False):
            client = Native(binary, path, archive)
            pids.add(client.child.pid)
            if unlock:
                client.call('unlock_workspace', username='owner', password=secret)
                client.scope = client.call('read_local_session')['scope']
            return client

        def seed(name, count, task):
            before = time.monotonic()
            for i in range(count):
                task(i)
                result['completed'][name] = i + 1
                if (i + 1) % 1000 == 0:
                    save()
                    print(f'{name}: {i+1}/{count}, elapsed {time.monotonic()-before:.1f}s', flush=True)
            elapsed = time.monotonic() - before
            result['measurements'][f'seed_{name}'] = {'rows': count, 'elapsedSeconds': elapsed,
                                                     'rowsPerSecond': count / max(elapsed, 0.000001)}
            save()

        def product(i):
            op = f'p22-product-{i}'
            native.call('add_local_product', request={'operationId': op, 'name': f'Synthetic {i:05}',
                'sku': f'P22-{i}', 'unit': 'pcs', 'unitPricePaise': 10000, 'openingStockMilli': 1000000000})
            native.call('acknowledge_local_inventory', operationId=op)

        def customer(i):
            native.call('save_local_customer', r={'operationId': f'p22-customer-op-{i}', 'id': f'p22-customer-{i}',
                'name': f'Synthetic customer {i:05}', 'phone': None, 'creditLimitPaise': None,
                'creditDays': 0, 'expectedRevision': None})

        def supplier(i):
            native.call('save_local_supplier', r={'operationId': f'p22-supplier-op-{i}', 'id': f'p22-supplier-{i}',
                'name': f'Synthetic supplier {i:05}', 'phone': None, 'gstin': None, 'address': None,
                'paymentTermsDays': 30, 'notes': '', 'archived': False, 'expectedRevision': None})

        def sale(i):
            nonlocal native
            op = f'p22-sale-{i}'
            request = {'operationId': op, 'lines': [{'productId': f'p22-product-{i % args.products}',
                'expectedRevision': 1 + i // args.products, 'quantityMilli': 1000}],
                'taxBasisPoints': 0, 'tender': 'cash', 'customerId': None}
            native.call('prepare_local_checkout', request=request)
            saved = native.call('post_local_invoice', request=request)
            check(saved['totalPaise'] == 10000, 'native invoice totals')
            if i % 5000 == 0:
                # Lose the application process immediately after commit, before
                # clearing the checkpoint. Reopen and resend the SAME identity.
                native.close()
                native = start(True)
                check(native.call('post_local_invoice', request=request) == saved, 'lost-ack replay')
            native.call('clear_local_checkout', operationId=op, saved=True)

        def order(i):
            native.call('create_purchase_order', r={'operationId': f'p22-order-{i}',
                'supplierId': f'p22-supplier-{i % args.suppliers}', 'note': 'Synthetic purchase order',
                'lines': [{'productId': f'p22-product-{i % args.products}', 'quantityMilli': 1000,
                           'unitCostPaise': 8000, 'taxBps': 0}]})
        try:
            native = start()
            measure('startup_and_setup', lambda: native.call('setup_local_access', setup={
                'businessName': 'Synthetic Phase22 shop', 'businessType': 'general',
                'displayName': 'Synthetic Owner', 'username': 'owner'}, password=secret))
            native.scope = native.call('read_local_session')['scope']
            for name, count, task in [('products', args.products, product), ('customers', args.customers, customer),
                                      ('suppliers', args.suppliers, supplier), ('orders', args.orders, order),
                                      ('invoices', args.invoices, sale)]:
                seed(name, count, task)
            measure('catalogue_query', lambda: native.call('list_local_products'), 10)
            measure('customer_query', lambda: native.call('find_local_customers', search='09999', overdueOnly=False), 10)
            measure('supplier_query', lambda: native.call('find_local_suppliers', search='00999', includeArchived=False), 10)
            measure('orders_query', lambda: native.call('find_purchase_orders', search='', status='', supplierId='p22-supplier-0'), 10)
            measure('cashier_state_query', lambda: native.call('read_cashier_state'), 10)
            check(native.call('read_cashier_state')['balances']['cashPaise'] == str(args.invoices * 10000), 'cash ledger equals all invoice totals')
            native.close()
            before = time.monotonic()
            native = start(True)
            result['measurements']['restart_unlock_ms'] = (time.monotonic() - before) * 1000
            measure('encrypted_backup', lambda: native.call('export_local_backup', currentPassword=secret,
                    recoveryPassword='Synthetic Phase22 recovery passphrase'))
            check(archive.read_bytes()[:16] != b'SQLite format 3\0', 'backup encrypted')
            result['backupBytes'] = archive.stat().st_size
            # Two concurrent native cashiers race the same product revision on
            # distinct operation ids. Exactly one commit is permitted.
            other = start(True)
            try:
                p = native.call('list_local_products')[0]
                requests = [{'operationId': f'p22-conflict-{i}', 'lines': [{'productId': p['id'],
                    'expectedRevision': p['revision'], 'quantityMilli': 1000}], 'taxBasisPoints': 0,
                    'tender': 'cash', 'customerId': None} for i in range(2)]
                # The checkout checkpoint is intentionally shared by cashiers;
                # direct billing tests own stock-CAS concurrency. Here both
                # prepare attempts must never allow two distinct checkpoints.
                with ThreadPoolExecutor(max_workers=2) as pool:
                    futures = [pool.submit(c.raw, 'prepare_local_checkout', request=r) for c, r in zip([native, other], requests)]
                    answers = [future.result() for future in futures]
                check(sum(bool(a.get('ok')) for a in answers) == 1, 'one shared checkout reservation')
                winner = next(i for i, a in enumerate(answers) if a.get('ok'))
                [native, other][winner].call('clear_local_checkout', operationId=requests[winner]['operationId'], saved=False)
                soak_start = time.monotonic()
                rounds = 0
                while time.monotonic() - soak_start < args.soak_seconds:
                    with ThreadPoolExecutor(max_workers=2) as pool:
                        futures = [pool.submit(c.call, 'read_cashier_state') for c in [native, other]]
                        for future in futures:
                            future.result()
                    rounds += 1
                result['soak'] = {'actualElapsedSeconds': time.monotonic() - soak_start, 'concurrentReadRounds': rounds}
            finally:
                other.close()
            native.close()
            snapshot = json.loads(subprocess.check_output([inspector, str(path)], text=True))
            result['reconciliation'] = snapshot
            for key, expected in [('products', args.products), ('customers', args.customers), ('invoices', args.invoices),
                                  ('suppliers', args.suppliers), ('purchaseOrders', args.orders), ('schema', 23),
                                  ('integrity', 'ok'), ('supplierJournalUnbalancedOperations', 0),
                                  ('supplierEntriesPaise', 0), ('stockMilli', args.products * 1000000000 - args.invoices * 1000)]:
                check(snapshot[key] == expected, f'{key}: {snapshot[key]} != {expected}')
            check(path.read_bytes()[:16] != b'SQLite format 3\0', 'store encrypted')
            result['databaseBytes'] = path.stat().st_size
            result['status'] = 'PASS'
        except Exception as error:
            result['status'] = 'FAIL'
            result['error'] = f'{type(error).__name__}: {error}'
            raise
        finally:
            if native:
                native.close()
            monitor_stop.set()
            save()
            print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
