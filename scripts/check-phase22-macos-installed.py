"""Install and launch the actual unsigned macOS bundle and probe native UI access.

A missing Accessibility grant is BLOCKED, never a purchasing acceptance pass.
This probe deliberately makes no notarization, Keychain or full-lifecycle claim.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    result = {'status': 'NOT RUN', 'sourceSha': os.environ.get('GITHUB_SHA'),
              'environment': platform.platform(), 'installation': 'NOT RUN', 'launch': 'NOT RUN',
              'purchasingLifecycle': 'NOT RUN', 'signedDistribution': 'NOT RUN'}
    try:
        assert platform.system() == 'Darwin', 'Requires macOS'
        source = Path(args.app).resolve()
        executables = list((source / 'Contents/MacOS').iterdir())
        assert len(executables) == 1, 'Expected one application executable'
        result['executableSha256'] = hashlib.sha256(executables[0].read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory(prefix='sornio-phase22-installed-') as folder:
            installed = Path(folder) / source.name
            shutil.copytree(source, installed)
            result['installedPath'] = str(installed)
            assert hashlib.sha256((installed / 'Contents/MacOS' / executables[0].name).read_bytes()).hexdigest() == result['executableSha256']
            result['installation'] = 'PASS'
            process = subprocess.Popen([str(installed / 'Contents/MacOS' / executables[0].name)],
                stdout=(output.parent / 'macos-stdout.log').open('w'),
                stderr=(output.parent / 'macos-stderr.log').open('w'))
            try:
                time.sleep(10)
                assert process.poll() is None, f'Installed application exited {process.returncode}'
                result['launch'] = 'PASS'
                probe = subprocess.run(['osascript', '-e',
                    'tell application "System Events" to get UI elements enabled'],
                    text=True, capture_output=True, timeout=20)
                result['accessibilityProbe'] = {'exitCode': probe.returncode,
                    'stdout': probe.stdout.strip(), 'stderr': probe.stderr.strip()}
                subprocess.run(['screencapture', '-x', str(output.parent / 'macos-installed.png')], check=False)
                if probe.returncode != 0 or probe.stdout.strip() != 'true':
                    result.update(status='BLOCKED', purchasingLifecycle='BLOCKED',
                        reason='Native Accessibility automation is unavailable to this hosted runner; full purchasing interaction cannot execute.')
                else:
                    result.update(status='BLOCKED', purchasingLifecycle='BLOCKED',
                        reason='App installed and launched; macOS purchasing interaction driver still required. Windows UIA driver cannot run on macOS.')
            finally:
                process.kill()
                process.wait(timeout=15)
    except Exception as error:
        result.update(status='FAIL', reason=f'{type(error).__name__}: {error}')
    finally:
        result['elapsedSeconds'] = time.monotonic() - started
        output.write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))
    return 0 if result['status'] == 'PASS' else 78 if result['status'] == 'BLOCKED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
