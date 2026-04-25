from django.conf import settings
from django.db import models


class AuditStatus(models.TextChoices):
    INFO = "info", "Info"
    SUCCESS = "success", "Success"
    FAILURE = "failure", "Failure"


class AuditSeverity(models.TextChoices):
    NORMAL = "normal", "Normal"
    CRITICAL = "critical", "Critical"


class AuditSource(models.TextChoices):
    PANEL = "panel", "Panel"
    AGENT = "agent", "Agent"


class AuditEvent(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_events",
    )
    username_snapshot = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=128)
    target_type = models.CharField(max_length=64, blank=True)
    target_id = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=16,
        choices=AuditStatus.choices,
        default=AuditStatus.INFO,
    )
    metadata = models.JSONField(default=dict, blank=True)
    remote_addr = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    category = models.CharField(max_length=32, blank=True, db_index=True)
    severity = models.CharField(
        max_length=16,
        choices=AuditSeverity.choices,
        default=AuditSeverity.NORMAL,
        db_index=True,
    )
    source = models.CharField(
        max_length=16,
        choices=AuditSource.choices,
        default=AuditSource.PANEL,
        db_index=True,
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.action} ({self.status})"
