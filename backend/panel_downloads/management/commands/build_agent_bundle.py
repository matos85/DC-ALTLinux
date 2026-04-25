"""Собрать domain-agent.tgz из каталога AGENT_SOURCE_DIR (для локальной разработки без Docker)."""

import tarfile
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


def _tar_filter(tarinfo: tarfile.TarInfo) -> tarfile.TarInfo | None:
    name = tarinfo.name
    if "__pycache__" in name or name.endswith(".pyc"):
        return None
    return tarinfo


class Command(BaseCommand):
    help = "Упаковать каталог агента в AGENT_BUNDLE_PATH (gzip tar)."

    def handle(self, *args, **options):
        src: Path = settings.AGENT_SOURCE_DIR
        dest: Path = settings.AGENT_BUNDLE_PATH
        if not src.is_dir():
            self.stderr.write(self.style.ERROR(f"Нет каталога агента: {src}"))
            return

        dest.parent.mkdir(parents=True, exist_ok=True)
        install_sh = src / "install.sh"
        if install_sh.is_file():
            install_sh.chmod(install_sh.stat().st_mode | 0o111)

        with tarfile.open(dest, "w:gz") as archive:
            for child in sorted(src.iterdir()):
                if child.name.startswith("."):
                    continue
                archive.add(child, arcname=child.name, filter=_tar_filter)

        self.stdout.write(self.style.SUCCESS(f"Собрано: {dest}"))
