from django.contrib.auth import password_validation
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from auditlog.service import write_audit_event

from .serializers import ChangePasswordSerializer, ProfileUpdateSerializer, UserSerializer


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        write_audit_event(
            actor=request.user,
            action="accounts.profile.update",
            target_type="user",
            target_id=request.user.username,
            metadata={"is_pro_mode": request.user.is_pro_mode},
        )
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        new_password = serializer.validated_data["new_password"]
        password_validation.validate_password(new_password, request.user)
        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])
        write_audit_event(
            actor=request.user,
            action="accounts.password.change",
            target_type="user",
            target_id=request.user.username,
        )
        return Response({"detail": "Пароль обновлён."})


class AuthTokenView(TokenObtainPairView):
    pass


class AuthRefreshView(TokenRefreshView):
    pass
