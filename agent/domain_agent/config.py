from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

_RUNS_IN_DOCKER = os.path.isfile("/.dockerenv")


def _primary_dc_ip() -> str:
    return (os.getenv("AGENT_PRIMARY_DC_IP") or "192.168.77.10").strip()


def _no_loopback_in_docker(host: str, fallback_dc: str) -> str:
    """В контейнере 127.0.0.1 — сам контейнер, не сервер с smbd/samba-tool."""
    if not _RUNS_IN_DOCKER:
        return host
    if host not in ("127.0.0.1", "localhost", "::1"):
        return host
    return fallback_dc


# Один источник IP DC.
_primary_dc = _primary_dc_ip()
_dns_env = os.getenv("AGENT_DNS_SERVER", "").strip()
_smb_env = os.getenv("AGENT_SMB_HOST", "").strip()

# DNS / smbcacls — на хост с Samba. Переопределение: AGENT_DNS_SERVER / AGENT_SMB_HOST.
_dns_default = _no_loopback_in_docker(_dns_env or _primary_dc, _primary_dc)
_smb_default = _no_loopback_in_docker(_smb_env or _primary_dc, _primary_dc)


def _share_audit_log_paths() -> tuple[str, ...]:
    raw = (os.getenv("AGENT_SHARE_AUDIT_LOG_PATHS") or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return tuple(str(p) for p in data)
        except json.JSONDecodeError:
            pass
    return (
        "/var/log/samba/log.smbd",
        "/var/log/samba/log.rpcd_classic",
        "/var/log/samba/log.rpcd_fsrv",
    )


@dataclass
class Settings:
    shared_secret: str = os.getenv("AGENT_SHARED_SECRET", "change-me-agent-secret")
    max_skew_seconds: int = int(os.getenv("AGENT_MAX_SKEW_SECONDS", "300"))
    dns_server: str = _dns_default
    smb_host: str = _smb_default
    dns_admin_user: str = os.getenv("AGENT_DNS_ADMIN_USER", "Administrator")
    dns_admin_password: str = os.getenv("AGENT_DNS_ADMIN_PASSWORD", "")
    default_domain_dns: str = os.getenv("AGENT_DEFAULT_DOMAIN_DNS", "test.alt")
    default_realm: str = os.getenv("AGENT_DEFAULT_REALM", "TEST.ALT")
    netbios_domain: str = os.getenv("AGENT_NETBIOS_DOMAIN", "TEST")
    dc_ip: str = _primary_dc
    share_audit_log_paths: tuple[str, ...] = field(default_factory=_share_audit_log_paths)


settings = Settings()
