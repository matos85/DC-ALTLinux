"""Общие SSH/su-root хелперы для lab-скриптов (ALT без sudo)."""
from __future__ import annotations

import base64
import os
import shlex
import time

import paramiko


def ssh_cmd(host: str, user: str, password: str, command: str, timeout: int = 60) -> tuple[int, str, str]:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, password=password, timeout=20, allow_agent=False, look_for_keys=False)
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    client.close()
    return code, out, err


def sudo_bash(host: str, user: str, login_pass: str, inner_bash: str, timeout: int = 600) -> tuple[int, str, str]:
    escaped = inner_bash.replace("'", "'\"'\"'")
    cmd = f"echo '{login_pass}' | sudo -SE bash -lc '{escaped}'"
    return ssh_cmd(host, user, password=login_pass, command=cmd, timeout=timeout)


def _which_sudo(host: str, user: str, login_pass: str) -> bool:
    code, out, _ = ssh_cmd(host, user, login_pass, "command -v sudo 2>/dev/null", timeout=15)
    return code == 0 and bool(out.strip())


def su_root_bash(client: paramiko.SSHClient, root_pass: str, inner_bash: str, timeout: int = 600) -> tuple[int, str, str]:
    b64 = base64.b64encode(inner_bash.encode()).decode("ascii")
    wrapped = f"echo {b64} | base64 -d | bash"
    chan = client.get_transport().open_session()
    chan.get_pty()
    chan.exec_command(f"su - root -c {shlex.quote(wrapped)}")
    buf = b""
    pwd_sent = False
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if chan.recv_ready():
            buf += chan.recv(65536)
            low = buf.lower()
            if not pwd_sent and (b"assword:" in low or b"password for" in low):
                chan.send((root_pass + "\n").encode())
                pwd_sent = True
        elif chan.exit_status_ready():
            break
        else:
            time.sleep(0.05)
    while chan.recv_ready():
        buf += chan.recv(65536)
    code = chan.recv_exit_status() if chan.exit_status_ready() else -1
    return code, buf.decode(errors="replace"), ""


def run_root_bash(
    host: str,
    user: str,
    login_pass: str,
    root_pass: str,
    inner_bash: str,
    timeout: int = 600,
) -> tuple[int, str, str]:
    if _which_sudo(host, user, login_pass):
        return sudo_bash(host, user, login_pass, inner_bash, timeout=timeout)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, password=login_pass, timeout=20, allow_agent=False, look_for_keys=False)
    try:
        return su_root_bash(client, root_pass, inner_bash, timeout=timeout)
    finally:
        client.close()


def sftp_put_bytes(host: str, user: str, password: str, remote_path: str, data: bytes) -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, password=password, timeout=30, allow_agent=False, look_for_keys=False)
    try:
        sftp = client.open_sftp()
        with sftp.file(remote_path, "wb") as f:
            f.write(data)
        sftp.close()
    finally:
        client.close()
