from rest_framework import serializers

from orchestration.models import ManagedServer

from .models import ShareTemplate


class ServerBoundSerializer(serializers.Serializer):
    server = serializers.PrimaryKeyRelatedField(
        queryset=ManagedServer.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    dry_run = serializers.BooleanField(default=False, required=False)


class SambaUserCreateSerializer(ServerBoundSerializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=255)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    groups = serializers.ListField(child=serializers.CharField(max_length=150), required=False)


class SambaUserPasswordSerializer(ServerBoundSerializer):
    password = serializers.CharField(max_length=255)


class SambaGroupCreateSerializer(ServerBoundSerializer):
    name = serializers.CharField(max_length=150)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)


class GroupMemberSerializer(ServerBoundSerializer):
    username = serializers.CharField(max_length=150)


class ComputerDeleteSerializer(ServerBoundSerializer):
    hostname = serializers.CharField(max_length=255)


class OrganizationalUnitSerializer(ServerBoundSerializer):
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    base_dn = serializers.CharField(max_length=255, required=False, allow_blank=True)
    distinguished_name = serializers.CharField(max_length=255, required=False, allow_blank=True)


class DnsRecordSerializer(ServerBoundSerializer):
    zone = serializers.CharField(max_length=255)
    name = serializers.CharField(max_length=255)
    record_type = serializers.CharField(max_length=16)
    value = serializers.CharField(max_length=255)


class ShareTemplateSerializer(serializers.ModelSerializer):
    server = serializers.PrimaryKeyRelatedField(
        queryset=ManagedServer.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ShareTemplate
        fields = (
            "id",
            "server",
            "name",
            "path",
            "description",
            "read_groups",
            "change_groups",
            "full_groups",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")
        validators = []


class ShareAclSerializer(ServerBoundSerializer):
    principal = serializers.CharField(max_length=255)
    access = serializers.ChoiceField(choices=["read", "change", "full"])


class JoinCommandSerializer(ServerBoundSerializer):
    hostname = serializers.CharField(max_length=255)
    domain_dns = serializers.CharField(max_length=255)
    primary_dc_ip = serializers.CharField(max_length=64)
    admin_user = serializers.CharField(max_length=255, default="Administrator", required=False)
