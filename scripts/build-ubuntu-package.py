"""Create a source-only Ubuntu release. Never reads environment files or credentials."""
import argparse
import hashlib
import json
import pathlib
import re
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('release', help='Unique release name, e.g. 20261119-02')
args = parser.parse_args()
if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', args.release):
    parser.error('Use a simple, unique release name.')
root = pathlib.Path(__file__).resolve().parents[1]
files = json.loads((root / 'scripts/deployment-files.json').read_text())
files += ['.dockerignore', 'deploy/ubuntu/Dockerfile', 'deploy/ubuntu/compose.yaml']
for name in files:
    if not (name in {'package.json', 'package-lock.json', '.dockerignore', 'db/init/01-schema.sql',
                     'deploy/ubuntu/Dockerfile', 'deploy/ubuntu/compose.yaml'}
            or (name.startswith(('src/', 'public/')) and name.endswith(('.js', '.html', '.css', '.svg')))):
        raise SystemExit('Unexpected deployment file.')
    path = root / name
    if '..' in pathlib.PurePosixPath(name).parts or not path.is_file() or path.is_symlink():
        raise SystemExit('Missing or unsafe deployment file.')
output = root / '.tmp/ubuntu'
output.mkdir(parents=True, exist_ok=True)
archive_path = output / f'floorflow-{args.release}.tar.gz'
with tarfile.open(archive_path, 'x:gz') as archive:
    for name in files:
        archive.add(root / name, arcname=name, recursive=False)
with tarfile.open(archive_path) as archive:
    if sorted(archive.getnames()) != sorted(files) or not all(m.isfile() for m in archive.getmembers()):
        raise SystemExit('Archive verification failed.')
report = {'release': args.release, 'archive': str(archive_path), 'files': len(files),
          'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest()}
archive_path.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
