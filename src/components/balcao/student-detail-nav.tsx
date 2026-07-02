"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "dados", label: "Dados" },
  { id: "presenca", label: "Presença" },
  { id: "treinos", label: "Treinos" },
  { id: "assinaturas", label: "Assinaturas" },
  { id: "cobranca", label: "Cobrança" },
] as const;

export function StudentDetailNav() {
  const [active, setActive] = useState<string>("dados");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    for (const section of SECTIONS) {
      const el = document.getElementById(`student-${section.id}`);
      if (!el) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActive(section.id);
            }
          }
        },
        { rootMargin: "-30% 0px -55% 0px", threshold: 0 },
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const o of observers) o.disconnect();
    };
  }, []);

  return (
    <nav
      aria-label="Seções da ficha"
      className="sticky top-[5.5rem] z-30 -mx-6 mb-6 overflow-x-auto border-b border-border bg-background/95 px-6 backdrop-blur"
    >
      <div className="flex w-max gap-1 py-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#student-${s.id}`}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === s.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
