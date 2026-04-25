from django.urls import path

from .views import AuthRefreshView, AuthTokenView, ChangePasswordView, CurrentUserView


urlpatterns = [
    path("token/", AuthTokenView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", AuthRefreshView.as_view(), name="token_refresh"),
    path("me/", CurrentUserView.as_view(), name="current_user"),
    path("me/change-password/", ChangePasswordView.as_view(), name="change_password"),
]
