from django.conf import settings
from django.db import models
from django.utils.text import slugify


class ServerRole(models.TextChoices):
    PRIMARY_DC = "primary_dc", "Primary DC"
    BACKUP_DC = "backup_dc", "Backup DC"
    FILE_SERVER = "file_server", "File server"
    HYBRID = "hybrid", "Hybrid"


class JobStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    RUNNING = "running", "Running"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"


class ManagedServer(models.Model):
    name = models.CharField(max_length=128)
    slug = models.SlugField(unique=True)
    base_url = models.URLField()
    role = models.CharField(max_length=32, choices=ServerRole.choices, default=ServerRole.PRIMARY_DC)
    shared_secret = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    capabilities = models.JSONField(default=dict, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class ExecutionJob(models.Model):
    server = models.ForeignKey(ManagedServer, on_delete=models.CASCADE, related_name="jobs")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="requested_jobs",
    )
    operation = models.CharField(max_length=128)
    target_type = models.CharField(max_length=64, blank=True)
    target_name = models.CharField(max_length=255, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=JobStatus.choices, default=JobStatus.PENDING)
    dry_run = models.BooleanField(default=False)
    agent_request_id = models.CharField(max_length=128, blank=True)
    result = models.JSONField(default=dict, blank=True)
    stdout = models.TextField(blank=True)
    stderr = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.operation} [{self.status}]"
