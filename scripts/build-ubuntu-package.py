"""Create a source-only Ubuntu release. Never reads environment files or credentials."""
import argparse
import hashlib
import json
import pathlib
import re
import tarfile
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'deploy/ubuntu'))
from release import allowed_path, validate_archive

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('release', help='Unique release name, e.g. 20261119-02')
parser.add_argument('--commit', help='Full Git commit SHA; required together with CI run metadata')
parser.add_argument('--run-id', type=int)
parser.add_argument('--run-attempt', type=int)
args = parser.parse_args()
if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', args.release):
    parser.error('Use a simple, unique release name.')
if any(value is not None for value in (args.commit, args.run_id, args.run_attempt)):
    if (not re.fullmatch(r'[a-f0-9]{40}', args.commit or '')
            or not args.run_id or args.run_id < 1 or not args.run_attempt or args.run_attempt < 1
            or args.release != 'git-' + args.commit):
        parser.error('CI packages require an exact commit, matching release and positive run metadata.')
root = pathlib.Path(__file__).resolve().parents[1]
files = json.loads((root / 'scripts/deployment-files.json').read_text())
files += ['.dockerignore', 'deploy/ubuntu/Dockerfile', 'deploy/ubuntu/compose.yaml']
for name in files:
    if not allowed_path(name):
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
    validate_archive(archive)
    if sorted(archive.getnames()) != sorted(files) or not all(m.isfile() for m in archive.getmembers()):
        raise SystemExit('Archive verification failed.')
report = {'format': 1, 'release': args.release, 'archive': archive_path.name, 'files': len(files),
          'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest()}
if args.commit:
    report.update(commit=args.commit, run_id=args.run_id, run_attempt=args.run_attempt)
archive_path.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
