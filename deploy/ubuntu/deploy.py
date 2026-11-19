"""Root-owned, outbound-only FloorFlow CI artifact consumer. Standard library only."""
import argparse
import datetime
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from release import MAX_BYTES, validate_archive
import tarfile

REPOSITORY = 'Perss00n/FloorFlow'
REPOSITORY_ID = 1460330626
ROOT = pathlib.Path('/home/marcus/apps/floorflow')
STATE = pathlib.Path('/var/lib/floorflow-deploy')
UPDATER = '/usr/local/lib/floorflow/update.sh'
TOKEN = pathlib.Path('/etc/floorflow-deploy/github.token')


class DeploymentError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class GitHub:
    def __init__(self, token):
        self.headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'FloorFlow-Ubuntu-Deploy'}

    def request(self, path):
        return urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + '/' + path,
                                      headers=self.headers)

    def get(self, path):
        # No redirects with an Authorization header, including for JSON endpoints.
        with urllib.request.build_opener(NoRedirect).open(self.request(path), timeout=20) as response:
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise DeploymentError('GitHub response exceeded the size limit.')
            return json.loads(data)

    def download(self, artifact_id):
        try:
            urllib.request.build_opener(NoRedirect).open(
                self.request(f'actions/artifacts/{int(artifact_id)}/zip'), timeout=20)
        except urllib.error.HTTPError as response:
            if response.code != 302:
                raise
            location = response.headers.get('Location', '')
        else:
            raise DeploymentError('Expected GitHub artifact redirect.')
        url = urllib.parse.urlsplit(location)
        if url.scheme != 'https' or not url.hostname or url.username or url.password:
            raise DeploymentError('Unsafe artifact download location.')
        # The signed download receives no GitHub credential, even on redirects.
        with urllib.request.build_opener(NoRedirect).open(location, timeout=45) as response:
            if urllib.parse.urlsplit(response.url).scheme != 'https':
                raise DeploymentError('Artifact download must use HTTPS.')
            data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise DeploymentError('Artifact exceeded the size limit.')
        return data


def candidate(api):
    sha = api.get('commits/main')['sha']
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise DeploymentError('Invalid main commit.')
    runs = api.get(f'actions/workflows/ci.yml/runs?head_sha={sha}&branch=main&event=push&per_page=100')['workflow_runs']
    if not runs:
        return sha, None
    run = max(runs, key=lambda item: item['id'])
    if (run['head_sha'] != sha or run['head_branch'] != 'main' or run['event'] != 'push'
            or run['path'] != '.github/workflows/ci.yml'
            or run['head_repository']['id'] != REPOSITORY_ID):
        raise DeploymentError('CI identity does not match this repository and main commit.')
    if run['status'] != 'completed' or run['conclusion'] != 'success':
        return sha, None
    artifacts = api.get(f"actions/runs/{run['id']}/artifacts?per_page=100")['artifacts']
    expected_name = f"floorflow-ubuntu-{sha}-{run['id']}-{run['run_attempt']}"
    matches = [item for item in artifacts if item['name'] == expected_name and not item['expired']]
    if len(matches) != 1:
        return sha, None
    artifact = matches[0]
    identity = artifact.get('workflow_run', {})
    if (identity.get('id') != run['id'] or identity.get('head_sha') != sha
            or identity.get('head_branch') != 'main'
            or not re.fullmatch(r'sha256:[a-f0-9]{64}', artifact.get('digest') or '')
            or not 0 < artifact['size_in_bytes'] <= MAX_BYTES):
        raise DeploymentError('Artifact identity or digest is invalid.')
    return sha, {'commit': sha, 'release': 'git-' + sha, 'run_id': run['id'],
                 'run_attempt': run['run_attempt'], 'artifact': artifact}


def unpack_artifact(data, expected):
    artifact = expected['artifact']
    if 'sha256:' + hashlib.sha256(data).hexdigest() != artifact['digest']:
        raise DeploymentError('GitHub artifact SHA-256 mismatch.')
    name = 'floorflow-' + expected['release'] + '.tar.gz'
    manifest_name = name[:-3] + '.json'
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if (sorted(item.filename for item in entries) != sorted([name, manifest_name])
                or any(item.file_size > MAX_BYTES for item in entries)):
            raise DeploymentError('Unexpected artifact entries.')
        manifest = json.loads(archive.read(manifest_name))
        source = archive.read(name)
    for field in ('commit', 'release', 'run_id', 'run_attempt'):
        if manifest.get(field) != expected[field]:
            raise DeploymentError('Release manifest does not match the exact CI attempt.')
    if (manifest.get('format') != 1 or manifest.get('archive') != name
            or hashlib.sha256(source).hexdigest() != manifest.get('sha256')):
        raise DeploymentError('Source archive checksum or format mismatch.')
    with tarfile.open(fileobj=io.BytesIO(source)) as archive:
        members = validate_archive(archive)
        if len(members) != manifest.get('files'):
            raise DeploymentError('Source archive file count mismatch.')
    return source, manifest


def read_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path, value):
    temporary = path.with_suffix('.next')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def poll(api, check_only=False):
    installed = read_json(STATE / 'installed.json', {})
    blocked = read_json(STATE / 'blocked.json', {})
    if (STATE / 'paused').exists() and not check_only:
        print('Automatic deployment is paused.')
        return
    attempt = read_json(STATE / 'attempt.json', None)
    if attempt and not check_only:
        # The updater can finish just before the polling process is interrupted.
        # Reconcile that narrow gap instead of rebuilding or claiming a rollback.
        if not (ROOT / '.deployment-pending').exists() and (ROOT / 'current').readlink() == pathlib.Path('releases/' + attempt['release']):
            health = subprocess.run(['docker', 'inspect', '--format', '{{.Config.Image}}|{{.State.Health.Status}}',
                                     'floorflow-app-1'], capture_output=True, text=True, check=False)
            if health.returncode or health.stdout.strip() != 'floorflow:' + attempt['release'] + '|healthy':
                (STATE / 'paused').touch(mode=0o600)
                raise DeploymentError('Interrupted completion is not healthy; operator review required.')
            if installed:
                write_json(STATE / 'previous.json', installed)
            write_json(STATE / 'installed.json', attempt)
            (STATE / 'attempt.json').unlink()
            installed = attempt
            print('Recovered successful installation metadata: ' + attempt['commit'][:12])
            attempt = None
    if attempt and not check_only:
        # A killed service or host reboot must never rebuild the interrupted commit.
        recovered = subprocess.run([UPDATER, '--recover'], check=False).returncode == 0
        blocked[attempt['commit']] = {'at': timestamp(), 'reason': 'Interrupted deployment'}
        write_json(STATE / 'blocked.json', blocked)
        (STATE / 'attempt.json').unlink()
        if not recovered:
            (STATE / 'paused').touch(mode=0o600)
            raise DeploymentError('Recovery failed; automatic deployment paused for operator review.')
        print('Interrupted commit blocked; previous release recovery completed.')
    sha, selected = candidate(api)
    if installed.get('commit') == sha:
        print('Already installed: ' + sha[:12])
        return
    if sha in blocked:
        print('Blocked commit ignored: ' + sha[:12])
        return
    if selected is None:
        print('Waiting for successful exact-main CI and its Ubuntu artifact: ' + sha[:12])
        return
    if check_only:
        print('Verified candidate (check only): ' + sha[:12])
        return
    data = api.download(selected['artifact']['id'])
    source, manifest = unpack_artifact(data, selected)
    archive = ROOT / ('incoming-' + selected['release'] + '.tar.gz')
    with tempfile.NamedTemporaryFile(dir=ROOT, prefix='.incoming-', suffix='.download', delete=False) as output:
        temporary = pathlib.Path(output.name)
        try:
            output.write(source)
            output.close()
            temporary.replace(archive)
        finally:
            temporary.unlink(missing_ok=True)
    record = {key: selected[key] for key in ('commit', 'release', 'run_id', 'run_attempt')}
    record.update(at=timestamp(), sha256=manifest['sha256'])
    write_json(STATE / 'attempt.json', record)
    result = subprocess.run([UPDATER, str(archive), selected['release'], manifest['sha256'],
                             str(selected['run_id']), str(selected['run_attempt'])], check=False)
    if result.returncode:
        blocked[sha] = {'at': timestamp(), 'reason': 'Updater failed; inspect journal'}
        write_json(STATE / 'blocked.json', blocked)
        (STATE / 'attempt.json').unlink()
        if (ROOT / '.deployment-pending').exists():
            (STATE / 'paused').touch(mode=0o600)
        raise DeploymentError('Update failed; commit blocked. Existing releases retained.')
    record['at'] = timestamp()
    if installed:
        write_json(STATE / 'previous.json', installed)
    write_json(STATE / 'installed.json', record)
    (STATE / 'attempt.json').unlink()
    print('Installed and healthy: ' + sha[:12])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--deploy', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--verify', nargs=3, metavar=('RELEASE', 'RUN_ID', 'ATTEMPT'))
    args = parser.parse_args()
    os.umask(0o077)
    if os.geteuid() != 0:
        raise DeploymentError('Run with sudo.')
    token_stat = TOKEN.lstat()
    if TOKEN.is_symlink() or token_stat.st_uid != 0 or token_stat.st_mode & 0o077:
        raise DeploymentError('GitHub token must be a root-owned private file.')
    api = GitHub(TOKEN.read_text().strip())
    if args.verify:
        _, selected = candidate(api)
        release, run_id, attempt = args.verify
        if (selected is None or selected['release'] != release
                or selected['run_id'] != int(run_id) or selected['run_attempt'] != int(attempt)):
            raise DeploymentError('Main or CI changed during the build; candidate will not be activated.')
        return
    # The service and manual invocations share the same lock. The updater has its own lock.
    import fcntl
    STATE.mkdir(mode=0o700, exist_ok=True)
    with (STATE / 'deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another FloorFlow deployment is running.')
            return
        poll(api, check_only=args.check)


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f'No deployment: GitHub HTTP {error.code}; check token permissions/expiry and rate limits.', file=sys.stderr)
        sys.exit(1)
    except DeploymentError as error:
        print('No deployment: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, tarfile.TarError):
        # No request URLs, Authorization headers, archive contents or runtime secrets in logs.
        print('No deployment: validation, recovery or network operation failed; inspect local status and CI.', file=sys.stderr)
        sys.exit(1)
