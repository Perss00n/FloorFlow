#!/usr/bin/env bash
# Run only on Ubuntu, from the separate FloorFlow project directory.
set -Eeuo pipefail
umask 077
cd /home/marcus/apps/floorflow
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ $# -eq 3 && $2 =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ && $3 =~ ^[a-f0-9]{64}$ ]] || { echo 'Usage: update.sh archive release sha256' >&2; exit 1; }
archive=$(realpath -- "$1")
release=$2
[[ $archive == /home/marcus/apps/floorflow/*.tar.gz && -f $archive && ! -e releases/$release ]] || { echo 'Invalid archive or existing release.' >&2; exit 1; }
[[ $(sha256sum "$archive" | cut -d' ' -f1) == "$3" ]] || { echo 'Archive checksum mismatch.' >&2; exit 1; }

# Validate every entry before extracting. No links, devices, directories or traversal.
python3 - "$archive" "releases/$release" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1]) as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        allowed = member.name in {'package.json','package-lock.json','.dockerignore','db/init/01-schema.sql','deploy/ubuntu/Dockerfile','deploy/ubuntu/compose.yaml'} or (member.name.startswith(('src/','public/')) and path.suffix in {'.js','.html','.css','.svg'})
        if not allowed or path.is_absolute() or '..' in path.parts or not member.isfile():
            raise SystemExit('Unsafe archive entry.')
    archive.extractall(sys.argv[2], filter='data')
PY
# Stack/network changes require a separate review; normal updates replace only the app.
cmp compose.yaml "releases/$release/deploy/ubuntu/compose.yaml" || { echo 'Compose changed; review it separately.' >&2; exit 1; }
docker build -t "floorflow:$release" -f "releases/$release/deploy/ubuntu/Dockerfile" "releases/$release"

previous=$(readlink current)
backup="backups/update-$release"
mkdir -p "$backup"
cp .env "$backup/release.env"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
rollback() {
    trap - ERR
    echo 'Update failed; restoring previous FloorFlow release.' >&2
    ln -s "$previous" .current-rollback
    mv -Tf .current-rollback current
    cp "$backup/release.env" .env
    docker compose up -d --no-build --wait --wait-timeout 90 app
    exit 1
}
trap rollback ERR
ln -s "releases/$release" .current-next
mv -Tf .current-next current
printf 'FLOORFLOW_RELEASE=%s\n' "$release" > .env
docker compose up -d --no-build --wait --wait-timeout 90 app
trap - ERR
docker compose ps
echo "FloorFlow release $release is healthy."
