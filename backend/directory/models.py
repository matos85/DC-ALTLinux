from django.db import models

from orchestration.models import ManagedServer


class ShareTemplate(models.Model):
    server = models.ForeignKey(ManagedServer, on_delete=models.CASCADE, related_name="share_templates")
    name = models.CharField(max_length=128)
    path = models.CharField(max_length=255)
    description = models.CharField(max_length=255, blank=True)
    read_groups = models.JSONField(default=list, blank=True)
    change_groups = models.JSONField(default=list, blank=True)
    full_groups = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("server", "name")
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class DirectorySnapshot(models.Model):
    server = models.ForeignKey(ManagedServer, on_delete=models.CASCADE, related_name="directory_snapshots")
    resource_type = models.CharField(max_length=64)
    resource_name = models.CharField(max_length=255)
    payload = models.JSONField(default=dict, blank=True)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("resource_type", "resource_name")

    def __str__(self) -> str:
        return f"{self.resource_type}:{self.resource_name}"
