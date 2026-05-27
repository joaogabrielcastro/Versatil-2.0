"use client";

import { useEffect, useState } from "react";
import { formatDateTimeBr } from "@/lib/dates/br";

type AccessRow = {
  id: string;
  studentId: string | null;
  allowed: boolean;
  reason: string | null;
  createdAt: string;
};

const POLL_MS = 4000;

export function AccessFeed() {
  const [events, setEvents] = useState<AccessRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function pull() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/access-events", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 401) {
            setError("Sessão expirada. Recarregue e entre novamente.");
          } else {
            setError("Não foi possível carregar acessos.");
          }
          return;
        }
        const data = (await res.json()) as { events?: AccessRow[] };
        if (cancelled) return;
        if (data.events) {
          setEvents(data.events);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Falha de rede ao carregar acessos.");
        }
      }
    }

    void pull();
    timer = setInterval(() => {
      void pull();
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aguardando eventos de catraca…
      </p>
    );
  }

  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-sm">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
        >
          <span>
            {e.allowed ? (
              <span className="text-green-700 dark:text-green-400">Liberado</span>
            ) : (
              <span className="text-red-700 dark:text-red-400">Bloqueado</span>
            )}
            {e.reason ? (
              <span className="text-muted-foreground"> · {e.reason}</span>
            ) : null}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatDateTimeBr(e.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
