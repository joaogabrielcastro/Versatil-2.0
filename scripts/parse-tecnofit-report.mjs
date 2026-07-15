// Parser do relatório Tecnofit (HTML exportado como .xls).
// Uso: node scripts/parse-tecnofit-report.mjs "<caminho-do-arquivo>" [--json saida.json]
import fs from "node:fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Informe o caminho do arquivo. Ex.: node scripts/parse-tecnofit-report.mjs \"relatorio.xls\"");
  process.exit(1);
}

const jsonFlagIdx = process.argv.indexOf("--json");
const jsonOut = jsonFlagIdx >= 0 ? process.argv[jsonFlagIdx + 1] : null;

const html = fs.readFileSync(filePath, "latin1");

// Extrai texto de uma célula (remove tags e normaliza espaços).
function cellText(td) {
  return td
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&aacute;/gi, "á")
    .replace(/\s+/g, " ")
    .trim();
}

// Detecta status pelo label (success = ativo, etc.)
function statusFromCell(td) {
  const t = cellText(td).toLowerCase();
  if (t.includes("inativo")) return "inactive";
  if (t.includes("ativo")) return "active";
  return "unknown";
}

// Captura o link do cliente (contém nome) — para pegar o nome mesmo com acento.
function extractRows(html) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRegex.exec(html)) !== null) {
    const inner = m[1];
    const tds = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1]);
    if (tds.length < 9) continue; // linhas de dados têm muitas colunas
    rows.push(tds);
  }
  return rows;
}

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

// "139,00" / "1.139,00" -> centavos
function valorToCents(s) {
  const clean = (s || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number.parseFloat(clean);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// "dd/mm/yyyy" -> "yyyy-mm-dd" (ISO date, sem timezone)
function brDateToIso(s) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || "");
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Telefone BR: mantém só os primeiros 11 dígitos (alguns vêm concatenados).
function normalizePhone(digits) {
  if (!digits) return null;
  const d = digits.slice(0, 11);
  return d.length >= 10 ? d : null;
}

const rawRows = extractRows(html);

const students = [];
const seenCpf = new Set();
let skippedNoCpf = 0;
let skippedDup = 0;
let academySelf = 0;

for (const tds of rawRows) {
  // Colunas (índice):
  // 0 Código, 1 Cliente, 2 Status Cliente, 3 E-mail válido, 4 Contrato,
  // 5 Status Contrato, 6 Valor, 7 Início, 8 Vencimento, 9 E-mail, 10 CPF,
  // 11 Contato, 12 Endereço, 13 Número, 14 Complemento, 15 Bairro, 16 Cidade, 17 CEP/UF...
  const codigo = cellText(tds[0]);
  const nome = cellText(tds[1]);
  const statusCliente = statusFromCell(tds[2]);
  const contrato = cellText(tds[4]);
  const statusContrato = cellText(tds[5]).toLowerCase();
  const valor = cellText(tds[6]);
  const inicio = cellText(tds[7]);
  const vencimento = cellText(tds[8]);
  const email = cellText(tds[9] ?? "");
  const cpf = onlyDigits(cellText(tds[10] ?? ""));
  const contato = onlyDigits(cellText(tds[11] ?? ""));

  if (!nome) continue;
  // Pula a própria academia (primeira linha, sem CPF, nome com prefixo AACADEMIA)
  if (/academia\s+vers/i.test(nome) && !cpf) {
    academySelf++;
    continue;
  }
  if (!cpf || cpf.length !== 11) {
    skippedNoCpf++;
    continue;
  }
  if (seenCpf.has(cpf)) {
    skippedDup++;
    continue;
  }
  seenCpf.add(cpf);

  students.push({
    codigo,
    fullName: nome,
    statusCliente,
    contrato,
    statusContrato,
    valorCents: valorToCents(valor),
    startsAt: brDateToIso(inicio),
    dueAt: brDateToIso(vencimento),
    email: email && email.includes("@") ? email.toLowerCase() : null,
    cpf,
    whatsapp: normalizePhone(contato),
  });
}

const contractTypes = {};
const clientStatus = {};
const today = new Date().toISOString().slice(0, 10);
let willBeActive = 0;
let willBeDelinquent = 0;
for (const s of students) {
  contractTypes[s.contrato] = (contractTypes[s.contrato] ?? 0) + 1;
  clientStatus[s.statusCliente] = (clientStatus[s.statusCliente] ?? 0) + 1;
  if (s.dueAt && s.dueAt >= today) willBeActive++;
  else willBeDelinquent++;
}

console.log("=== Resumo do relatório Tecnofit ===");
console.log("Linhas de dados encontradas:", rawRows.length);
console.log("Alunos únicos (CPF válido):", students.length);
console.log("Pulados (própria academia):", academySelf);
console.log("Pulados (sem CPF válido):", skippedNoCpf);
console.log("Pulados (CPF duplicado):", skippedDup);
console.log("\nStatus do cliente:", clientStatus);
console.log("\nTipos de contrato:", contractTypes);
console.log("\nCom e-mail:", students.filter((s) => s.email).length);
console.log("Com WhatsApp/contato:", students.filter((s) => s.whatsapp).length);
console.log(`\nProjeção de status (venc. vs hoje ${today}):`);
console.log("  Ativos (venc. futuro):", willBeActive);
console.log("  Inadimplentes (venc. passado):", willBeDelinquent);
console.log("\nPrimeiros 5 alunos:");
for (const s of students.slice(0, 5)) {
  const valorFmt = s.valorCents != null ? (s.valorCents / 100).toFixed(2) : "?";
  console.log(`  - ${s.fullName} | CPF ${s.cpf} | R$ ${valorFmt} | venc ${s.dueAt} | ${s.email ?? "sem email"} | ${s.whatsapp ?? "sem tel"}`);
}

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(students, null, 2), "utf8");
  console.log(`\nJSON salvo em: ${jsonOut} (${students.length} alunos)`);
}
