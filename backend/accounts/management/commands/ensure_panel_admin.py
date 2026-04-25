"""Создаёт первого администратора панели из переменных окружения (только если в БД ещё нет пользователей)."""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import UserRole
from accounts.panel_purge import purge_panel_business_data

User = get_user_model()


class Command(BaseCommand):
    help = "Если в БД нет пользователей и заданы PANEL_BOOTSTRAP_USERNAME и PANEL_BOOTSTRAP_PASSWORD — создаёт superadmin."

    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write("Пользователи панели уже есть — пропуск ensure_panel_admin.")
            return

        # Пустая панель: в БД не должно остаться доменных данных без учётных записей (серверы, задачи, аудит).
        purged = purge_panel_business_data(keep_audit=False, purge_sessions=False, purge_jwt_blacklist=False)
        if purged["managed_servers"] or purged["audit_events"]:
            self.stdout.write(
                f"Перед созданием администратора очищены данные панели: "
                f"серверов {purged['managed_servers']}, событий аудита {purged['audit_events']}."
            )

        username = os.environ.get("PANEL_BOOTSTRAP_USERNAME", "").strip()
        password = os.environ.get("PANEL_BOOTSTRAP_PASSWORD", "").strip()
        if not username or not password:
            self.stdout.write(
                "PANEL_BOOTSTRAP_USERNAME/PANEL_BOOTSTRAP_PASSWORD не заданы — первого пользователя нужно создать вручную (createsuperuser)."
            )
            return

        email = os.environ.get("PANEL_BOOTSTRAP_EMAIL", "").strip() or f"{username}@localhost"
        User.objects.create_superuser(
            username=username,
            email=email,
            password=password,
            role=UserRole.SUPERADMIN,
        )
        self.stdout.write(self.style.SUCCESS(f"Создан администратор панели: {username}"))
