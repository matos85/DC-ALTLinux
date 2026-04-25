"""Удаление доменных и операционных данных панели (не затрагивает учётные записи Django)."""

from __future__ import annotations

from typing import TypedDict


class PurgeStats(TypedDict):
    managed_servers: int
    audit_events: int
    sessions: int
    jwt_outstanding: int
    jwt_blacklisted: int


def purge_panel_business_data(
    *,
    keep_audit: bool = False,
    purge_sessions: bool = False,
    purge_jwt_blacklist: bool = False,
) -> PurgeStats:
    """
    Удаляет ManagedServer (каскадом: задачи, шаблоны шар, снимки каталога).
    По умолчанию также удаляет все записи аудита панели.
    Не трогает таблицы auth.User, permissions, contenttypes (системные данные Django).
    """
    from auditlog.models import AuditEvent
    from django.contrib.sessions.models import Session
    from orchestration.models import ManagedServer

    stats: PurgeStats = {
        "managed_servers": ManagedServer.objects.count(),
        "audit_events": 0,
        "sessions": 0,
        "jwt_outstanding": 0,
        "jwt_blacklisted": 0,
    }

    if not keep_audit:
        stats["audit_events"] = AuditEvent.objects.count()
        AuditEvent.objects.all().delete()

    ManagedServer.objects.all().delete()

    if purge_sessions:
        stats["sessions"] = Session.objects.count()
        Session.objects.all().delete()

    if purge_jwt_blacklist:
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

        stats["jwt_blacklisted"] = BlacklistedToken.objects.count()
        stats["jwt_outstanding"] = OutstandingToken.objects.count()
        BlacklistedToken.objects.all().delete()
        OutstandingToken.objects.all().delete()

    return stats
