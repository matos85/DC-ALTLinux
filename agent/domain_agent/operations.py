from __future__ import annotations

import os
import subprocess
import uuid
from typing import Any, Callable

from fastapi import HTTPException

from .config import settings
from .schemas import ExecuteResponse


def _run_command(command: list[str], *, dry_run: bool) -> tuple[str, str]:
    if dry_run:
        return "", ""

    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise HTTPException(
            status_code=400,
            detail={
                "command": command,
                "stdout": completed.stdout,
                "stderr": completed.stderr,
                "returncode": completed.returncode,
            },
        )
    return completed.stdout, completed.stderr


def _execute(operation: str, commands: list[list[str]], *, dry_run: bool, data: dict[str, Any] | None = None):
    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    for command in commands:
        stdout, stderr = _run_command(command, dry_run=dry_run)
        if stdout:
            stdout_chunks.append(stdout.strip())
        if stderr:
            stderr_chunks.append(stderr.strip())

    return ExecuteResponse(
        request_id=str(uuid.uuid4()),
        operation=operation,
        dry_run=dry_run,
        commands=commands,
        stdout="\n".join(chunk for chunk in stdout_chunks if chunk),
        stderr="\n".join(chunk for chunk in stderr_chunks if chunk),
        data=data or {},
    )


def _lines(output: str) -> list[str]:
    return [line.strip() for line in output.splitlines() if line.strip()]


def _get_required(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key, "")).strip()
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing required field: {key}")
    return value


def _ou_dn(name: str, base_dn: str = "") -> str:
    if name.upper().startswith("OU="):
        return name
    if base_dn:
        return f"OU={name},{base_dn}"
    return f"OU={name}"


def _dns_credentials() -> str:
    if not settings.dns_admin_password:
        raise HTTPException(status_code=400, detail="AGENT_DNS_ADMIN_PASSWORD is not configured.")
    return f"{settings.dns_admin_user}%{settings.dns_admin_password}"


def _normalize_account_name(name: str) -> str:
    cleaned = name.strip()
    if "\\" in cleaned:
        return cleaned
    return f"{settings.netbios_domain}\\{cleaned}"


def _smb_acl_value(access: str) -> str:
    mapping = {
        "read": "READ",
        "change": "CHANGE",
        "full": "FULL",
    }
    if access not in mapping:
        raise HTTPException(status_code=400, detail="Unsupported access level.")
    return mapping[access]


def _share_target(payload: dict[str, Any]) -> tuple[str, str]:
    share_name = _get_required(payload, "share_name")
    relative_path = payload.get("share_path", "/") or "/"
    return share_name, relative_path


def handle_user_list(payload: dict[str, Any], dry_run: bool):
    command = ["samba-tool", "user", "list"]
    response = _execute("samba.user.list", [command], dry_run=dry_run)
    items = _lines(response.stdout) if response.stdout else []
    response.data = {"items": [{"username": item} for item in items]}
    return response


def handle_user_create(payload: dict[str, Any], dry_run: bool):
    username = _get_required(payload, "username")
    password = _get_required(payload, "password")
    command = ["samba-tool", "user", "create", username, password]
    if payload.get("first_name"):
        command.append(f"--given-name={payload['first_name']}")
    if payload.get("last_name"):
        command.append(f"--surname={payload['last_name']}")
    if payload.get("email"):
        command.append(f"--mail-address={payload['email']}")

    commands = [command]
    for group in payload.get("groups", []):
        if str(group).strip().lower() == "domain users":
            continue
        commands.append(["samba-tool", "group", "addmembers", group, username])
    return _execute("samba.user.create", commands, dry_run=dry_run, data={"username": username})


def handle_user_simple(operation: str, verb: str, payload: dict[str, Any], dry_run: bool):
    username = _get_required(payload, "username")
    command = ["samba-tool", "user", verb, username]
    return _execute(operation, [command], dry_run=dry_run, data={"username": username})


def handle_user_reset_password(payload: dict[str, Any], dry_run: bool):
    username = _get_required(payload, "username")
    password = _get_required(payload, "password")
    command = ["samba-tool", "user", "setpassword", username, f"--newpassword={password}"]
    return _execute("samba.user.reset_password", [command], dry_run=dry_run, data={"username": username})


def handle_group_list(payload: dict[str, Any], dry_run: bool):
    command = ["samba-tool", "group", "list"]
    response = _execute("samba.group.list", [command], dry_run=dry_run)
    response.data = {"items": [{"name": item} for item in _lines(response.stdout)]}
    return response


def handle_group_list_members(payload: dict[str, Any], dry_run: bool):
    name = _get_required(payload, "name")
    command = ["samba-tool", "group", "listmembers", name]
    response = _execute("samba.group.list_members", [command], dry_run=dry_run)
    members = [line.strip() for line in _lines(response.stdout) if line.strip()]
    response.data = {"members": [{"username": m} for m in members]}
    return response


def handle_group_create(payload: dict[str, Any], dry_run: bool):
    name = _get_required(payload, "name")
    command = ["samba-tool", "group", "add", name]
    description = str(payload.get("description", "")).strip()
    if description:
        command.append(f"--description={description}")
    return _execute("samba.group.create", [command], dry_run=dry_run, data={"name": name})


def handle_group_member(operation: str, verb: str, payload: dict[str, Any], dry_run: bool):
    name = _get_required(payload, "name")
    username = _get_required(payload, "username")
    command = ["samba-tool", "group", verb, name, username]
    return _execute(operation, [command], dry_run=dry_run, data={"name": name, "username": username})


def handle_computer_list(payload: dict[str, Any], dry_run: bool):
    command = ["samba-tool", "computer", "list"]
    response = _execute("samba.computer.list", [command], dry_run=dry_run)
    response.data = {"items": [{"hostname": item} for item in _lines(response.stdout)]}
    return response


def handle_computer_delete(payload: dict[str, Any], dry_run: bool):
    hostname = _get_required(payload, "hostname")
    command = ["samba-tool", "computer", "delete", hostname]
    return _execute("samba.computer.delete", [command], dry_run=dry_run, data={"hostname": hostname})


def handle_ou_list(payload: dict[str, Any], dry_run: bool):
    command = [
        "ldbsearch",
        "-H",
        "/var/lib/samba/private/sam.ldb",
        "(objectClass=organizationalUnit)",
        "dn",
    ]
    response = _execute("samba.ou.list", [command], dry_run=dry_run)
    items = [line[4:] for line in _lines(response.stdout) if line.startswith("dn: ")]
    response.data = {"items": [{"distinguished_name": item} for item in items]}
    return response


def handle_ou_create(payload: dict[str, Any], dry_run: bool):
    name = _get_required(payload, "name")
    dn = _ou_dn(name, str(payload.get("base_dn", "")).strip())
    command = ["samba-tool", "ou", "create", dn]
    return _execute("samba.ou.create", [command], dry_run=dry_run, data={"distinguished_name": dn})


def handle_ou_delete(payload: dict[str, Any], dry_run: bool):
    dn = _get_required(payload, "distinguished_name")
    command = ["samba-tool", "ou", "delete", dn]
    return _execute("samba.ou.delete", [command], dry_run=dry_run, data={"distinguished_name": dn})


def handle_dns_list(payload: dict[str, Any], dry_run: bool):
    zone = _get_required(payload, "zone") if payload.get("zone") else settings.default_domain_dns
    command = [
        "samba-tool",
        "dns",
        "query",
        settings.dns_server,
        zone,
        "@",
        "ALL",
        f"-U{_dns_credentials()}",
    ]
    response = _execute("samba.dns.list", [command], dry_run=dry_run)
    response.data = {"zone": zone, "records": _lines(response.stdout)}
    return response


def handle_dns_mutation(operation: str, verb: str, payload: dict[str, Any], dry_run: bool):
    zone = _get_required(payload, "zone")
    name = _get_required(payload, "name")
    record_type = _get_required(payload, "record_type")
    value = _get_required(payload, "value")
    command = [
        "samba-tool",
        "dns",
        verb,
        settings.dns_server,
        zone,
        name,
        record_type,
        value,
        f"-U{_dns_credentials()}",
    ]
    return _execute(
        operation,
        [command],
        dry_run=dry_run,
        data={"zone": zone, "name": name, "record_type": record_type, "value": value},
    )


def handle_share_list(payload: dict[str, Any], dry_run: bool):
    command = ["testparm", "-s"]
    response = _execute("samba.share.list", [command], dry_run=dry_run)
    items = []
    for line in _lines(response.stdout):
        if line.startswith("[") and line.endswith("]"):
            share_name = line[1:-1]
            if share_name.lower() != "global":
                items.append({"name": share_name})
    response.data = {"items": items}
    return response


def handle_share_create(payload: dict[str, Any], dry_run: bool):
    name = _get_required(payload, "name")
    path = _get_required(payload, "path")
    description = str(payload.get("description", "")).strip() or "Managed by admin panel"
    share_block_script = "\n".join(
        [
            "from pathlib import Path",
            "conf = Path('/etc/samba/smb.conf')",
            f"name = {name!r}",
            f"path = {path!r}",
            f"comment = {description!r}",
            "block = (",
            "    f'\\n[{name}]\\n'",
            "    f'    path = {path}\\n'",
            "    '    read only = no\\n'",
            "    '    browseable = yes\\n'",
            "    '    guest ok = no\\n'",
            "    '    create mask = 0664\\n'",
            "    '    directory mask = 0775\\n'",
            "    f'    comment = {comment}\\n'",
            ")",
            "text = conf.read_text()",
            "conf.write_text(text if f'[{name}]' in text else text + block)",
        ]
    )
    commands = [
        ["mkdir", "-p", path],
        ["python3", "-c", share_block_script],
        ["testparm", "-s"],
        ["smbcontrol", "all", "reload-config"],
    ]

    for group in payload.get("full_groups", []):
        commands.append(
            [
                "smbcacls",
                f"//{settings.smb_host}/{name}",
                "/",
                f"-U{_dns_credentials()}",
                "--add",
                f"ACL:{_normalize_account_name(group)}:ALLOWED/0x0/FULL",
            ]
        )
    for group in payload.get("change_groups", []):
        commands.append(
            [
                "smbcacls",
                f"//{settings.smb_host}/{name}",
                "/",
                f"-U{_dns_credentials()}",
                "--add",
                f"ACL:{_normalize_account_name(group)}:ALLOWED/0x0/CHANGE",
            ]
        )
    for group in payload.get("read_groups", []):
        commands.append(
            [
                "smbcacls",
                f"//{settings.smb_host}/{name}",
                "/",
                f"-U{_dns_credentials()}",
                "--add",
                f"ACL:{_normalize_account_name(group)}:ALLOWED/0x0/READ",
            ]
        )

    return _execute("samba.share.create", commands, dry_run=dry_run, data={"name": name, "path": path})


def handle_share_delete(payload: dict[str, Any], dry_run: bool):
    name = _get_required(payload, "name")
    share_block_script = "\n".join(
        [
            "from pathlib import Path",
            "import re",
            "conf = Path('/etc/samba/smb.conf')",
            "text = conf.read_text()",
            f"name = {name!r}",
            "pattern = re.compile(rf'\\n\\[{re.escape(name)}\\]\\n(?:[^\\[]|\\n)*(?=\\n\\[|\\Z)', re.MULTILINE)",
            "updated = pattern.sub('', text)",
            "conf.write_text(updated)",
        ]
    )
    commands = [
        ["python3", "-c", share_block_script],
        ["testparm", "-s"],
        ["smbcontrol", "all", "reload-config"],
    ]
    return _execute("samba.share.delete", commands, dry_run=dry_run, data={"name": name})


def handle_acl_get(payload: dict[str, Any], dry_run: bool):
    share_name, share_path = _share_target(payload)
    command = [
        "smbcacls",
        f"//{settings.smb_host}/{share_name}",
        share_path,
        f"-U{_dns_credentials()}",
    ]
    response = _execute("samba.acl.get", [command], dry_run=dry_run)
    response.data = {"share_name": share_name, "share_path": share_path, "acl": _lines(response.stdout)}
    return response


def handle_acl_set(payload: dict[str, Any], dry_run: bool):
    share_name, share_path = _share_target(payload)
    principal = _get_required(payload, "principal")
    access = _get_required(payload, "access")
    account_name = _normalize_account_name(principal)
    acl_value = _smb_acl_value(access)
    ace = f"ACL:{account_name}:ALLOWED/0x0/{acl_value}"
    command = [
        "smbcacls",
        f"//{settings.smb_host}/{share_name}",
        share_path,
        f"-U{_dns_credentials()}",
        "--add",
        ace,
    ]
    return _execute(
        "samba.acl.set",
        [command],
        dry_run=dry_run,
        data={
            "share_name": share_name,
            "share_path": share_path,
            "principal": account_name,
            "access": access,
        },
    )


def handle_share_audit_collect(payload: dict[str, Any], dry_run: bool):
    """Хвосты файлов логов Samba на DC (по запросу панели). Пути: AGENT_SHARE_AUDIT_LOG_PATHS или payload.paths."""
    raw_paths = payload.get("paths")
    if not raw_paths:
        paths = list(settings.share_audit_log_paths)
    elif isinstance(raw_paths, str):
        paths = [raw_paths]
    else:
        paths = list(raw_paths)
    max_lines = int(payload.get("max_lines", 400))
    max_lines = max(1, min(max_lines, 2000))
    if dry_run:
        return ExecuteResponse(
            request_id=str(uuid.uuid4()),
            operation="samba.share.audit_collect",
            dry_run=True,
            commands=[],
            stdout="",
            stderr="",
            data={"files": {}, "paths": paths, "max_lines": max_lines},
        )
    files_out: dict[str, list[str]] = {}
    for path in paths:
        if not path or not isinstance(path, str) or not os.path.isfile(path):
            continue
        completed = subprocess.run(
            ["tail", "-n", str(max_lines), path],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            files_out[path] = [line[:512] for line in completed.stdout.splitlines()]
    return ExecuteResponse(
        request_id=str(uuid.uuid4()),
        operation="samba.share.audit_collect",
        dry_run=False,
        commands=[],
        stdout="",
        stderr="",
        data={"files": files_out},
    )


def handle_join_render(payload: dict[str, Any], dry_run: bool):
    hostname = _get_required(payload, "hostname")
    domain_dns = _get_required(payload, "domain_dns")
    primary_dc_ip = _get_required(payload, "primary_dc_ip")
    admin_user = str(payload.get("admin_user") or "Administrator")
    script = "\n".join(
        [
            "# Переменные для ручного запуска (интерактивный скрипт лучше скачать с панели):",
            f"# curl -fsSL 'http://ПАНЕЛЬ:3000/api/backend/agent/join-workstation.sh/?token=СЕКРЕТ' -o join-workstation.sh && chmod +x join-workstation.sh && ./join-workstation.sh",
            f"HOST_FQDN={hostname}.{domain_dns}",
            f"DOMAIN_DNS={domain_dns}",
            f"PRIMARY_DC_IP={primary_dc_ip}",
            f"ADMIN_USER={admin_user}",
            "# Локально: sudo bash join_workstation_domain.sh",
        ]
    )
    return ExecuteResponse(
        request_id=str(uuid.uuid4()),
        operation="samba.join.render",
        dry_run=dry_run,
        commands=[],
        stdout="",
        stderr="",
        data={"script": script},
    )


Handler = Callable[[dict[str, Any], bool], ExecuteResponse]

OPERATIONS: dict[str, Handler] = {
    "samba.user.list": handle_user_list,
    "samba.user.create": handle_user_create,
    "samba.user.enable": lambda payload, dry_run: handle_user_simple("samba.user.enable", "enable", payload, dry_run),
    "samba.user.disable": lambda payload, dry_run: handle_user_simple("samba.user.disable", "disable", payload, dry_run),
    "samba.user.delete": lambda payload, dry_run: handle_user_simple("samba.user.delete", "delete", payload, dry_run),
    "samba.user.reset_password": handle_user_reset_password,
    "samba.group.list": handle_group_list,
    "samba.group.list_members": handle_group_list_members,
    "samba.group.create": handle_group_create,
    "samba.group.delete": lambda payload, dry_run: _execute(
        "samba.group.delete",
        [["samba-tool", "group", "delete", _get_required(payload, "name")]],
        dry_run=dry_run,
        data={"name": _get_required(payload, "name")},
    ),
    "samba.group.add_member": lambda payload, dry_run: handle_group_member(
        "samba.group.add_member", "addmembers", payload, dry_run
    ),
    "samba.group.remove_member": lambda payload, dry_run: handle_group_member(
        "samba.group.remove_member", "removemembers", payload, dry_run
    ),
    "samba.computer.list": handle_computer_list,
    "samba.computer.delete": handle_computer_delete,
    "samba.ou.list": handle_ou_list,
    "samba.ou.create": handle_ou_create,
    "samba.ou.delete": handle_ou_delete,
    "samba.dns.list": handle_dns_list,
    "samba.dns.create": lambda payload, dry_run: handle_dns_mutation("samba.dns.create", "add", payload, dry_run),
    "samba.dns.delete": lambda payload, dry_run: handle_dns_mutation("samba.dns.delete", "delete", payload, dry_run),
    "samba.share.list": handle_share_list,
    "samba.share.create": handle_share_create,
    "samba.share.delete": handle_share_delete,
    "samba.acl.get": handle_acl_get,
    "samba.acl.set": handle_acl_set,
    "samba.share.audit_collect": handle_share_audit_collect,
    "samba.join.render": handle_join_render,
}


def execute_operation(operation: str, payload: dict[str, Any], dry_run: bool):
    handler = OPERATIONS.get(operation)
    if handler is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Unsupported operation: {operation}. "
                "GET /health возвращает список поддерживаемых операций. "
                "Если нет samba.group.list_members — обновите образ/установку domain-agent "
                "(пересоберите сервис agent из текущего репозитория)."
            ),
        )
    return handler(payload, dry_run)
