"""Ciphertext-file preservation evidence, never a backup or decryption check."""
import argparse
import hashlib
import json
from pathlib import Path

FILES = ('workspace.db', 'workspace.db-wal', 'workspace.db-shm', 'provision.lock')


def snapshot(directory):
    directory = Path(directory)
    db = directory / 'workspace.db'
    if not db.is_file() or db.is_symlink() or db.stat().st_size == 0:
        raise ValueError('Expected nonempty regular workspace database')
    result = {}
    for name in FILES:
        file = directory / name
        if file.is_symlink():
            raise ValueError('Refusing symbolic data file')
        if file.exists():
            if not file.is_file():
                raise ValueError('Expected a regular data file')
            digest = hashlib.sha256()
            with file.open('rb') as source:
                for block in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(block)
            result[name] = {'size': file.stat().st_size, 'sha256': digest.hexdigest()}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['snapshot', 'verify'])
    parser.add_argument('directory', type=Path)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    actual = snapshot(args.directory)
    if args.action == 'snapshot':
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        # A hash manifest is not a recoverable copy of the database or vault key.
        args.manifest.write_text(json.dumps(actual, indent=2) + '\n', encoding='utf-8')
    elif actual != json.loads(args.manifest.read_text(encoding='utf-8')):
        raise ValueError('Workspace data changed across installer lifecycle')
    print('Data preservation check passed; database contents were not logged.')


if __name__ == '__main__':
    main()
