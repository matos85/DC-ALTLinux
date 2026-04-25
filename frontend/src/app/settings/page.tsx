"use client";

import { FormEvent, useEffect, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { ActionButton, Field, StatusMessage, TextInput } from "@/components/form-controls";
import { PageHeader } from "@/components/page-header";
import { formatApiError } from "@/lib/client-api";

export default function SettingsPage() {
  const { user, updateProfile, changePassword } = useAuth();
  const [profileState, setProfileState] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    display_name: "",
    is_pro_mode: false,
  });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileTone, setProfileTone] = useState<"neutral" | "success" | "error">("neutral");
  const [passwordState, setPasswordState] = useState({
    current: "",
    next: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordTone, setPasswordTone] = useState<"neutral" | "success" | "error">("neutral");

  useEffect(() => {
    if (!user) {
      return;
    }

    const timer = window.setTimeout(() => {
      setProfileState({
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name,
        is_pro_mode: user.is_pro_mode === true,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [user]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage("Сохраняю настройки профиля...");
    setProfileTone("neutral");
    try {
      const updated = await updateProfile(profileState);
      setProfileState({
        username: updated.username,
        email: updated.email,
        first_name: updated.first_name,
        last_name: updated.last_name,
        display_name: updated.display_name,
        is_pro_mode: updated.is_pro_mode,
      });
      setProfileMessage("Профиль обновлён.");
      setProfileTone("success");
    } catch (error) {
      setProfileMessage(formatApiError(error));
      setProfileTone("error");
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("Меняю пароль...");
    setPasswordTone("neutral");
    try {
      const detail = await changePassword(passwordState.current, passwordState.next);
      setPasswordMessage(detail);
      setPasswordTone("success");
      setPasswordState({ current: "", next: "" });
    } catch (error) {
      setPasswordMessage(formatApiError(error));
      setPasswordTone("error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Настройки учётной записи"
        description="Здесь хранятся персональные параметры администратора панели: логин, отображаемое имя, пароль и переключатель Pro-режима."
      />

      <AuthGuard>
        <PageTabs
          defaultId="profile"
          tabs={[
            {
              id: "profile",
              label: "Профиль",
              content: (
                <DataCard title="Профиль администратора" description="Логин, ФИО, почта и Pro-режим.">
                  <form className="grid gap-4" onSubmit={handleProfileSubmit}>
                    <Field label="Логин панели">
                      <TextInput
                        value={profileState.username}
                        onChange={(event) => setProfileState((current) => ({ ...current, username: event.target.value }))}
                      />
                    </Field>
                    <Field label="Отображаемое имя">
                      <TextInput
                        value={profileState.display_name}
                        onChange={(event) =>
                          setProfileState((current) => ({ ...current, display_name: event.target.value }))
                        }
                      />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Имя">
                        <TextInput
                          value={profileState.first_name}
                          onChange={(event) =>
                            setProfileState((current) => ({ ...current, first_name: event.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Фамилия">
                        <TextInput
                          value={profileState.last_name}
                          onChange={(event) =>
                            setProfileState((current) => ({ ...current, last_name: event.target.value }))
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Email">
                      <TextInput
                        type="email"
                        value={profileState.email}
                        onChange={(event) => setProfileState((current) => ({ ...current, email: event.target.value }))}
                      />
                    </Field>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={profileState.is_pro_mode}
                        onChange={(event) =>
                          setProfileState((current) => ({ ...current, is_pro_mode: event.target.checked }))
                        }
                      />
                      <span>Включить Pro-режим (JSON-операции в разделах).</span>
                    </label>
                    {profileMessage ? <StatusMessage message={profileMessage} tone={profileTone} /> : null}
                    <ActionButton type="submit">Сохранить профиль</ActionButton>
                  </form>
                  <p className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-600">
                    Сборка интерфейса:{" "}
                    <span className="font-mono text-slate-500">
                      {process.env.NEXT_PUBLIC_APP_BUILD ?? "—"}
                    </span>
                    . Если дата не менялась после обновления кода — фронтенд не пересобирали (Docker без{" "}
                    <span className="font-mono">--no-cache</span> или старый <span className="font-mono">npm run build</span>
                    ).
                  </p>
                </DataCard>
              ),
            },
            {
              id: "password",
              label: "Пароль",
              content: (
                <DataCard title="Смена пароля" description="Для текущей учётной записи панели.">
                  <form className="grid gap-4" onSubmit={handlePasswordSubmit}>
                    <Field label="Текущий пароль">
                      <TextInput
                        type="password"
                        value={passwordState.current}
                        onChange={(event) =>
                          setPasswordState((current) => ({ ...current, current: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Новый пароль" hint="Минимум 8 символов.">
                      <TextInput
                        type="password"
                        value={passwordState.next}
                        onChange={(event) => setPasswordState((current) => ({ ...current, next: event.target.value }))}
                      />
                    </Field>
                    {passwordMessage ? <StatusMessage message={passwordMessage} tone={passwordTone} /> : null}
                    <ActionButton type="submit">Сменить пароль</ActionButton>
                  </form>
                </DataCard>
              ),
            },
          ]}
        />
      </AuthGuard>
    </div>
  );
}
