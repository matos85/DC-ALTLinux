"""Классификация операций с шарами для аудита (критичность настраивается в settings)."""
from __future__ import annotations

from django.conf import settings


def audit_category_for_operation(operation: str, target_type: str) -> str:
    if target_type == "share":
        return "share"
    if operation.startswith("samba.share"):
        return "share"
    if operation in ("samba.acl.set", "samba.acl.get"):
        return "share"
    return ""


def is_share_critical_queued(operation: str) -> bool:
    return operation in getattr(settings, "AUDIT_SHARE_CRITICAL_ACTIONS", frozenset())


def severity_for_queued(operation: str, target_type: str) -> str:
    from auditlog.models import AuditSeverity

    if audit_category_for_operation(operation, target_type) != "share":
        return AuditSeverity.NORMAL
    return AuditSeverity.CRITICAL if is_share_critical_queued(operation) else AuditSeverity.NORMAL


def severity_for_job_completion(operation: str, target_type: str, succeeded: bool) -> str:
    from auditlog.models import AuditSeverity

    if not succeeded:
        return AuditSeverity.CRITICAL
    return AuditSeverity.NORMAL
