"use client";

import { useState } from "react";
import { AttendanceReportClient } from "@/components/balcao/attendance-report-client";
import { FinancialReportClient } from "@/components/balcao/financial-report-client";
import { Button } from "@/components/ui/button";

type Tab = "financial" | "attendance";

export function ReportsPageClient() {
  const [tab, setTab] = useState<Tab>("financial");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        <Button
          type="button"
          size="sm"
          variant={tab === "financial" ? "default" : "outline"}
          onClick={() => setTab("financial")}
        >
          Financeiro
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "attendance" ? "default" : "outline"}
          onClick={() => setTab("attendance")}
        >
          Presença
        </Button>
      </div>

      {tab === "financial" ? <FinancialReportClient /> : <AttendanceReportClient />}
    </div>
  );
}
