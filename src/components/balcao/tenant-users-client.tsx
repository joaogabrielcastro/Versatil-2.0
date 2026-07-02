"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTimeBr } from "@/lib/dates/br";

type TenantUser = {
  id: string;
  email: string;
  role: "tenant_admin" | "tenant_user";
  createdAt: string;
};

const ROLE_OPTIONS = [
  { value: "tenant_admin", label: "Administrador" },
  { value: "tenant_user", label: "Recepcionista" },
] as const;

async function fetchUsers() {
  const res = await fetch("/api/tenant/users", { credentials: "include" });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Falha ao carregar usuários.");
  }
  return (await res.json()) as { items: TenantUser[] };
}

export function TenantUsersClient({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tenant-users"], queryFn: fetchUsers });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"tenant_admin" | "tenant_user">("tenant_user");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/tenant/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Erro ao criar usuário.");
        return;
      }
      setEmail("");
      setPassword("");
      setRole("tenant_user");
      setMsg("Usuário criado com sucesso.");
      await qc.invalidateQueries({ queryKey: ["tenant-users"] });
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(userId: string, newRole: "tenant_admin" | "tenant_user") {
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/tenant/users/${userId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Erro ao atualizar atribuição.");
      return;
    }
    setMsg("Atribuição atualizada.");
    await qc.invalidateQueries({ queryKey: ["tenant-users"] });
  }

  async function resetPassword(userId: string) {
    const next = window.prompt("Nova senha (mínimo 8 caracteres):");
    if (!next || next.length < 8) return;
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/tenant/users/${userId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: next }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Erro ao redefinir senha.");
      return;
    }
    setMsg("Senha redefinida.");
  }

  async function removeUser(userId: string, userEmail: string) {
    if (!window.confirm(`Remover o usuário ${userEmail}?`)) return;
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/tenant/users/${userId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Erro ao remover usuário.");
      return;
    }
    setMsg("Usuário removido.");
    await qc.invalidateQueries({ queryKey: ["tenant-users"] });
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="font-medium text-foreground">Atribuições</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            <strong className="text-foreground">Administrador</strong> — planos,
            treinos, integrações, catraca, gerar faturas e gestão de usuários.
          </li>
          <li>
            <strong className="text-foreground">Recepcionista</strong> — alunos,
            cobrança no balcão, presença e relatórios do dia a dia.
          </li>
        </ul>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">Novo usuário</h2>
        <form
          onSubmit={(e) => void createUser(e)}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium">E-mail</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Senha inicial</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Atribuição</span>
            <select
              className="h-10 rounded-md border border-border bg-transparent px-3 text-sm"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "tenant_admin" | "tenant_user")
              }
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Adicionar usuário"}
            </Button>
          </div>
        </form>
      </section>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section>
        <h2 className="text-sm font-medium">Equipe da academia</h2>
        {q.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>
        ) : q.isError ? (
          <p className="mt-2 text-sm text-red-600">{(q.error as Error).message}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Atribuição</th>
                  <th className="px-3 py-2 font-medium">Desde</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.items.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      {u.email}
                      {u.id === currentUserId ? (
                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
                        value={u.role}
                        onChange={(e) =>
                          void updateRole(
                            u.id,
                            e.target.value as "tenant_admin" | "tenant_user",
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTimeBr(new Date(u.createdAt))}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void resetPassword(u.id)}
                        >
                          Redefinir senha
                        </Button>
                        {u.id !== currentUserId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void removeUser(u.id, u.email)}
                          >
                            Remover
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
