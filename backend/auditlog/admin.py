from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "username_snapshot",
        "action",
        "category",
        "severity",
        "source",
        "target_type",
        "status",
    )
    list_filter = ("status", "target_type", "category", "severity", "source", "created_at")
    search_fields = ("username_snapshot", "action", "target_id")
