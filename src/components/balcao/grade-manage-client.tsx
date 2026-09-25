"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { readApiError } from "@/lib/api/read-error";
import { CLASS_WEEKDAYS, weekdayLabel } from "@/lib/catalog/weekdays";

type Slot = {
  id: string;
  activityId: string;
  weekday: number;
  startTime: string;
};

type Activity = {
  id: string;
  name: string;
  category: string;
  sortOrder: number;
  active: boolean;
  slots: Slot[];
};

const CATEGORY_SUGGESTIONS = ["Ginástica e Dança", "Spinning", "Lutas", "CrossFit"];

async function fetchSchedule() {
  const res = await fetch("/api/class-schedule", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar a grade.");
  const body = (await res.json()) as { items: Activity[] };
  return body.items;
}

function categoryOrder(items: Activity[]): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const current = seen.get(item.category);
    if (current === undefined || item.sortOrder < current) {
      seen.set(item.category, item.sortOrder);
    }
  }
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([category]) => category);
}

function timesFor(items: Activity[]): string[] {
  return [...new Set(items.flatMap((item) => item.slots.map((slot) => slot.startTime)))].sort();
}

export function GradeManageClient({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["class-schedule"], queryFn: fetchSchedule });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORY_SUGGESTIONS[0] ?? "");
  const [slotActivityId, setSlotActivityId] = useState("");
  const [slotWeekday, setSlotWeekday] = useState("1");
  const [slotTime, setSlotTime] = useState("18:00");
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editWeekday, setEditWeekday] = useState("1");
  const [editTime, setEditTime] = useState("18:00");

  async function reload(message: string) {
    setSuccess(message);
    await qc.invalidateQueries({ queryKey: ["class-schedule"] });
  }

  async function createActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/class-schedule", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category: category.trim() }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível criar a aula."));
        return;
      }
      setName("");
      await reload("Aula criada. Inclua os horários abaixo.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(activity: Activity) {
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/class-schedule/${activity.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !activity.active }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível atualizar a aula."));
        return;
      }
      await reload(activity.active ? "Aula desativada." : "Aula ativada.");
    } finally {
      setBusy(false);
    }
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!slotActivityId) return;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/class-schedule/${slotActivityId}/slots`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday: Number(slotWeekday),
          startTime: slotTime,
        }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível incluir o horário."));
        return;
      }
      await reload("Horário incluído.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSlot(slotId: string) {
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/class-slots/${slotId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday: Number(editWeekday),
          startTime: editTime,
        }),
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível alterar o horário."));
        return;
      }
      setEditingSlotId(null);
      await reload("Horário atualizado.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(slotId: string) {
    if (!window.confirm("Remover este horário da grade?")) return;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/class-slots/${slotId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setErr(await readApiError(res, "Não foi possível remover o horário."));
        return;
      }
      await reload("Horário removido.");
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando grade…</p>;
  }
  if (q.isError) {
    return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  }

  const items = q.data ?? [];
  const visible = items.filter((item) => item.active);
  const categories = categoryOrder(visible);

  return (
    <div className="space-y-8">
      <FlashMessage
        error={err}
        success={success}
        onDismiss={() => {
          setErr(null);
          setSuccess(null);
        }}
      />

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma aula ativa na grade. O administrador pode carregar a tabela da
          academia em Planos ou cadastrar uma aula abaixo.
        </p>
      ) : (
        categories.map((category) => {
          const group = visible.filter((item) => item.category === category);
          const times = timesFor(group);
          return (
            <section key={category}>
              <h2 className="text-lg font-medium">{category}</h2>
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[40rem] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/60 text-left">
                      <th className="px-3 py-2 font-medium">Horário</th>
                      {CLASS_WEEKDAYS.map((day) => (
                        <th key={day.value} className="px-3 py-2 font-medium">
                          {day.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {times.map((time) => (
                      <tr key={time} className="border-t border-border">
                        <td className="px-3 py-2 font-medium tabular-nums">{time}</td>
                        {CLASS_WEEKDAYS.map((day) => {
                          const names = group
                            .filter((item) =>
                              item.slots.some(
                                (slot) =>
                                  slot.weekday === day.value && slot.startTime === time,
                              ),
                            )
                            .map((item) => item.name);
                          return (
                            <td key={day.value} className="px-3 py-2">
                              {names.join(", ")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      {isAdmin ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 pt-5">
              <h2 className="text-lg font-medium">Nova aula</h2>
              <form onSubmit={(e) => void createActivity(e)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="activity-name">Nome</Label>
                  <Input
                    id="activity-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-category">Categoria</Label>
                  <Input
                    id="activity-category"
                    list="activity-categories"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                  />
                  <datalist id="activity-categories">
                    {CATEGORY_SUGGESTIONS.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </div>
                <Button type="submit" disabled={busy}>
                  Criar aula
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-5">
              <h2 className="text-lg font-medium">Novo horário</h2>
              <form onSubmit={(e) => void addSlot(e)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="slot-activity">Aula</Label>
                  <Select
                    id="slot-activity"
                    value={slotActivityId}
                    onChange={(e) => setSlotActivityId(e.target.value)}
                    required
                  >
                    <option value="">Selecione</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.active ? "" : " (inativa)"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="slot-day">Dia</Label>
                    <Select
                      id="slot-day"
                      value={slotWeekday}
                      onChange={(e) => setSlotWeekday(e.target.value)}
                    >
                      {CLASS_WEEKDAYS.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="slot-time">Horário</Label>
                    <Input
                      id="slot-time"
                      type="time"
                      value={slotTime}
                      onChange={(e) => setSlotTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={busy || items.length === 0}>
                  Incluir horário
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isAdmin && items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Aulas cadastradas</h2>
          <ul className="space-y-3">
            {items.map((activity) => (
              <li
                key={activity.id}
                className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{activity.name}</p>
                    <p className="text-muted-foreground">
                      {activity.category}
                      {" · "}
                      {activity.active ? (
                        <span className="text-emerald-700">ativa</span>
                      ) : (
                        <span className="text-red-700">inativa</span>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void toggleActive(activity)}
                  >
                    {activity.active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
                <ul className="mt-3 space-y-2">
                  {activity.slots.length === 0 ? (
                    <li className="text-muted-foreground">Sem horários.</li>
                  ) : (
                    activity.slots.map((slot) => (
                      <li key={slot.id} className="flex flex-wrap items-center gap-2">
                        {editingSlotId === slot.id ? (
                          <>
                            <Select
                              value={editWeekday}
                              onChange={(e) => setEditWeekday(e.target.value)}
                            >
                              {CLASS_WEEKDAYS.map((day) => (
                                <option key={day.value} value={day.value}>
                                  {day.label}
                                </option>
                              ))}
                            </Select>
                            <Input
                              type="time"
                              className="w-32"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => void saveSlot(slot.id)}
                            >
                              Salvar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setEditingSlotId(null)}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <>
                            <span>
                              {weekdayLabel(slot.weekday)} · {slot.startTime}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setEditingSlotId(slot.id);
                                setEditWeekday(String(slot.weekday));
                                setEditTime(slot.startTime);
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void removeSlot(slot.id)}
                            >
                              Remover
                            </Button>
                          </>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
