"""
Интерактивная первичная настройка агента и (опционально) нового леса Samba AD.

Запуск с хоста, где стоит / будет Samba:
  python -m domain_agent setup

Пишет файл с переменными окружения (по умолчанию ./agent.env) — его подставьте в systemd,
docker-compose или export перед uvicorn.
"""

from __future__ import annotations

import getpass
import os
import shutil
import subprocess
import sys
from pathlib import Path


def _prompt(label: str, default: str = "", required: bool = False) -> str:
    hint = f" [{default}]" if default else ""
    while True:
        raw = input(f"{label}{hint}: ").strip()
        if not raw and default:
            return default
        if raw:
            return raw
        if not required:
            return ""
        print("  Значение обязательно.")


def _prompt_secret(label: str, confirm: bool = False) -> str:
    while True:
        a = getpass.getpass(f"{label}: ")
        if not a:
            print("  Пустой пароль недопустим.")
            continue
        if confirm:
            b = getpass.getpass("Повторите пароль: ")
            if a != b:
                print("  Не совпадает.")
                continue
        return a


def _yes_no(question: str, default_no: bool = True) -> bool:
    suffix = " [y/N]: " if default_no else " [Y/n]: "
    r = input(question + suffix).strip().lower()
    if not r:
        return not default_no
    return r in ("y", "yes", "д", "да")


def _env_line(key: str, value: str) -> str:
    """Формат KEY=value для docker-compose env_file и systemd EnvironmentFile."""
    if not any(c in value for c in ' \t\n"$`\\#!&|<>()[]*?'):
        return f"{key}={value}"
    esc = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'{key}="{esc}"'


def _write_env(path: Path, values: dict[str, str]) -> None:
    lines = ["# Сгенерировано: python -m domain_agent setup", ""]
    for k in sorted(values.keys()):
        v = values[k]
        if v == "":
            continue
        lines.append(_env_line(k, v))
    lines.append("")
    lines.append("# В shell: set -a && . ./agent.env && set +a")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _maybe_provision_samba_ad() -> None:
    if not _yes_no(
        "\nСоздать НОВЫЙ домен Samba AD на ЭТОЙ машине (samba-tool domain provision)?\n"
        "Только на чистом сервере; если домен уже есть — ответьте «нет».",
        default_no=True,
    ):
        return

    if not shutil.which("samba-tool"):
        print("samba-tool не найден в PATH. Установите Samba AD и повторите вручную.")
        return

    if not _yes_no("Это СОТРЁТ/перезапишет локальную конфигурацию домена при ошибке. Продолжить?", default_no=True):
        return

    realm = _prompt("DNS-имя realm (например CORP.LOCAL)", "CORP.LOCAL", required=True)
    domain = _prompt("NetBIOS-домен (короткое имя, например CORP)", "CORP", required=True)
    admin_pass = _prompt_secret("Пароль администратора домена", confirm=True)

    cmd = [
        "samba-tool",
        "domain",
        "provision",
        "--server-role=dc",
        "--use-rfc2307",
        f"--realm={realm}",
        f"--domain={domain}",
        f"--adminpass={admin_pass}",
        "--dns-backend=SAMBA_INTERNAL",
    ]
    print("\nЗапуск:", " ".join(cmd[:6]), "... --adminpass=*** ...")
    completed = subprocess.run(cmd, capture_output=True, text=True)
    if completed.returncode != 0:
        print("Ошибка provision:\n", completed.stderr or completed.stdout)
        return
    print(completed.stdout or "provision завершён.")
    print(
        "\nДальше включите службу Samba AD DC по документации дистрибутива "
        "(например systemctl enable --now samba-ad-dc или sernet-samba-ad). "
        "Затем запустите агент с записанным agent.env."
    )


def run_wizard() -> None:
    print(
        "=== Настройка Domain Agent ===\n"
        "Укажите параметры для связи с веб-панелью и командами samba-tool/smbcacls.\n"
        "Shared secret должен совпадать с секретом сервера в панели (или DOMAIN_AGENT_DEFAULT_SECRET).\n"
    )

    out_default = Path(os.getcwd()) / "agent.env"
    out_str = _prompt("Файл для сохранения переменных", str(out_default), required=True)
    out_path = Path(out_str).expanduser().resolve()

    secret = _prompt_secret("AGENT_SHARED_SECRET (общий секрет с панелью)", confirm=True)
    primary = _prompt("AGENT_PRIMARY_DC_IP (IP контроллера с Samba)", "192.168.77.10", required=True)
    smb_same = _yes_no("AGENT_SMB_HOST совпадает с AGENT_PRIMARY_DC_IP?", default_no=False)
    smb_host = primary if smb_same else _prompt("AGENT_SMB_HOST", primary, required=True)

    dns_same = _yes_no("Samba DNS на том же IP (оставить AGENT_DNS_SERVER пустым = как DC)?", default_no=False)
    dns_server = "" if dns_same else _prompt("AGENT_DNS_SERVER", "", required=False)

    dns_user = _prompt("AGENT_DNS_ADMIN_USER", "Administrator", required=True)
    dns_pass = _prompt_secret("AGENT_DNS_ADMIN_PASSWORD (для samba-tool dns и smbcacls -U)", confirm=True)

    domain_dns = _prompt("AGENT_DEFAULT_DOMAIN_DNS (зона DNS)", "test.alt", required=True)
    realm = _prompt("AGENT_DEFAULT_REALM", "TEST.ALT", required=True)
    netbios = _prompt("AGENT_NETBIOS_DOMAIN", "TEST", required=True)

    values: dict[str, str] = {
        "AGENT_SHARED_SECRET": secret,
        "AGENT_PRIMARY_DC_IP": primary,
        "AGENT_SMB_HOST": smb_host,
        "AGENT_DNS_ADMIN_USER": dns_user,
        "AGENT_DNS_ADMIN_PASSWORD": dns_pass,
        "AGENT_DEFAULT_DOMAIN_DNS": domain_dns,
        "AGENT_DEFAULT_REALM": realm,
        "AGENT_NETBIOS_DOMAIN": netbios,
    }
    if dns_server:
        values["AGENT_DNS_SERVER"] = dns_server

    _write_env(out_path, values)
    print(f"\nЗаписано: {out_path} (права 600).")
    print(
        "\nДальше:\n"
        f"  set -a && source {out_path} && set +a\n"
        "  uvicorn domain_agent.main:app --host 0.0.0.0 --port 8090\n"
        "\nИли добавьте эти переменные в systemd EnvironmentFile= и в Docker environment.\n"
        "В панели зарегистрируйте сервер: URL http://<этот-хост>:8090 и тот же shared secret.\n"
    )

    if _yes_no("\nЗапустить мастер создания нового домена Samba AD (samba-tool domain provision)?", default_no=True):
        _maybe_provision_samba_ad()


def main() -> None:
    try:
        run_wizard()
    except KeyboardInterrupt:
        print("\nПрервано.")
        sys.exit(130)


if __name__ == "__main__":
    main()
