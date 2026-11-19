"""Offline deployment regressions: no GitHub, Azure, model or production access."""
import copy
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'deploy/ubuntu'))
import deploy
import release

SHA = 'a' * 40
RUN = {'id': 101, 'head_sha': SHA, 'head_branch': 'main', 'event': 'push',
       'path': '.github/workflows/ci.yml', 'head_repository': {'id': deploy.REPOSITORY_ID},
       'status': 'completed', 'conclusion': 'success', 'run_attempt': 1}
ARTIFACT = {'id': 202, 'name': 'floorflow-ubuntu-' + SHA + '-101-1', 'expired': False,
            'workflow_run': {'id': 101, 'head_sha': SHA, 'head_branch': 'main'},
            'digest': 'sha256:' + 'f' * 64, 'size_in_bytes': 1024}


def source_archive(extra=None, compose=None):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w:gz') as archive:
        for name in sorted(release.REQUIRED):
            content = (compose if name == 'deploy/ubuntu/compose.yaml' else b'fixture') or b'fixture'
            info = tarfile.TarInfo(name)
            info.size = len(content)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(content))
        if extra:
            archive.addfile(extra, io.BytesIO(b''))
    return data.getvalue()


def packaged_artifact():
    source = source_archive()
    selected = {'commit': SHA, 'release': 'git-' + SHA, 'run_id': 101,
                'run_attempt': 1, 'artifact': copy.deepcopy(ARTIFACT)}
    name = 'floorflow-git-' + SHA + '.tar.gz'
    manifest = {key: selected[key] for key in ('commit', 'release', 'run_id', 'run_attempt')}
    manifest.update(format=1, archive=name, sha256=hashlib.sha256(source).hexdigest(), files=len(release.REQUIRED))
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        archive.writestr(name, source)
        archive.writestr(name[:-3] + '.json', json.dumps(manifest))
    data = output.getvalue()
    selected['artifact']['digest'] = 'sha256:' + hashlib.sha256(data).hexdigest()
    return data, selected


class FakeGitHub:
    def __init__(self):
        self.runs = [copy.deepcopy(RUN)]
        self.artifacts = [copy.deepcopy(ARTIFACT)]
        self.downloads = 0

    def get(self, path):
        if path == 'commits/main':
            return {'sha': SHA}
        if path.startswith('actions/workflows/ci.yml/runs?'):
            return {'workflow_runs': self.runs}
        if path == 'actions/runs/101/artifacts?per_page=100':
            return {'artifacts': self.artifacts}
        raise AssertionError('Unexpected API request: ' + path)

    def download(self, _artifact_id):
        self.downloads += 1
        return packaged_artifact()[0]


class UbuntuSafetyTests(unittest.TestCase):
    def test_verified_exact_main_candidate(self):
        sha, selected = deploy.candidate(FakeGitHub())
        self.assertEqual(sha, SHA)
        self.assertEqual(selected['run_id'], RUN['id'])

    def test_missing_pending_and_failed_ci_are_never_candidates(self):
        for conclusion, status in [(None, 'in_progress'), ('failure', 'completed'), ('cancelled', 'completed')]:
            api = FakeGitHub()
            api.runs[0].update(conclusion=conclusion, status=status)
            self.assertIsNone(deploy.candidate(api)[1])
        api.runs = []
        self.assertIsNone(deploy.candidate(api)[1])

    def test_older_success_cannot_override_latest_failed_ci(self):
        api = FakeGitHub()
        api.runs.append({**copy.deepcopy(RUN), 'id': 102, 'conclusion': 'failure'})
        self.assertIsNone(deploy.candidate(api)[1])

    def test_wrong_commit_branch_event_repository_or_workflow_is_rejected(self):
        for field, value in [('head_sha', 'b' * 40), ('head_branch', 'other'), ('event', 'pull_request'),
                             ('path', '.github/workflows/deploy.yml'), ('head_repository', {'id': 123})]:
            api = FakeGitHub()
            api.runs[0][field] = value
            with self.subTest(field=field), self.assertRaises(deploy.DeploymentError):
                deploy.candidate(api)

    def test_missing_expired_duplicate_or_wrong_artifact_cannot_deploy(self):
        for artifacts in [[], [{**ARTIFACT, 'expired': True}], [ARTIFACT, ARTIFACT]]:
            api = FakeGitHub()
            api.artifacts = artifacts
            self.assertIsNone(deploy.candidate(api)[1])
        for fields in [{'digest': None}, {'workflow_run': {**ARTIFACT['workflow_run'], 'head_sha': 'b' * 40}},
                       {'workflow_run': {**ARTIFACT['workflow_run'], 'id': 999}}]:
            api.artifacts = [{**copy.deepcopy(ARTIFACT), **fields}]
            with self.assertRaises(deploy.DeploymentError):
                deploy.candidate(api)

    def test_valid_artifact_has_two_verified_checksum_layers(self):
        data, selected = packaged_artifact()
        source, manifest = deploy.unpack_artifact(data, selected)
        self.assertEqual(hashlib.sha256(source).hexdigest(), manifest['sha256'])

    def test_tampered_artifact_and_wrong_attempt_are_rejected(self):
        data, selected = packaged_artifact()
        with self.assertRaises(deploy.DeploymentError):
            deploy.unpack_artifact(data + b'changed', selected)
        selected['run_attempt'] = 2
        with self.assertRaises(deploy.DeploymentError):
            deploy.unpack_artifact(data, selected)

    def test_archive_rejects_traversal_secrets_links_duplicates_and_devices(self):
        for name, kind in [('src/../../etc/passwd.js', tarfile.REGTYPE), ('/src/evil.js', tarfile.REGTYPE),
                           ('src\\evil.js', tarfile.REGTYPE), ('config/runtime.env', tarfile.REGTYPE),
                           ('state/ai-usage.json', tarfile.REGTYPE), ('.env', tarfile.REGTYPE),
                           ('src/link.js', tarfile.SYMTYPE), ('src/hard.js', tarfile.LNKTYPE),
                           ('src/device.js', tarfile.CHRTYPE), ('package.json', tarfile.REGTYPE)]:
            info = tarfile.TarInfo(name)
            info.type = kind
            with tarfile.open(fileobj=io.BytesIO(source_archive(extra=info))) as archive:
                with self.subTest(name=name), self.assertRaises(ValueError):
                    release.validate_archive(archive)

    def test_archive_rejects_missing_and_oversized_content(self):
        with tarfile.open(fileobj=io.BytesIO(), mode='w') as archive:
            with self.assertRaises(ValueError):
                release.validate_archive(archive)
        class Oversized:
            def getmembers(self):
                result = [tarfile.TarInfo(name) for name in release.REQUIRED]
                result[0].size = release.MAX_BYTES + 1
                return result
        with self.assertRaises(ValueError):
            release.validate_archive(Oversized())

    def test_installed_or_blocked_commit_does_not_download_or_update(self):
        for filename, value in [('installed.json', {'commit': SHA}), ('blocked.json', {SHA: {'reason': 'test'}})]:
            with tempfile.TemporaryDirectory() as directory:
                state = pathlib.Path(directory)
                (state / filename).write_text(json.dumps(value))
                api = FakeGitHub()
                with patch.object(deploy, 'STATE', state), patch.object(deploy.subprocess, 'run') as updater:
                    deploy.poll(api)
                    updater.assert_not_called()
                self.assertEqual(api.downloads, 0)

    def test_failed_ci_does_not_invoke_updater(self):
        with tempfile.TemporaryDirectory() as directory:
            api = FakeGitHub()
            api.runs[0]['conclusion'] = 'failure'
            with patch.object(deploy, 'STATE', pathlib.Path(directory)), patch.object(deploy.subprocess, 'run') as updater:
                deploy.poll(api)
                updater.assert_not_called()
            self.assertEqual(api.downloads, 0)

    def test_failed_update_is_blocked_without_repeated_builds(self):
        data, selected = packaged_artifact()
        api = FakeGitHub()
        api.artifacts = [selected['artifact']]
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            state = root / 'deploy-state'
            state.mkdir()
            budget = root / 'ai-usage.json'
            budget.write_text('unchanged-budget')
            with patch.object(deploy, 'STATE', state), patch.object(deploy, 'ROOT', root), \
                    patch.object(deploy.subprocess, 'run') as updater:
                updater.return_value.returncode = 1
                with self.assertRaises(deploy.DeploymentError):
                    deploy.poll(api)
                deploy.poll(api)
                self.assertEqual(updater.call_count, 1)
            self.assertIn(SHA, json.loads((state / 'blocked.json').read_text()))
            self.assertEqual(budget.read_text(), 'unchanged-budget')

    def test_packager_excludes_runtime_budget_and_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            files = list(release.REQUIRED - {'deploy/ubuntu/Dockerfile', 'deploy/ubuntu/compose.yaml', '.dockerignore'})
            for name in files + ['deploy/ubuntu/Dockerfile', 'deploy/ubuntu/compose.yaml', '.dockerignore',
                                  '.env', 'config/runtime.env', 'state/ai-usage.json']:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('fixture')
            (root / 'scripts').mkdir()
            (root / 'scripts/deployment-files.json').write_text(json.dumps(files))
            (root / 'scripts/build-ubuntu-package.py').write_bytes((ROOT / 'scripts/build-ubuntu-package.py').read_bytes())
            (root / 'deploy/ubuntu/release.py').write_bytes((ROOT / 'deploy/ubuntu/release.py').read_bytes())
            result = subprocess.run([sys.executable, '-B', str(root / 'scripts/build-ubuntu-package.py'), 'test'], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            with tarfile.open(root / '.tmp/ubuntu/floorflow-test.tar.gz') as archive:
                self.assertEqual(set(archive.getnames()), release.REQUIRED)


@unittest.skipUnless(sys.platform == 'linux', 'The updater harness requires Linux Bash/flock/symlinks.')
class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        for name in ['releases/old', 'backups', 'config', 'state', 'bin']:
            (self.root / name).mkdir(parents=True)
        (self.root / 'current').symlink_to('releases/old')
        (self.root / '.env').write_text('FLOORFLOW_RELEASE=old\n')
        (self.root / 'compose.yaml').write_text('unchanged-compose')
        (self.root / 'config/runtime.env').write_text('secret-sentinel')
        (self.root / 'state/ai-usage.json').write_text('budget-sentinel')
        code = (ROOT / 'deploy/ubuntu/update.sh').read_text()
        code = code.replace('/home/marcus/apps/floorflow', str(self.root))
        code = code.replace('/run/lock/floorflow-update.lock', str(self.root / 'update.lock'))
        code = code.replace('/usr/local/lib/floorflow/release.py', str(ROOT / 'deploy/ubuntu/release.py'))
        code = code.replace('[[ $EUID -eq 0 ]]', '[[ 0 -eq 0 ]]')
        (self.root / 'update.sh').write_text(code)
        fake = self.root / 'bin/docker'
        fake.write_text('''#!/usr/bin/env bash
echo "$*" >> "$FF_TEST_ROOT/docker.log"
if [[ $1 == build && ${FF_TEST_BUILD_FAIL:-0} == 1 ]]; then exit 43; fi
if [[ $1 == compose && ${FF_TEST_HEALTH_FAIL:-0} == 1 ]] && grep -q '^FLOORFLOW_RELEASE=new$' "$FF_TEST_ROOT/.env"; then exit 44; fi
exit 0
''')
        fake.chmod(0o755)

    def invoke(self, compose=b'unchanged-compose', checksum=None, **flags):
        data = source_archive(compose=compose)
        source = self.root / 'incoming.tar.gz'
        source.write_bytes(data)
        env = {**os.environ, 'FF_TEST_ROOT': str(self.root), 'PATH': str(self.root / 'bin') + ':' + os.environ['PATH'], **flags}
        return subprocess.run(['bash', str(self.root / 'update.sh'), str(source), 'new',
                               checksum or hashlib.sha256(data).hexdigest()], env=env, capture_output=True)

    def assert_preserved(self):
        self.assertEqual(os.readlink(self.root / 'current'), 'releases/old')
        self.assertEqual((self.root / '.env').read_text(), 'FLOORFLOW_RELEASE=old\n')
        self.assertEqual((self.root / 'config/runtime.env').read_text(), 'secret-sentinel')
        self.assertEqual((self.root / 'state/ai-usage.json').read_text(), 'budget-sentinel')

    def test_success_replaces_only_floorflow_and_keeps_previous(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(os.readlink(self.root / 'current'), 'releases/new')
        self.assertTrue((self.root / 'releases/old').is_dir())
        self.assertEqual((self.root / 'state/ai-usage.json').read_text(), 'budget-sentinel')
        self.assertIn('--project-name floorflow', (self.root / 'docker.log').read_text())
        self.assertFalse((self.root / '.deployment-pending').exists())

    def test_checksum_failure_never_builds_or_switches(self):
        self.assertNotEqual(self.invoke(checksum='0' * 64).returncode, 0)
        self.assertFalse((self.root / 'docker.log').exists())
        self.assert_preserved()

    def test_compose_change_never_builds_or_switches(self):
        self.assertNotEqual(self.invoke(compose=b'changed-compose').returncode, 0)
        self.assertFalse((self.root / 'docker.log').exists())
        self.assert_preserved()

    def test_build_failure_preserves_running_release(self):
        self.assertNotEqual(self.invoke(FF_TEST_BUILD_FAIL='1').returncode, 0)
        self.assertNotIn('compose', (self.root / 'docker.log').read_text())
        self.assert_preserved()

    def test_health_failure_rolls_back_and_checks_previous_health(self):
        result = self.invoke(FF_TEST_HEALTH_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Previous FloorFlow release restored and healthy', result.stdout.decode())
        self.assertEqual((self.root / 'docker.log').read_text().count('compose '), 2)
        self.assertFalse((self.root / '.deployment-pending').exists())
        self.assert_preserved()

    def test_interrupted_activation_can_be_recovered(self):
        self.invoke()
        (self.root / '.deployment-pending').write_text('new\n')
        result = subprocess.run(['bash', str(self.root / 'update.sh'), '--recover'],
                                env={**os.environ, 'FF_TEST_ROOT': str(self.root), 'PATH': str(self.root / 'bin') + ':' + os.environ['PATH']}, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assert_preserved()

    def test_lock_prevents_overlapping_updates(self):
        import fcntl
        with (self.root / 'update.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'docker.log').exists())
        self.assert_preserved()


if __name__ == '__main__':
    unittest.main()
