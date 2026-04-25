from rest_framework.permissions import BasePermission

from .models import UserRole


class IsOperator(BasePermission):
    allowed_roles = {
        UserRole.SUPERADMIN,
        UserRole.DOMAIN_ADMIN,
        UserRole.HELPDESK,
    }

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )


class IsDomainAdmin(BasePermission):
    allowed_roles = {
        UserRole.SUPERADMIN,
        UserRole.DOMAIN_ADMIN,
    }

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )


class IsAuditorOrHigher(BasePermission):
    allowed_roles = {
        UserRole.SUPERADMIN,
        UserRole.DOMAIN_ADMIN,
        UserRole.AUDITOR,
    }

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )
