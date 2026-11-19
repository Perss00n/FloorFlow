"""Linux CI packaging using the M6C allowlist and Python's standard library only."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import zipfile


PRIVATE = re.compile(
    r"(^|/)(\.env[^/]*|\.git|\.npmrc|\.pgpass|\.pg_service\.conf|\.azure)(/|$)"
    r"|(^|/)[^/]*credentials?[^/]*\.(xml|json|txt|csv)$"
    r"|\.(pem|key|pfx|p12|publishsettings|log|dump|backup)$", re.IGNORECASE)
TEST = re.compile(r"(^|/)(test|tests|__tests__)(/|\.[^/]+$)|\.(test|spec)\.[^/]+$", re.IGNORECASE)
FIXED = {"package.json", "package-lock.json", "db/init/01-schema.sql"}


def safe_name(name):
    if not isinstance(name, str) or not name or "\\" in name or ":" in name:
        raise ValueError("Invalid package path")
    if any(part in ("", ".", "..") for part in name.split("/")) or PurePosixPath(name).is_absolute():
        raise ValueError("Invalid package path")
    return name


def project_files(source):
    files = json.loads((source / "scripts/deployment-files.json").read_text(encoding="utf-8-sig"))
    if not isinstance(files, list) or not files or any(not isinstance(name, str) for name in files):
        raise ValueError("Invalid allowlist")
    if len(set(files)) != len(files) or not FIXED.issubset(files):
        raise ValueError("Incomplete or duplicate allowlist")
    for name in files:
        safe_name(name)
        runtime = (name.startswith("src/") and name.endswith(".js")) or (
            name.startswith("public/") and PurePosixPath(name).suffix in (".html", ".css", ".js", ".svg"))
        if PRIVATE.search(name) or TEST.search(name) or (name not in FIXED and not runtime):
            raise ValueError("Unapproved project file")
        file = source / name
        if not file.is_file() or any((source / Path(*PurePosixPath(name).parts[:i])).is_symlink()
                                     for i in range(1, len(PurePosixPath(name).parts) + 1)):
            raise ValueError("Missing or redirected project file")
    return files


def stage_project(source, stage):
    files = project_files(source)
    if stage.exists() or stage.resolve().is_relative_to(source.resolve()):
        raise ValueError("Stage must be new and outside the source checkout")
    stage.mkdir(parents=True)
    for name in files:
        target = stage / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, target)
    return len(files)


def verify_zip(source, archive):
    files = set(project_files(source))
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        if len(set(names)) != len(names) or package.testzip() is not None:
            raise ValueError("Duplicate or corrupt ZIP entries")
        project = set()
        for entry in package.infolist():
            name = safe_name(entry.filename)
            if entry.is_dir() or stat.S_ISLNK(entry.external_attr >> 16) or PRIVATE.search(name) or TEST.search(name):
                raise ValueError("Private, test, redirected or unexpected ZIP entry")
            if not name.startswith("node_modules/"):
                project.add(name)
                if name not in files or package.read(name) != (source / name).read_bytes():
                    raise ValueError("Unexpected or changed project content")
        if project != files or "node_modules/express/package.json" not in names:
            raise ValueError("Incomplete package")
        return {"projectFiles": len(project), "entries": len(names)}


def pack_project(source, stage, archive):
    files = set(project_files(source))
    if stage.is_symlink() or not stage.is_dir() or archive.resolve().is_relative_to(stage.resolve()):
        raise ValueError("ZIP must be outside the staged application")
    entries = []
    for path in sorted(stage.rglob("*")):
        if path.is_symlink():
            raise ValueError("Redirected staged path")
        if not path.is_file():
            continue
        name = safe_name(path.relative_to(stage).as_posix())
        if PRIVATE.search(name):
            raise ValueError("Private file found in stage")
        if name.startswith("node_modules/"):
            # Upstream npm test payloads are unnecessary at runtime. Keep licenses.
            if TEST.search(name):
                continue
        elif name not in files or path.read_bytes() != (source / name).read_bytes():
            raise ValueError("Unexpected or changed project file in stage")
        entries.append((path, name))
    archive.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation: never overwrite an existing artifact or retry destructively.
    with zipfile.ZipFile(archive, "x", zipfile.ZIP_DEFLATED) as package:
        for path, name in entries:
            package.write(path, name)
    proof = verify_zip(source, archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(archive.suffix + ".sha256").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    return {**proof, "sha256": digest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("stage", "pack"))
    parser.add_argument("stage", type=Path)
    parser.add_argument("archive", type=Path, nargs="?")
    args = parser.parse_args()
    source = Path(__file__).resolve().parent.parent
    try:
        if args.mode == "stage":
            print(json.dumps({"stagedProjectFiles": stage_project(source, args.stage)}))
        elif args.archive is None:
            parser.error("pack requires an archive path")
        else:
            print(json.dumps(pack_project(source, args.stage, args.archive)))
    except (ValueError, OSError, zipfile.BadZipFile):
        # No file contents, environment variables or provider error bodies.
        raise SystemExit("Package check failed. Preserve state and inspect locally; do not deploy.") from None


if __name__ == "__main__":
    main()
