from typing import Any

from .middleware import get_current_request
from .models import AuditEvent, AuditSeverity, AuditSource, AuditStatus


def write_audit_event(
    *,
    action: str,
    status: str = AuditStatus.INFO,
    target_type: str = "",
    target_id: str = "",
    metadata: dict[str, Any] | None = None,
    actor=None,
    category: str = "",
    severity: str | None = None,
    source: str | None = None,
):
    request = get_current_request()
    actor = actor or getattr(request, "user", None)
    remote_addr = None
    if request is not None:
        remote_addr = request.META.get("REMOTE_ADDR") or request.META.get("HTTP_X_FORWARDED_FOR")

    username_snapshot = ""
    if actor and getattr(actor, "is_authenticated", False):
        username_snapshot = actor.username
    elif request is not None:
        username_snapshot = "anonymous"

    return AuditEvent.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        username_snapshot=username_snapshot,
        action=action,
        target_type=target_type,
        target_id=target_id,
        status=status,
        metadata=metadata or {},
        remote_addr=remote_addr,
        category=category or "",
        severity=severity or AuditSeverity.NORMAL,
        source=source or AuditSource.PANEL,
    )
