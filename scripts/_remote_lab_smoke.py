"""
Одноразовая проверка/развёртывание lab: SSH на ALT ВМ (пароль только для автотеста).
Не хранить пароли в репозитории — задайте через переменные окружения.
"""
from __future__ import annotations

import os
import sys
import textwrap
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))

from lab_ssh import run_root_bash, ssh_cmd

SERVER = os.environ.get("LAB_SERVER", "192.168.0.212")
WS = os.environ.get("LAB_WS", "192.168.0.211")
USER_SRV = os.environ.get("LAB_USER_SRV", "ara")
USER_WS = os.environ.get("LAB_USER_WS", "ars")
PASS_LOGIN = os.environ.get("LAB_PASS", "1")
ROOT_PASS = os.environ.get("LAB_ROOT_PASS", PASS_LOGIN)
# Пароль администратора каталога (Samba отклонит слабые вроде "1")
DOMAIN_ADMIN_PASS = os.environ.get("LAB_DOMAIN_ADMIN_PASS", "AltLab-DC-9x!")
REALM = os.environ.get("LAB_REALM", "TEST.ALT")
DOMAIN_DNS = os.environ.get("LAB_DOMAIN_DNS", "test.alt")
NETBIOS = os.environ.get("LAB_NETBIOS", "TEST")


def main() -> int:
    if getattr(sys.stdout, "reconfigure", None):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except Exception:
            pass
    print("=== 1. Panel (local): provision script from backend ===")
    import urllib.request

    try:
        req = urllib.request.urlopen(
            "http://127.0.0.1:3000/api/backend/agent/provision-dc.sh/?token=change-me-agent-secret",
            timeout=10,
        )
        data = req.read(400)
        print("  HTTP OK, bytes=", len(data), "head_hex=", data[:48].hex())
    except Exception as exc:
        print("  panel download failed:", ascii(str(exc)))

    print("\n=== 2. Server", SERVER, USER_SRV, "===")
    code, out, err = ssh_cmd(SERVER, USER_SRV, PASS_LOGIN, "hostname; ip -4 -br a | head -5")
    print(out or err or f"(exit {code})")

    code, out, err = run_root_bash(SERVER, USER_SRV, PASS_LOGIN, ROOT_PASS, "whoami", timeout=60)
    print("root whoami:", (out + err).strip()[-200:], f"(code={code})")
    if code != 0:
        print("No root (sudo/su failed). Set LAB_ROOT_PASS if root password differs from LAB_PASS.")
        return 1

    code, out, err = run_root_bash(
        SERVER,
        USER_SRV,
        PASS_LOGIN,
        ROOT_PASS,
        "test -f /etc/samba/smb.conf && samba-tool domain info 2>/dev/null | head -20 || echo NO_DOMAIN_INFO",
        timeout=60,
    )
    print("samba-tool domain info (snippet):\n", (out + err)[:1200])

    dc_active = False
    code2, out2, _ = run_root_bash(
        SERVER,
        USER_SRV,
        PASS_LOGIN,
        ROOT_PASS,
        "(systemctl is-active samba 2>/dev/null || true); (systemctl is-active samba-ad-dc 2>/dev/null || true)",
        timeout=30,
    )
    lines = [ln.strip() for ln in out2.splitlines() if ln.strip()]
    dc_active = any(ln == "active" for ln in lines)
    print("samba / samba-ad-dc is-active:", out2.strip()[-300:], "dc_active=", dc_active)

    if dc_active and "Domain" in out:
        print("\nDC likely already provisioned — skip.")
    else:
        print("\n=== 3. Non-interactive provision (apt + samba-tool) ===")
        inner = textwrap.dedent(
            f"""
            set -e
            export DEBIAN_FRONTEND=noninteractive
            apt-get update -qq
            if apt-cache show task-samba-dc >/dev/null 2>&1; then
              apt-get install -y task-samba-dc
            else
              apt-get install -y samba-ad-dc krb5-user winbind libnss-winbind libpam-winbind dnsutils
            fi
            apt-get install -y dnsutils 2>/dev/null || apt-get install -y bind-utils 2>/dev/null || true
            for s in smb nmb krb5kdc slapd bind; do systemctl disable "$s" 2>/dev/null || true; systemctl stop "$s" 2>/dev/null || true; done
            systemctl stop smbd 2>/dev/null || true
            systemctl stop nmbd 2>/dev/null || true
            systemctl stop winbind 2>/dev/null || true
            systemctl stop samba-ad-dc 2>/dev/null || true
            systemctl stop samba 2>/dev/null || true
            if [ -f /var/lib/samba/private/sam.ldb ]; then
              echo "DC database already exists — skip provision."
              systemctl restart samba 2>/dev/null || systemctl restart samba-ad-dc 2>/dev/null || true
              samba-tool domain info | head -15
              exit 0
            fi
            if [ -f /etc/samba/smb.conf ]; then
              cp -a /etc/samba/smb.conf /etc/samba/smb.conf.bak.lab-$(date +%s) || true
            fi
            rm -f /etc/samba/smb.conf 2>/dev/null || true
            samba-tool domain provision --server-role=dc --realm={REALM} --domain={NETBIOS} \\
              --dns-backend=SAMBA_INTERNAL --use-rfc2307 --adminpass='{DOMAIN_ADMIN_PASS}'
            if systemctl list-unit-files | grep -q '^samba.service'; then
              systemctl unmask samba 2>/dev/null || true
              systemctl enable samba
              systemctl restart samba
            else
              systemctl unmask samba-ad-dc 2>/dev/null || true
              systemctl enable samba-ad-dc
              systemctl restart samba-ad-dc
            fi
            sleep 2
            samba-tool domain info | head -15
            """
        ).strip()
        code, out, err = run_root_bash(SERVER, USER_SRV, PASS_LOGIN, ROOT_PASS, inner, timeout=900)
        print((out + err)[:4000])
        if code != 0:
            print("provision exit code:", code)

    print("\n=== 4. Workstation", WS, USER_WS, "===")
    code, out, err = ssh_cmd(WS, USER_WS, PASS_LOGIN, "hostname; ip -4 -br a | head -5")
    print(out or err)

    # net ads join: пароль Administrator в форме user%pass (только для тестовой сети)
    ads_user = f"Administrator%{DOMAIN_ADMIN_PASS}".replace("'", "'\"'\"'")
    join_inner = textwrap.dedent(
        f"""
        set -e
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        if apt-cache show task-samba-client >/dev/null 2>&1; then
          apt-get install -y task-samba-client krb5-user winbind libnss-winbind libpam-winbind
        elif apt-cache show samba-client >/dev/null 2>&1; then
          apt-get install -y samba-client samba-winbind krb5-user libnss-winbind libpam-winbind
        else
          apt-get install -y samba-common-bin samba-client krb5-user winbind libnss-winbind libpam-winbind realmd sssd sssd-ad adcli dnsutils || true
        fi
        apt-get install -y dnsutils 2>/dev/null || apt-get install -y bind-utils 2>/dev/null || true
        grep -q '{DOMAIN_DNS}' /etc/hosts || echo -e '{SERVER}\\t{DOMAIN_DNS}' >> /etc/hosts
        systemctl stop smbd 2>/dev/null || true
        systemctl stop nmbd 2>/dev/null || true
        net ads join -U '{ads_user}' -S {SERVER}
        systemctl enable winbind 2>/dev/null || true
        systemctl restart winbind 2>/dev/null || true
        net ads testjoin || true
        """
    ).strip()
    code, out, err = run_root_bash(WS, USER_WS, PASS_LOGIN, ROOT_PASS, join_inner, timeout=600)
    print("net ads join (snippet):\n", (out + err)[:3500])

    print("\n=== Summary ===")
    print("Domain admin password (Samba) if domain was created:", DOMAIN_ADMIN_PASS)
    print("Samba login: Administrator @", DOMAIN_DNS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
