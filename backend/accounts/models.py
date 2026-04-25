from django.contrib.auth.models import AbstractUser
from django.db import models


class UserRole(models.TextChoices):
    SUPERADMIN = "superadmin", "Superadmin"
    DOMAIN_ADMIN = "domain_admin", "Domain admin"
    HELPDESK = "helpdesk", "Helpdesk"
    AUDITOR = "auditor", "Auditor"


class User(AbstractUser):
    role = models.CharField(
        max_length=32,
        choices=UserRole.choices,
        default=UserRole.HELPDESK,
    )
    display_name = models.CharField(max_length=255, blank=True)
    is_pro_mode = models.BooleanField(default=False)

    @property
    def effective_name(self) -> str:
        return self.display_name or self.get_full_name() or self.username
