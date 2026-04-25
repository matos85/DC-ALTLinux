from django.contrib import admin

from .models import ExecutionJob, ManagedServer


@admin.register(ManagedServer)
class ManagedServerAdmin(admin.ModelAdmin):
    list_display = ("name", "role", "base_url", "is_active", "is_default", "last_seen_at")
    list_filter = ("role", "is_active", "is_default")
    search_fields = ("name", "slug", "base_url")


@admin.register(ExecutionJob)
class ExecutionJobAdmin(admin.ModelAdmin):
    list_display = ("created_at", "operation", "target_name", "status", "server", "dry_run")
    list_filter = ("status", "dry_run", "server")
    search_fields = ("operation", "target_name", "agent_request_id")
