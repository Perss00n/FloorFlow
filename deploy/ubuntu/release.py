"""Source archive boundary shared by packaging and the installed Ubuntu updater."""
import pathlib
import sys
import tarfile

MAX_BYTES = 8 * 1024 * 1024
REQUIRED = {'package.json', 'package-lock.json', '.dockerignore', 'db/init/01-schema.sql',
            'deploy/ubuntu/Dockerfile', 'deploy/ubuntu/compose.yaml', 'src/server.js'}


def allowed_path(name):
    path = pathlib.PurePosixPath(name)
    return (str(path) == name and not path.is_absolute() and '\\' not in name
            and ':' not in name and '..' not in path.parts
            and (name in REQUIRED or (name.startswith(('src/', 'public/'))
                 and path.suffix in {'.js', '.html', '.css', '.svg'})))


def validate_archive(archive):
    members = archive.getmembers()
    names = [member.name for member in members]
    if (not REQUIRED.issubset(names) or len(names) != len(set(names))
            or len(names) > 200 or sum(member.size for member in members) > MAX_BYTES):
        raise ValueError('Missing, duplicate or oversized archive entries.')
    for member in members:
        if (not allowed_path(member.name) or not member.isfile()
                or member.size > MAX_BYTES or member.mode & 0o7000):
            raise ValueError('Unsafe archive entry.')
    return members


def extract_archive(source, destination):
    destination = pathlib.Path(destination)
    if destination.exists() or destination.is_symlink():
        raise ValueError('Release destination already exists.')
    with tarfile.open(source) as archive:
        members = validate_archive(archive)
        destination.mkdir(mode=0o700)
        archive.extractall(destination, members=members, filter='data')


if __name__ == '__main__':
    extract_archive(sys.argv[1], sys.argv[2])
