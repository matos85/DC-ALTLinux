#!/usr/bin/env python3
"""
Полный боевой прогон по эталону: DC + join РС (как _remote_lab_smoke), установка агента на DC,
регистрация ManagedServer в панели, OU / группы / пользователь / шара / DNS, проверка списков.

Переменные окружения (лаборатория + панель):
  LAB_SERVER, LAB_WS, LAB_USER_SRV, LAB_USER_WS, LAB_PASS, LAB_ROOT_PASS
  LAB_DOMAIN_ADMIN_PASS, LAB_REALM, LAB_DOMAIN_DNS, LAB_NETBIOS
  LAB_BASE_DN          — по умолчанию DC=test,DC=alt для test.alt
  PANEL_API            — http://127.0.0.1:8000
  PANEL_USER           — admin
  PANEL_PASSWORD       — пароль bootstrap панели (docker: change-me-panel-admin)
  AGENT_SHARED_SECRET  — должен совпадать с DOMAIN_AGENT_DEFAULT_SECRET в backend (change-me-agent-secret)
  AGENT_PUBLIC_URL     — URL агента с точки зрения контейнера backend, напр. http://192.168.0.212:8090
                         (не localhost, если backend в Docker на Windows/Mac)

Флаги:
  --skip-dc     не вызывать сценарий provision/join
  --skip-agent  не ставить агент по SSH (уже установлен)
  --dc-only     только домен + join + агент, без API панели
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))

from lab_ssh import run_root_bash, sftp_put_bytes, ssh_cmd

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENT_DIR = REPO_ROOT / "agent"

SERVER = os.environ.get("LAB_SERVER", "192.168.0.212")
WS = os.environ.get("LAB_WS", "192.168.0.211")
USER_SRV = os.environ.get("LAB_USER_SRV", "ara")
USER_WS = os.environ.get("LAB_USER_WS", "ars")
PASS_LOGIN = os.environ.get("LAB_PASS", "1")
ROOT_PASS = os.environ.get("LAB_ROOT_PASS", PASS_LOGIN)
DOMAIN_ADMIN_PASS = os.environ.get("LAB_DOMAIN_ADMIN_PASS", "AltLab-DC-9x!")
DOMAIN_DNS = os.environ.get("LAB_DOMAIN_DNS", "test.alt")
REALM = os.environ.get("LAB_REALM", "TEST.ALT")
NETBIOS = os.environ.get("LAB_NETBIOS", "TEST")
BASE_DN = os.environ.get("LAB_BASE_DN", "DC=test,DC=alt")

PANEL_API = os.environ.get("PANEL_API", "http://127.0.0.1:8000").rstrip("/")
PANEL_USER = os.environ.get("PANEL_USER", "admin")
PANEL_PASSWORD = os.environ.get("PANEL_PASSWORD", "change-me-panel-admin")
AGENT_SECRET = os.environ.get("AGENT_SHARED_SECRET", "change-me-agent-secret")
# С хоста Windows Docker Desktop часто резолвит host.docker.internal → хост; на Linux — IP хоста в LAN.
AGENT_PUBLIC_URL = (
    os.environ.get("AGENT_PUBLIC_URL", "").rstrip("/")
    or f"http://{SERVER}:8090"
)


def log(msg: str) -> None:
    print(msg, flush=True)


def build_agent_tarball() -> bytes:
    if not AGENT_DIR.is_dir():
        raise FileNotFoundError(f"Нет каталога агента: {AGENT_DIR}")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for name in ("domain_agent", "requirements.txt", "install.sh", "README.agent.txt"):
            p = AGENT_DIR / name
            if p.exists():
                tf.add(p, arcname=name)
    return buf.getvalue()


def remote_install_agent() -> None:
    data = build_agent_tarball()
    remote_tgz = "/tmp/dagent-bundle.tgz"
    log(f"SFTP {len(data)} bytes -> {SERVER}:{remote_tgz}")
    sftp_put_bytes(SERVER, USER_SRV, PASS_LOGIN, remote_tgz, data)

    env_lines = [
        f"AGENT_SHARED_SECRET={AGENT_SECRET}",
        f"AGENT_DNS_ADMIN_PASSWORD={DOMAIN_ADMIN_PASS}",
        f"AGENT_DEFAULT_DOMAIN_DNS={DOMAIN_DNS}",
        f"AGENT_DEFAULT_REALM={REALM}",
        f"AGENT_NETBIOS_DOMAIN={NETBIOS}",
        f"AGENT_PRIMARY_DC_IP={SERVER}",
        f"AGENT_SMB_HOST={SERVER}",
        f"AGENT_DNS_SERVER={SERVER}",
    ]
    env_b64 = base64.b64encode("\n".join(env_lines).encode()).decode("ascii")

    inner = f"""
    set -e
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y python3 python3-venv curl || true
    rm -rf /tmp/dagent-extract
    mkdir -p /tmp/dagent-extract
    tar xzf {remote_tgz} -C /tmp/dagent-extract
    cd /tmp/dagent-extract
    chmod +x install.sh
    ./install.sh
    echo '{env_b64}' | base64 -d > /opt/domain-agent/agent.env
    chmod 600 /opt/domain-agent/agent.env
    systemctl daemon-reload
    systemctl enable domain-agent
    systemctl restart domain-agent
    sleep 2
    systemctl is-active domain-agent
    curl -sS --connect-timeout 3 http://127.0.0.1:8090/health | head -c 300 || true
    """
    code, out, err = run_root_bash(SERVER, USER_SRV, PASS_LOGIN, ROOT_PASS, inner.strip(), timeout=600)
    log(out[-2500:] if out else "")
    if err:
        log(err[-800:] if err else "")
    if code != 0:
        raise RuntimeError(f"remote agent install failed code={code}")


def http_json(method: str, url: str, token: str | None, body: dict | None = None, timeout: int = 60):
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {url}: {err_body[:2000]}") from e


def panel_login() -> str:
    status, data = http_json(
        "POST",
        f"{PANEL_API}/api/auth/token/",
        None,
        {"username": PANEL_USER, "password": PANEL_PASSWORD},
        timeout=30,
    )
    if status != 200 or "access" not in data:
        raise RuntimeError(f"login failed: {data}")
    return str(data["access"])


def ensure_managed_server(token: str) -> int:
    st, servers = http_json("GET", f"{PANEL_API}/api/jobs/servers/", token, timeout=30)
    if st != 200:
        raise RuntimeError(str(servers))
    items = servers.get("results", servers) if isinstance(servers, dict) else servers
    items = items if isinstance(items, list) else []
    name = "Lab Samba DC"
    for s in items:
        if s.get("name") == name or s.get("base_url", "").rstrip("/") == AGENT_PUBLIC_URL:
            sid = int(s["id"])
            http_json(
                "PATCH",
                f"{PANEL_API}/api/jobs/servers/{sid}/",
                token,
                {
                    "name": name,
                    "base_url": AGENT_PUBLIC_URL + "/",
                    "role": "primary_dc",
                    "shared_secret": AGENT_SECRET,
                    "is_active": True,
                    "is_default": True,
                },
            )
            log(f"Updated ManagedServer id={sid} -> {AGENT_PUBLIC_URL}")
            return sid
    st, created = http_json(
        "POST",
        f"{PANEL_API}/api/jobs/servers/",
        token,
        {
            "name": name,
            "base_url": AGENT_PUBLIC_URL + "/",
            "role": "primary_dc",
            "shared_secret": AGENT_SECRET,
            "is_active": True,
            "is_default": True,
        },
    )
    if st not in (200, 201):
        raise RuntimeError(str(created))
    sid = int(created["id"])
    log(f"Created ManagedServer id={sid}")
    return sid


def panel_health(token: str, server_id: int) -> None:
    st, data = http_json("POST", f"{PANEL_API}/api/jobs/servers/{server_id}/health/", token, timeout=45)
    if st != 200:
        raise RuntimeError(f"health: {data}")
    log(f"Agent health: {json.dumps(data, ensure_ascii=False)[:500]}")


def wait_job(token: str, job_id: int, timeout_sec: int = 180) -> dict:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        st, job = http_json("GET", f"{PANEL_API}/api/jobs/{job_id}/", token, timeout=30)
        if st != 200:
            raise RuntimeError(str(job))
        status = job.get("status")
        if status in ("succeeded", "failed"):
            if status == "failed":
                raise RuntimeError(f"job {job_id} failed: stderr={job.get('stderr','')[:1500]}")
            return job
        time.sleep(1)
    raise TimeoutError(f"job {job_id} timeout")


def post_job(
    token: str,
    method: str,
    path: str,
    body: dict | None,
    *,
    wait_timeout: int = 240,
) -> dict:
    st, job = http_json(method, f"{PANEL_API}{path}", token, body, timeout=60)
    if st not in (200, 201, 202):
        raise RuntimeError(f"{path} -> {st} {job}")
    if "id" not in job:
        return job
    jid = int(job["id"])
    log(f"  job queued id={jid} op={job.get('operation')}")
    return wait_job(token, jid, timeout_sec=wait_timeout)


def run_panel_full(token: str) -> None:
    sid = ensure_managed_server(token)
    panel_health(token, sid)

    log("GET users (sync)")
    st, users = http_json("GET", f"{PANEL_API}/api/directory/users/", token)
    if st != 200:
        raise RuntimeError(str(users))
    log(f"  users response keys: {list(users.keys())}")

    log("POST OU PanelLab")
    post_job(
        token,
        "POST",
        "/api/directory/ous/",
        {"name": "PanelLab", "base_dn": BASE_DN, "dry_run": False},
    )

    log("POST group PanelWorkgroup")
    post_job(
        token,
        "POST",
        "/api/directory/groups/",
        {"name": "PanelWorkgroup", "description": "Battle lab group", "dry_run": False},
    )

    log("POST user paneluser1")
    post_job(
        token,
        "POST",
        "/api/directory/users/",
        {
            "username": "paneluser1",
            "password": "PanelUser-9x!",
            "first_name": "Panel",
            "last_name": "User",
            "groups": ["PanelWorkgroup"],
            "dry_run": False,
        },
    )

    log("POST share panelfiles")
    post_job(
        token,
        "POST",
        "/api/directory/shares/",
        {
            "name": "panelfiles",
            "path": "/srv/panel-shares/panelfiles",
            "description": "Battle share",
            "read_groups": ["Domain Users"],
            "change_groups": [],
            "full_groups": ["PanelWorkgroup"],
            "dry_run": False,
        },
    )

    log("POST DNS A record battle-ws (optional)")
    try:
        post_job(
            token,
            "POST",
            "/api/directory/dns/records/",
            {
                "zone": DOMAIN_DNS,
                "name": "battle-ws",
                "record_type": "A",
                "value": WS,
                "dry_run": False,
            },
            wait_timeout=120,
        )
    except Exception as exc:
        log(f"  DNS step skipped or failed: {exc}")

    log("GET groups, computers, shares, OU, DNS")
    for path in (
        "/api/directory/groups/",
        "/api/directory/computers/",
        "/api/directory/shares/",
        "/api/directory/ous/",
        f"/api/directory/dns/records/?zone={DOMAIN_DNS}",
    ):
        st, data = http_json("GET", f"{PANEL_API}{path}", token, timeout=60)
        log(f"  {path} -> {st} snippet: {json.dumps(data, ensure_ascii=False)[:800]}")

    log("GET group PanelWorkgroup members")
    st, gm = http_json("GET", f"{PANEL_API}/api/directory/groups/PanelWorkgroup/members/", token)
    log(f"  members: {json.dumps(gm, ensure_ascii=False)[:600]}")


def run_smoke_subprocess() -> None:
    smoke = _scripts / "_remote_lab_smoke.py"
    log(f"Running {smoke} (DC provision + WS join)")
    r = subprocess.run([sys.executable, str(smoke)], cwd=str(REPO_ROOT))
    if r.returncode != 0:
        raise RuntimeError(f"_remote_lab_smoke exit {r.returncode}")


def verify_dc_ready() -> None:
    code, out, err = run_root_bash(
        SERVER,
        USER_SRV,
        PASS_LOGIN,
        ROOT_PASS,
        "samba-tool domain info 2>/dev/null | head -5",
        timeout=60,
    )
    blob = (out + err).lower()
    if "domain" not in blob and "realm" not in blob:
        raise RuntimeError(f"DC not ready: {out[-500:]}{err[-500:]}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-dc", action="store_true")
    parser.add_argument("--skip-agent", action="store_true")
    parser.add_argument("--dc-only", action="store_true")
    args = parser.parse_args()

    if getattr(sys.stdout, "reconfigure", None):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except Exception:
            pass

    try:
        if not args.skip_dc:
            run_smoke_subprocess()
            verify_dc_ready()
        else:
            log("--skip-dc: проверяем, что DC отвечает samba-tool")
            verify_dc_ready()

        if not args.skip_agent:
            remote_install_agent()
        else:
            log("--skip-agent: пропуск установки агента по SSH")

        if args.dc_only:
            log("--dc-only: панель не трогаем")
            return 0

        token = panel_login()
        run_panel_full(token)
        log("=== BATTLE OK ===")
        return 0
    except Exception as exc:
        log(f"=== BATTLE FAILED: {exc} ===")
        return 1


if __name__ == "__main__":
    sys.exit(main())
