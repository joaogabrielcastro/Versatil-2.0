import { describe, expect, it } from "vitest";
import { importJobFinalStatus } from "@/lib/import/job-status";

describe("importJobFinalStatus", () => {
  it("completed quando inseriu tudo", () => {
    expect(importJobFinalStatus(10, 0)).toBe("completed");
  });

  it("failed quando nenhuma linha válida entrou", () => {
    expect(importJobFinalStatus(0, 5)).toBe("failed");
  });

  it("completed com erros parciais (linhas inválidas, mas houve inserção)", () => {
    expect(importJobFinalStatus(3, 2)).toBe("completed");
  });
});
