"""Offline regression tests: synthetic files only, no Azure or database access."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location("package_builder", Path(__file__).parents[1] / "scripts/build-github-package.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.stage = self.root / "stage"
        self.archive = self.root / "floorflow.zip"
        self.files = sorted(builder.FIXED | {"src/server.js", "public/index.html"})
        for name in self.files:
            self.write(self.source / name, "safe synthetic source")
        self.manifest()

    def write(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def manifest(self):
        self.write(self.source / "scripts/deployment-files.json", json.dumps(self.files))

    def installed_stage(self):
        builder.stage_project(self.source, self.stage)
        self.write(self.stage / "node_modules/express/package.json", '{"name":"express"}')

    def test_only_allowlisted_project_files_are_copied(self):
        for name in (".env", ".git/config", "private-report.json", "db/init/02-seed.sql", "app.credential.xml", "test/local.test.js"):
            self.write(self.source / name, "synthetic-private-canary")
        self.installed_stage()
        proof = builder.pack_project(self.source, self.stage, self.archive)
        self.assertEqual(proof["projectFiles"], len(self.files))
        with zipfile.ZipFile(self.archive) as package:
            self.assertFalse(any(b"synthetic-private-canary" in package.read(name) for name in package.namelist()))
            self.assertIn("db/init/01-schema.sql", package.namelist())

    def test_dependency_tests_are_excluded_but_license_and_modules_are_preserved(self):
        self.installed_stage()
        for name in ("test/private.test.js", "tests/example.js", "unit.spec.js", "test.js"):
            self.write(self.stage / "node_modules/express" / name, "unnecessary test")
        self.write(self.stage / "node_modules/express/LICENSE", "license must remain")
        self.write(self.stage / "node_modules/express/credentials.js", "legitimate public module")
        builder.pack_project(self.source, self.stage, self.archive)
        with zipfile.ZipFile(self.archive) as package:
            self.assertIn("node_modules/express/LICENSE", package.namelist())
            self.assertIn("node_modules/express/credentials.js", package.namelist())
            self.assertFalse(any(builder.TEST.search(name) for name in package.namelist()))

    def test_private_dependency_files_stop_packaging(self):
        self.installed_stage()
        for name in (".env", "demo.credential.xml", "service.credentials.json", ".git/config", "secret.pem"):
            with self.subTest(name=name):
                file = self.stage / "node_modules/express" / name
                self.write(file, "synthetic secret")
                with self.assertRaises(ValueError):
                    builder.pack_project(self.source, self.stage, self.archive)
                file.unlink()

    def test_extra_root_report_stops_packaging(self):
        self.installed_stage()
        self.write(self.stage / "private-report.json", "private")
        with self.assertRaises(ValueError):
            builder.pack_project(self.source, self.stage, self.archive)

    def test_changed_source_stops_packaging(self):
        self.installed_stage()
        self.write(self.stage / "src/server.js", "tampered")
        with self.assertRaises(ValueError):
            builder.pack_project(self.source, self.stage, self.archive)

    def test_unsafe_allowlists_are_rejected_before_copying(self):
        original = self.files[:]
        for name in ("../secret.js", "/tmp/secret", "src/../secret.js", "src\\secret.js", ".env", "db/init/02-seed.sql", "src/test/fixture.js", "src/server.js"):
            with self.subTest(name=name):
                self.files = original + [name]
                self.manifest()
                with self.assertRaises(ValueError):
                    builder.stage_project(self.source, self.stage)
                self.assertFalse(self.stage.exists())

    def test_existing_stage_and_artifact_are_never_overwritten(self):
        self.installed_stage()
        with self.assertRaises(ValueError):
            builder.stage_project(self.source, self.stage)
        builder.pack_project(self.source, self.stage, self.archive)
        original = self.archive.read_bytes()
        with self.assertRaises(FileExistsError):
            builder.pack_project(self.source, self.stage, self.archive)
        self.assertEqual(self.archive.read_bytes(), original)

    def test_final_zip_is_inspected_independently(self):
        self.installed_stage()
        builder.pack_project(self.source, self.stage, self.archive)
        with zipfile.ZipFile(self.archive, "a") as package:
            package.writestr("node_modules/express/.env", "synthetic secret")
        with self.assertRaises(ValueError):
            builder.verify_zip(self.source, self.archive)

    def test_redirected_project_and_dependency_paths_are_rejected(self):
        file = self.source / "src/server.js"
        file.unlink()
        file.symlink_to(self.source / "public/index.html")
        with self.assertRaises(ValueError):
            builder.stage_project(self.source, self.stage)
        file.unlink()
        self.write(file, "source restored in fixture only")
        self.installed_stage()
        (self.stage / "node_modules/express/redirect.js").symlink_to(file)
        with self.assertRaises(ValueError):
            builder.pack_project(self.source, self.stage, self.archive)


if __name__ == "__main__":
    unittest.main()
