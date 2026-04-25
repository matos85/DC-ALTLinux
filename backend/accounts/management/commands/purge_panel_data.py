"""Сброс доменных данных в БД панели (серверы, задачи, шаблоны, при необходимости аудит и сессии)."""

from django.core.management.base import BaseCommand

from accounts.panel_purge import purge_panel_business_data


class Command(BaseCommand):
    help = (
        "Удаляет из БД доменный контур панели: зарегистрированные серверы (и каскадом задачи, шаблоны шар, снимки), "
        "по умолчанию также журнал аудита. Учётные записи панели (User) не изменяются."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--keep-audit",
            action="store_true",
            help="Не удалять записи auditlog.AuditEvent.",
        )
        parser.add_argument(
            "--purge-sessions",
            action="store_true",
            help="Очистить django.contrib.sessions (разлогинит cookie-сессии в админке Django, если используются).",
        )
        parser.add_argument(
            "--purge-jwt-blacklist",
            action="store_true",
            help="Очистить таблицы JWT blacklist (все выданные refresh-токены перестанут валидироваться).",
        )

    def handle(self, *args, **options):
        stats = purge_panel_business_data(
            keep_audit=options["keep_audit"],
            purge_sessions=options["purge_sessions"],
            purge_jwt_blacklist=options["purge_jwt_blacklist"],
        )
        audit_part = (
            f"событий аудита удалено: {stats['audit_events']}"
            if not options["keep_audit"]
            else "аудит не трогали (--keep-audit)"
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Очистка завершена: "
                f"серверов (и каскадом связанных строк) удалено: {stats['managed_servers']}; "
                f"{audit_part}; "
                f"сессий: {stats['sessions']}; "
                f"JWT outstanding: {stats['jwt_outstanding']}; "
                f"JWT blacklisted: {stats['jwt_blacklisted']}."
            )
        )
