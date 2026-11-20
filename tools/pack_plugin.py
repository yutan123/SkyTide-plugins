#!/usr/bin/env python3
"""Pack a plugin directory into a ZIP for sideloading.
Usage:
  python3 tools/pack_plugin.py examples/hello --out /tmp/hello.zip
The ZIP will contain files at the root level (no extra wrapper directory).
"""
import argparse
import hashlib
import os
import tempfile
import sys
import zipfile
from pathlib import Path
from validate_plugin import validate


def main():
    parser = argparse.ArgumentParser(description='Pack a SkyTide plugin directory into a ZIP.')
    parser.add_argument('dir', help='Plugin source directory containing manifest.json')
    parser.add_argument('--out', help='Output path (default: <dir>.zip)')
    parser.add_argument('--check', action='store_true', help='Validate without writing an archive')
    args = parser.parse_args()
    src = Path(args.dir).resolve()
    try:
        validate(src)
    except (OSError, ValueError, TypeError) as error:
        sys.exit(f'Error: {error}')
    if args.check:
        print(f'Valid: {src}')
        return
    if not (src / 'manifest.json').exists():
        sys.exit(f'Error: {src}/manifest.json not found')

    out = Path(args.out) if args.out else src.with_suffix('.zip')
    out = out.resolve()
    if out == src or src in out.parents:
        sys.exit('Error: output must be outside the plugin source directory')
    paths = sorted(src.rglob('*'))
    if any(path.is_symlink() for path in paths):
        sys.exit('Error: symbolic links are not supported')
    out.parent.mkdir(parents=True, exist_ok=True)

    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=out.parent, prefix='.zip-', delete=False) as stream:
            temporary = Path(stream.name)
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            for path in paths:
                if path.is_file():
                    if path.is_symlink() or not path.resolve().is_relative_to(src):
                        raise ValueError('source path changed during packaging')
                    arcname = path.relative_to(src).as_posix()
                    info = zipfile.ZipInfo(arcname, (1980, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.create_system = 3
                    info.external_attr = 0o100644 << 16
                    zf.writestr(info, path.read_bytes())
        if temporary.stat().st_size > 256 * 1024 * 1024:
            raise ValueError('archive exceeds 256 MiB')
        digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
        os.replace(temporary, out)
        temporary = None
        print(f'SHA-256: {digest}')
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        sys.exit(f'Error: {error}')
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    size_kb = out.stat().st_size / 1024
    print(f'\nPacked {out} ({size_kb:.1f} KB)')


if __name__ == '__main__':
    main()
