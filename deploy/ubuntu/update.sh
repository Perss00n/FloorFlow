#!/usr/bin/env bash
# Installed separately from application archives; never auto-updated by a release.
set -Eeuo pipefail
umask 077
root=/home/marcus/apps/floorflow
cd "$root"
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
exec 9>/run/lock/floorflow-update.lock
flock -n 9 || { echo 'Another FloorFlow update is running.' >&2; exit 1; }
compose() {
    docker compose --project-name floorflow --project-directory "$root" \
        --env-file "$root/.env" --file "$root/compose.yaml" "$@"
}
restore() {
    local failed_release=$1 previous
    [[ $failed_release =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || return 1
    local backup="backups/update-$failed_release"
    previous=$(cat "$backup/previous-release.txt") || return 1
    [[ $previous =~ ^releases/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ && -d $previous ]] || return 1
    ln -s "$previous" .current-restore || return 1
    mv -Tf .current-restore current || return 1
    cp "$backup/release.env" .env.next || return 1
    mv -Tf .env.next .env || return 1
    compose up -d --no-build --wait --wait-timeout 90 app || return 1
    rm -- .deployment-pending || return 1
    echo 'Previous FloorFlow release restored and healthy.'
}
if [[ ${1:-} == --recover && $# -eq 1 ]]; then
    if [[ -f .deployment-pending ]]; then restore "$(cat .deployment-pending)"; fi
    exit 0
fi
if [[ ${1:-} == --rollback && $# -eq 1 ]]; then
    [[ -f /var/lib/floorflow-deploy/paused && ! -e .deployment-pending ]] || { echo 'Pause deployment and recover pending work first.' >&2; exit 1; }
    active=$(readlink current)
    [[ $active =~ ^releases/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || exit 1
    active=${active#releases/}
    [[ -f backups/update-$active/release.env && -f backups/update-$active/previous-release.txt ]] || exit 1
    printf '%s\n' "$active" > .deployment-pending
    restore "$active"
    exit 0
fi
[[ ! -e .deployment-pending ]] || { echo 'An interrupted update requires --recover first.' >&2; exit 1; }
[[ ( $# -eq 3 || $# -eq 5 ) && $2 =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ && $3 =~ ^[a-f0-9]{64}$ ]] || { echo 'Usage: update.sh archive release sha256 [ci-run-id ci-attempt]' >&2; exit 1; }
if [[ $# -eq 5 ]]; then
    [[ $2 =~ ^git-[a-f0-9]{40}$ && $4 =~ ^[1-9][0-9]*$ && $5 =~ ^[1-9][0-9]*$ ]] || exit 1
fi
[[ ! -L $1 ]] || { echo 'Archive symlinks are forbidden.' >&2; exit 1; }
archive=$(realpath -- "$1")
release=$2
[[ $(dirname "$archive") == "$root" && $archive == *.tar.gz && -f $archive && ! -e releases/$release && ! -L releases/$release ]] || { echo 'Invalid archive or existing release.' >&2; exit 1; }
[[ $(sha256sum "$archive" | cut -d' ' -f1) == "$3" ]] || { echo 'Archive checksum mismatch.' >&2; exit 1; }
python3 /usr/local/lib/floorflow/release.py "$archive" "releases/$release"
cmp --silent compose.yaml "releases/$release/deploy/ubuntu/compose.yaml" || { echo 'Compose changed; review it separately.' >&2; exit 1; }
# Nothing running has changed if validation or the build fails.
docker build -t "floorflow:$release" -f "releases/$release/deploy/ubuntu/Dockerfile" "releases/$release"
if [[ $# -eq 5 ]]; then
    python3 /usr/local/lib/floorflow/deploy.py --verify "$release" "$4" "$5"
fi
previous=$(readlink current)
[[ $previous =~ ^releases/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ && -d $previous ]] || exit 1
backup="backups/update-$release"
mkdir "$backup"
cp .env "$backup/release.env"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
printf '%s\n' "$release" > .deployment-pending.next
mv -Tf .deployment-pending.next .deployment-pending
rollback() {
    local status=$?
    trap - EXIT INT TERM
    if [[ $status -ne 0 ]]; then
        echo 'Update failed; restoring previous FloorFlow release.' >&2
        restore "$release" || echo 'ROLLBACK FAILED: operator intervention required; pending marker retained.' >&2
    fi
    exit "$status"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ln -s "releases/$release" .current-next
mv -Tf .current-next current
printf 'FLOORFLOW_RELEASE=%s\n' "$release" > .env.next
mv -Tf .env.next .env
compose up -d --no-build --wait --wait-timeout 90 app
rm -- .deployment-pending
trap - EXIT INT TERM
echo "FloorFlow release $release is healthy."
