"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FlashMessage } from "@/components/ui/flash-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { readApiError } from "@/lib/api/read-error";
import {
  MANUAL_PAYMENT_LABELS,
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
  manualPaymentLabel,
} from "@/lib/billing/payment-methods";
import { stockMovementLabel } from "@/lib/labels";
import { stockStatus } from "@/lib/services/inventory/stock-logic";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  priceCents: number;
  costCents: number | null;
  quantityOnHand: number;
  lowStockThreshold: number;
  active: boolean;
};

type SaleItem = {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

type Sale = {
  id: string;
  totalCents: number;
  paymentMethod: string;
  note: string | null;
  createdAt: string;
  studentName: string | null;
  items: SaleItem[];
};

type StockMovement = {
  id: string;
  productName: string;
  type: string;
  quantity: number;
  resultingQuantity: number;
  reason: string | null;
  createdAt: string;
};

type Tab = "produtos" | "vender" | "historico";
type StockType = "in" | "out" | "adjust";

const CATEGORIA_SUGESTOES = [
  "Suplementos",
  "Bebidas",
  "Snacks",
  "Acessórios",
  "Roupas",
] as const;

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parsePriceToCents(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function fetchProducts() {
  const res = await fetch("/api/products", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar produtos.");
  const j = (await res.json()) as { items: Product[] };
  return j.items;
}

async function fetchSales() {
  const res = await fetch("/api/sales", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar vendas.");
  const j = (await res.json()) as { items: Sale[] };
  return j.items;
}

async function fetchMovements() {
  const res = await fetch("/api/stock-movements", { credentials: "include" });
  if (!res.ok) throw new Error("Falha ao carregar movimentações.");
  const j = (await res.json()) as { items: StockMovement[] };
  return j.items;
}

export function EstoquePageClient({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const productsQ = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: fetchSales });
  const movementsQ = useQuery({
    queryKey: ["stock-movements"],
    queryFn: fetchMovements,
  });

  const [tab, setTab] = useState<Tab>("produtos");
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [initialQty, setInitialQty] = useState("0");
  const [threshold, setThreshold] = useState("5");
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editThreshold, setEditThreshold] = useState("");

  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveType, setMoveType] = useState<StockType>("in");
  const [moveQty, setMoveQty] = useState("");
  const [moveReason, setMoveReason] = useState("");

  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] =
    useState<ManualPaymentMethod>("pix");
  const [studentQ, setStudentQ] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [studentHits, setStudentHits] = useState<
    { id: string; fullName: string }[]
  >([]);

  useEffect(() => {
    const q = studentQ.trim();
    if (q.length < 2) {
      setStudentHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void fetch(
        `/api/students?q=${encodeURIComponent(q)}&limit=8`,
        { credentials: "include" },
      )
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as {
            items: { id: string; fullName: string }[];
          };
          setStudentHits(data.items);
        })
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(t);
  }, [studentQ]);

  const products = productsQ.data ?? [];
  const sales = salesQ.data ?? [];
  const movements = movementsQ.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.sku ?? "", p.category ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [products, search]);

  const sellable = products.filter((p) => p.active);
  const startOfDay = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const salesToday = sales.filter((s) => new Date(s.createdAt) >= startOfDay);
  const soldTodayCents = salesToday.reduce((sum, s) => sum + s.totalCents, 0);
  const lowCount = products.filter(
    (p) => p.active && stockStatus(p.quantityOnHand, p.lowStockThreshold) === "low",
  ).length;
  const outCount = products.filter(
    (p) => p.active && stockStatus(p.quantityOnHand, p.lowStockThreshold) === "out",
  ).length;

  const cartRows = Object.entries(cart)
    .map(([productId, quantity]) => {
      const product = products.find((p) => p.id === productId);
      if (!product || quantity <= 0) return null;
      return { product, quantity, total: product.priceCents * quantity };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const cartTotal = cartRows.reduce((sum, row) => sum + row.total, 0);

  function flash(ok: string | null, error: string | null) {
    setSuccess(ok);
    setErr(error);
  }

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["sales"] }),
      qc.invalidateQueries({ queryKey: ["stock-movements"] }),
    ]);
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    const cents = parsePriceToCents(price);
    const costCents = cost.trim() ? parsePriceToCents(cost) : null;
    const qty = Number(initialQty.replace(",", ".").trim() || "0");
    const low = Number(threshold.replace(",", ".").trim() || "5");
    if (cents === null || !name.trim() || !Number.isInteger(qty) || qty < 0) {
      flash(null, "Preencha nome, preço e estoque inicial válidos.");
      return;
    }
    if (cost.trim() && costCents === null) {
      flash(null, "Custo inválido.");
      return;
    }
    if (!Number.isInteger(low) || low < 0) {
      flash(null, "Alerta de estoque baixo inválido.");
      return;
    }
    setBusy(true);
    flash(null, null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || null,
          category: category.trim() || null,
          priceCents: cents,
          costCents,
          quantityOnHand: qty,
          lowStockThreshold: low,
        }),
      });
      if (!res.ok) {
        flash(null, await readApiError(res, "Não foi possível criar o produto."));
        return;
      }
      setName("");
      setSku("");
      setCategory("");
      setPrice("");
      setCost("");
      setInitialQty("0");
      setThreshold("5");
      flash("Produto cadastrado.", null);
      await invalidateAll();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setMovingId(null);
    setEditName(p.name);
    setEditSku(p.sku ?? "");
    setEditCategory(p.category ?? "");
    setEditPrice((p.priceCents / 100).toFixed(2).replace(".", ","));
    setEditCost(
      p.costCents == null
        ? ""
        : (p.costCents / 100).toFixed(2).replace(".", ","),
    );
    setEditThreshold(String(p.lowStockThreshold));
    flash(null, null);
  }

  async function saveEdit(productId: string) {
    if (!isAdmin) return;
    const cents = parsePriceToCents(editPrice);
    const costCents = editCost.trim() ? parsePriceToCents(editCost) : null;
    const low = Number(editThreshold.replace(",", ".").trim());
    if (cents === null || !editName.trim()) {
      flash(null, "Preencha nome e preço válidos.");
      return;
    }
    if (editCost.trim() && costCents === null) {
      flash(null, "Custo inválido.");
      return;
    }
    if (!Number.isInteger(low) || low < 0) {
      flash(null, "Alerta de estoque baixo inválido.");
      return;
    }
    setBusy(true);
    flash(null, null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          sku: editSku.trim() || null,
          category: editCategory.trim() || null,
          priceCents: cents,
          costCents,
          lowStockThreshold: low,
        }),
      });
      if (!res.ok) {
        flash(null, await readApiError(res, "Não foi possível salvar o produto."));
        return;
      }
      setEditingId(null);
      flash("Produto atualizado.", null);
      await invalidateAll();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Product) {
    if (!isAdmin) return;
    setBusy(true);
    flash(null, null);
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) {
        flash(null, await readApiError(res, "Não foi possível atualizar o produto."));
        return;
      }
      await invalidateAll();
    } finally {
      setBusy(false);
    }
  }

  async function applyMove(productId: string) {
    if (moveType === "adjust" && !isAdmin) return;
    const qty = Number(moveQty.replace(",", ".").trim());
    if (!Number.isInteger(qty) || qty < 0) {
      flash(null, "Informe uma quantidade inteira.");
      return;
    }
    setBusy(true);
    flash(null, null);
    try {
      const res = await fetch(`/api/products/${productId}/stock`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: moveType,
          quantity: qty,
          reason: moveReason.trim() || null,
        }),
      });
      if (!res.ok) {
        flash(null, await readApiError(res, "Não foi possível movimentar o estoque."));
        return;
      }
      setMovingId(null);
      setMoveQty("");
      setMoveReason("");
      flash("Estoque atualizado.", null);
      await invalidateAll();
    } finally {
      setBusy(false);
    }
  }

  function addToCart(p: Product) {
    if (p.quantityOnHand <= 0) {
      flash(null, `${p.name} está sem estoque.`);
      return;
    }
    setCart((prev) => {
      const current = prev[p.id] ?? 0;
      if (current >= p.quantityOnHand) return prev;
      return { ...prev, [p.id]: current + 1 };
    });
  }

  function setCartQty(productId: string, quantity: number, max: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[productId];
      } else {
        next[productId] = Math.min(quantity, max);
      }
      return next;
    });
  }

  async function checkout() {
    if (cartRows.length === 0) {
      flash(null, "Adicione itens à venda.");
      return;
    }
    setBusy(true);
    flash(null, null);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          studentId,
          items: cartRows.map((row) => ({
            productId: row.product.id,
            quantity: row.quantity,
          })),
        }),
      });
      if (!res.ok) {
        flash(null, await readApiError(res, "Não foi possível concluir a venda."));
        return;
      }
      setCart({});
      setStudentId(null);
      setStudentName(null);
      setStudentQ("");
      flash(`Venda de ${money(cartTotal)} registrada.`, null);
      setTab("historico");
      await invalidateAll();
    } finally {
      setBusy(false);
    }
  }

  if (productsQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (productsQ.isError) {
    return (
      <p className="text-sm text-red-600">{(productsQ.error as Error).message}</p>
    );
  }

  return (
    <div className="space-y-6">
      <FlashMessage
        error={err}
        success={success}
        onDismiss={() => {
          setErr(null);
          setSuccess(null);
        }}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Produtos ativos" value={String(products.filter((p) => p.active).length)} />
        <SummaryCard
          label="Estoque baixo"
          value={String(lowCount)}
          accent={lowCount > 0 ? "amber" : undefined}
        />
        <SummaryCard
          label="Sem estoque"
          value={String(outCount)}
          accent={outCount > 0 ? "red" : undefined}
        />
        <SummaryCard label="Vendas hoje" value={money(soldTodayCents)} />
      </section>

      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {(
          [
            ["produtos", "Produtos"],
            ["vender", "Vender"],
            ["historico", "Histórico"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={tab === id ? "default" : "outline"}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "produtos" ? (
        <div className="space-y-8">
          {isAdmin ? (
            <Card>
              <CardContent className="space-y-4 pt-5">
                <div>
                  <h2 className="text-lg font-medium">Novo produto</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cadastre o item da loja e o estoque inicial. A venda no
                    balcão baixa o estoque automaticamente.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Categorias rápidas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIA_SUGESTOES.map((c) => (
                      <Button
                        key={c}
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
                <form
                  onSubmit={(e) => void createProduct(e)}
                  className="grid max-w-3xl gap-3 sm:grid-cols-2"
                >
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="product-name">Nome</Label>
                    <Input
                      id="product-name"
                      placeholder="Ex.: Whey 900g, Isotônico 500ml"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-sku">Código / SKU (opcional)</Label>
                    <Input
                      id="product-sku"
                      placeholder="WHEY-900"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-category">Categoria</Label>
                    <Input
                      id="product-category"
                      placeholder="Suplementos"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-price">Preço de venda (R$)</Label>
                    <Input
                      id="product-price"
                      placeholder="89,90"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-cost">Custo (R$, opcional)</Label>
                    <Input
                      id="product-cost"
                      placeholder="45,00"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-qty">Estoque inicial</Label>
                    <Input
                      id="product-qty"
                      inputMode="numeric"
                      value={initialQty}
                      onChange={(e) => setInitialQty(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-low">Alerta de estoque baixo</Label>
                    <Input
                      id="product-low"
                      inputMode="numeric"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={busy}>
                      Cadastrar produto
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              Apenas administradores cadastram ou editam produtos. Você pode
              dar entrada/saída e vender no balcão.
            </p>
          )}

          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-medium">Produtos cadastrados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Itens em vermelho estão zerados; em âmbar, abaixo do alerta.
                </p>
              </div>
              <div className="w-full sm:max-w-xs">
                <Label htmlFor="product-search" className="sr-only">
                  Buscar produtos
                </Label>
                <Input
                  id="product-search"
                  placeholder="Buscar por nome, código ou categoria"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={Package}
                title="Nenhum produto"
                description="Cadastre o que a academia vende para controlar estoque e registrar vendas no balcão."
              />
            ) : (
              <ul className="mt-4 space-y-3">
                {filtered.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm"
                  >
                    {editingId === p.id ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor={`edit-name-${p.id}`}>Nome</Label>
                            <Input
                              id={`edit-name-${p.id}`}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`edit-sku-${p.id}`}>SKU</Label>
                            <Input
                              id={`edit-sku-${p.id}`}
                              value={editSku}
                              onChange={(e) => setEditSku(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`edit-cat-${p.id}`}>Categoria</Label>
                            <Input
                              id={`edit-cat-${p.id}`}
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`edit-price-${p.id}`}>Preço (R$)</Label>
                            <Input
                              id={`edit-price-${p.id}`}
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`edit-cost-${p.id}`}>Custo (R$)</Label>
                            <Input
                              id={`edit-cost-${p.id}`}
                              value={editCost}
                              onChange={(e) => setEditCost(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`edit-low-${p.id}`}>
                              Alerta de estoque baixo
                            </Label>
                            <Input
                              id={`edit-low-${p.id}`}
                              value={editThreshold}
                              onChange={(e) => setEditThreshold(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => void saveEdit(p.id)}
                          >
                            Salvar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {p.name}
                              {!p.active ? (
                                <span className="ml-2 text-xs font-normal text-red-700">
                                  inativo
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">
                              <span className="font-semibold tabular-nums text-foreground">
                                {money(p.priceCents)}
                              </span>
                              {p.category ? ` · ${p.category}` : ""}
                              {p.sku ? ` · ${p.sku}` : ""}
                            </p>
                            <p className="mt-1">
                              <StockBadge
                                quantity={p.quantityOnHand}
                                threshold={p.lowStockThreshold}
                              />
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setMovingId(p.id);
                                setEditingId(null);
                                setMoveType("in");
                                setMoveQty("");
                                setMoveReason("");
                              }}
                            >
                              Movimentar
                            </Button>
                            {isAdmin ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => startEdit(p)}
                                >
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => void toggleActive(p)}
                                >
                                  {p.active ? "Desativar" : "Ativar"}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {movingId === p.id ? (
                          <form
                            className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void applyMove(p.id);
                            }}
                          >
                            <div className="space-y-1.5">
                              <Label htmlFor={`move-type-${p.id}`}>Tipo</Label>
                              <Select
                                id={`move-type-${p.id}`}
                                value={moveType}
                                onChange={(e) =>
                                  setMoveType(e.target.value as StockType)
                                }
                              >
                                <option value="in">Entrada</option>
                                <option value="out">Saída (perda/uso)</option>
                                {isAdmin ? (
                                  <option value="adjust">
                                    Ajuste (estoque final)
                                  </option>
                                ) : null}
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`move-qty-${p.id}`}>
                                {moveType === "adjust"
                                  ? "Estoque após o ajuste"
                                  : "Quantidade"}
                              </Label>
                              <Input
                                id={`move-qty-${p.id}`}
                                inputMode="numeric"
                                value={moveQty}
                                onChange={(e) => setMoveQty(e.target.value)}
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`move-reason-${p.id}`}>
                                Motivo (opcional)
                              </Label>
                              <Input
                                id={`move-reason-${p.id}`}
                                placeholder="Compra, validade, contagem…"
                                value={moveReason}
                                onChange={(e) => setMoveReason(e.target.value)}
                              />
                            </div>
                            <div className="flex flex-wrap gap-2 sm:col-span-3">
                              <Button type="submit" size="sm" disabled={busy}>
                                Confirmar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setMovingId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "vender" ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section>
            <h2 className="text-lg font-medium">Itens à venda</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Toque para adicionar ao carrinho. Só produtos ativos aparecem aqui.
            </p>
            {sellable.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={Package}
                title="Nada para vender"
                description="Cadastre produtos ativos com estoque para registrar a venda no balcão."
              />
            ) : (
              <ul className="mt-4 space-y-2">
                {sellable.map((p) => {
                  const inCart = cart[p.id] ?? 0;
                  const disabled = p.quantityOnHand <= 0 || inCart >= p.quantityOnHand;
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-muted-foreground">
                          {money(p.priceCents)} · {p.quantityOnHand} em estoque
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || disabled}
                        onClick={() => addToCart(p)}
                      >
                        {p.quantityOnHand <= 0 ? "Sem estoque" : "Adicionar"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="text-lg font-medium">Carrinho</h2>
              {cartRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum item ainda.
                </p>
              ) : (
                <ul className="space-y-3">
                  {cartRows.map((row) => (
                    <li key={row.product.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{row.product.name}</p>
                          <p className="text-muted-foreground">
                            {money(row.product.priceCents)} × {row.quantity}
                          </p>
                        </div>
                        <p className="tabular-nums font-medium">
                          {money(row.total)}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setCartQty(
                              row.product.id,
                              row.quantity - 1,
                              row.product.quantityOnHand,
                            )
                          }
                        >
                          −
                        </Button>
                        <span className="tabular-nums">{row.quantity}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            busy || row.quantity >= row.product.quantityOnHand
                          }
                          onClick={() =>
                            setCartQty(
                              row.product.id,
                              row.quantity + 1,
                              row.product.quantityOnHand,
                            )
                          }
                        >
                          +
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="sale-pay">Pagamento</Label>
                <Select
                  id="sale-pay"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as ManualPaymentMethod)
                  }
                >
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {MANUAL_PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sale-student">Aluno (opcional)</Label>
                {studentName ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span>{studentName}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setStudentId(null);
                        setStudentName(null);
                        setStudentQ("");
                      }}
                    >
                      Limpar
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      id="sale-student"
                      placeholder="Buscar aluno por nome ou CPF"
                      value={studentQ}
                      onChange={(e) => setStudentQ(e.target.value)}
                    />
                    {studentHits.length > 0 ? (
                      <ul className="overflow-hidden rounded-md border border-border">
                        {studentHits.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setStudentId(s.id);
                                setStudentName(s.fullName);
                                setStudentQ("");
                                setStudentHits([]);
                              }}
                            >
                              {s.fullName}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>

              <p className="text-lg font-semibold tabular-nums">
                Total {money(cartTotal)}
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={busy || cartRows.length === 0}
                onClick={() => void checkout()}
              >
                Confirmar venda
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "historico" ? (
        <div className="space-y-10">
          <section>
            <h2 className="text-lg font-medium">Vendas recentes</h2>
            {salesQ.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
            ) : sales.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma venda registrada ainda.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {sales.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border bg-card p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium tabular-nums">
                          {money(s.totalCents)}
                        </p>
                        <p className="text-muted-foreground">
                          {manualPaymentLabel(s.paymentMethod)}
                          {s.studentName ? ` · ${s.studentName}` : " · avulso"}
                          {" · "}
                          {formatWhen(s.createdAt)}
                        </p>
                      </div>
                    </div>
                    <ul className="mt-2 text-muted-foreground">
                      {s.items.map((item, idx) => (
                        <li key={`${s.id}-${idx}`}>
                          {item.quantity}× {item.productName} (
                          {money(item.totalCents)})
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium">Movimentações de estoque</h2>
            {movementsQ.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
            ) : movements.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhuma movimentação ainda.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm">
                {movements.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">
                        {stockMovementLabel(m.type)} · {m.productName}
                      </p>
                      <p className="text-muted-foreground">
                        {m.quantity} un. → saldo {m.resultingQuantity}
                        {m.reason ? ` · ${m.reason}` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(m.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "red";
}) {
  const valueClass =
    accent === "red"
      ? "text-red-700"
      : accent === "amber"
        ? "text-amber-700"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function StockBadge({
  quantity,
  threshold,
}: {
  quantity: number;
  threshold: number;
}) {
  const status = stockStatus(quantity, threshold);
  const cls =
    status === "out"
      ? "bg-red-100 text-red-800 border-red-200"
      : status === "low"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-emerald-100 text-emerald-800 border-emerald-200";
  const label =
    status === "out"
      ? "Sem estoque"
      : status === "low"
        ? "Estoque baixo"
        : "Em estoque";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {label} · {quantity} un.
    </span>
  );
}
