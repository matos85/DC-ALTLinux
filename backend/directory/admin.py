from django.contrib import admin

from .models import DirectorySnapshot, ShareTemplate


@admin.register(ShareTemplate)
class ShareTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "server", "path", "updated_at")
    list_filter = ("server",)
    search_fields = ("name", "path", "description")


@admin.register(DirectorySnapshot)
class DirectorySnapshotAdmin(admin.ModelAdmin):
    list_display = ("resource_type", "resource_name", "server", "synced_at")
    list_filter = ("resource_type", "server")
    search_fields = ("resource_name",)
