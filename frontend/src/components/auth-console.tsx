"use client";

import { FormEvent, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { formatApiError } from "@/lib/client-api";

export function AuthConsole() {
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("AdminPanel123!");
  const [message, setMessage] = useState("Введите учётные данные администратора панели.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Запрос авторизации...");

    try {
      await login(username, password);
      setMessage("Вход выполнен, перенаправление…");
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  return (
    <form data-testid="panel-login-form" className="grid gap-3" onSubmit={handleSubmit}>
      <input
        data-testid="panel-login-username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
        placeholder="Имя пользователя панели"
        autoComplete="username"
      />
      <input
        data-testid="panel-login-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
        placeholder="Пароль"
        autoComplete="current-password"
      />
      <button
        type="submit"
        data-testid="panel-login-submit"
        className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-medium text-slate-950 hover:bg-sky-400"
      >
        Войти
      </button>
      <p className="text-sm text-slate-400">{message}</p>
    </form>
  );
}
