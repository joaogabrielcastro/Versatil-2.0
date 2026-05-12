"use client";

import { useEffect, useState } from "react";

type AccessRow = {
  id: string;
  studentId: string | null;
  allowed: boolean;
  reason: string | null;
  createdAt: string;
};

export function AccessFeed() {
  const [events, setEvents] = useState<AccessRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/access-events/stream");
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { events?: AccessRow[] };
        if (data.events) {
          setEvents(data.events);
          setError(null);
        }
      } catch {
        setError("Falha ao interpretar evento.");
      }
    };
    es.onerror = () => {
      setError("Conexão SSE interrompida. Recarregue a página.");
      es.close();
    };
    return () => es.close();
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
            {new Date(e.createdAt).toLocaleString("pt-BR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
