import { storage } from "./storage";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Wallet, CreditCard,
  PiggyBank, AlertTriangle, FileText, FileDown, ChevronLeft, ChevronRight,
  Palette, Check, X, Tag, ChevronDown, ChevronUp, FileSpreadsheet, Calendar, Bell
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import * as XLSX from "xlsx";

/* ---------------------------------------------------------------
   TOKENS
----------------------------------------------------------------*/
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const DEFAULT_CATEGORIES = ["Aluguel","Assinaturas","Beleza","Contas","Desenvolvimento","Despesas Eventuais","Despesas Veícular","Dívidas","Eletrônicos","Higiene Pessoal","Ifood/Restaurantes","Investimento","Lazer","Mercado","Presentes","Roupas","Saúde","Uber/Transporte","Outros"];

const PAYMENTS = ["Pix","Dinheiro","Débito","Crédito 1","Crédito 2","Crédito 3"];
const DEFAULT_PAYMENT_METHODS = [
  { name: "Pix", isCard: false, closingDay: "", dueDay: "" },
  { name: "Dinheiro", isCard: false, closingDay: "", dueDay: "" },
  { name: "Débito", isCard: false, closingDay: "", dueDay: "" },
  { name: "Crédito 1", isCard: true, closingDay: "", dueDay: "" },
  { name: "Crédito 2", isCard: true, closingDay: "", dueDay: "" },
  { name: "Crédito 3", isCard: true, closingDay: "", dueDay: "" },
];

function normalizePaymentMethods(pm) {
  if (!Array.isArray(pm) || pm.length === 0) return DEFAULT_PAYMENT_METHODS;
  return pm.map((p) => (typeof p === "string"
    ? { name: p, isCard: /cr[eé]dito/i.test(p), closingDay: "", dueDay: "" }
    : { name: p.name, isCard: p.isCard ?? /cr[eé]dito/i.test(p.name || ""), closingDay: p.closingDay ?? "", dueDay: p.dueDay ?? "" }
  ));
}

const REAL_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 8 }, (_, i) => REAL_YEAR - 3 + i);

const THEMES = {
  rosa: { label:"Rosa", swatch:"#EFB8C8", checkColor:"#4A3841",
    bg:"#FDF4F7", bgAlt:"#FBE8EE", card:"#FFFFFF", border:"#F3DCE6",
    text:"#4A3841", muted:"#9C8189", accent:"#EFB8C8", accentSoft:"#FBE4EC",
    accent2:"#C97B95", positive:"#7FAE8C", negative:"#D98F82", shadow:"rgba(201,123,149,0.14)" },
  lilas: { label:"Lilás", swatch:"#C9B7E4", checkColor:"#3E3650",
    bg:"#F8F5FC", bgAlt:"#EFE7F8", card:"#FFFFFF", border:"#E4DBF0",
    text:"#3E3650", muted:"#8C82A0", accent:"#C9B7E4", accentSoft:"#EEE7F8",
    accent2:"#8E76B8", positive:"#7FAE8C", negative:"#D98F82", shadow:"rgba(142,118,184,0.14)" },
  creme: { label:"Creme", swatch:"#E3C99A", checkColor:"#4A4030",
    bg:"#FBF7EF", bgAlt:"#F4EBDA", card:"#FFFFFF", border:"#EDE2CC",
    text:"#4A4030", muted:"#9C8F73", accent:"#E3C99A", accentSoft:"#F4E9D4",
    accent2:"#B8935A", positive:"#7FAE8C", negative:"#D98F82", shadow:"rgba(184,147,90,0.14)" },
  preto: { label:"Preto", swatch:"#1F1E1E", checkColor:"#FFFFFF",
    bg:"#F7F7F6", bgAlt:"#EDEDEB", card:"#FFFFFF", border:"#E2E1DE",
    text:"#232323", muted:"#7A7873", accent:"#3A3936", accentSoft:"#E9E8E6",
    accent2:"#121212", positive:"#3F7A56", negative:"#B4443A", shadow:"rgba(0,0,0,0.12)" },
  marinho: { label:"Marinho", swatch:"#22335C", checkColor:"#FFFFFF",
    bg:"#F5F7FA", bgAlt:"#E9EDF3", card:"#FFFFFF", border:"#DCE3EC",
    text:"#1B2436", muted:"#6B7688", accent:"#2E4272", accentSoft:"#E4E8F2",
    accent2:"#16223D", positive:"#3F7A56", negative:"#B4443A", shadow:"rgba(34,51,92,0.14)" },
};

const FONTS_LINK = "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Inter:wght@400;500;600;700&display=swap');";

const emptyMonth = () => ({
  entradas: [], fixas: [], variaveis: [], parceladas: [], investimentos: [], dividas: [],
});

const uid = () => Math.random().toString(36).slice(2, 10);
const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n) => Number(n) || 0;

function parseParcela(str) {
  if (!str) return null;
  const m = String(str).match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (!n || !total || n < 1 || total < 1) return null;
  return { n, total };
}

function syncParceladaChain(yearData, monthIndex, rowId, row) {
  const parsed = parseParcela(row.parcela);
  if (!parsed || parsed.total <= 1) return yearData;
  const linkId = row.linkId || uid();
  const { total } = parsed;
  const startMonth = monthIndex - (parsed.n - 1);
  const newYearData = { ...yearData };

  for (let k = 0; k < total; k++) {
    const idx = startMonth + k;
    if (idx < 0 || idx > 11) continue;
    const label = `${k + 1}/${total}`;
    const monthData = { ...(newYearData[idx] || emptyMonth()) };
    let list = [...monthData.parceladas];
    if (idx === monthIndex) {
      const pos = list.findIndex((r) => r.id === rowId);
      if (pos >= 0) list[pos] = { ...list[pos], ...row, linkId, parcela: label };
    } else {
      const pos = list.findIndex((r) => r.linkId === linkId);
      if (pos >= 0) {
        list[pos] = { ...list[pos], despesa: row.despesa, valor: row.valor, categoria: row.categoria, pagamento: row.pagamento, parcela: label, linkId };
      } else {
        list.push({ id: uid(), linkId, despesa: row.despesa, data: "", valor: row.valor, pagamento: row.pagamento, categoria: row.categoria, pago: "NÃO", parcela: label });
      }
    }
    monthData.parceladas = list;
    newYearData[idx] = monthData;
  }

  for (let idx = 0; idx < 12; idx++) {
    if (idx >= startMonth && idx < startMonth + total) continue;
    const monthData = newYearData[idx];
    if (!monthData) continue;
    const filtered = monthData.parceladas.filter((r) => r.linkId !== linkId);
    if (filtered.length !== monthData.parceladas.length) {
      newYearData[idx] = { ...monthData, parceladas: filtered };
    }
  }
  return newYearData;
}

function syncFixaRecurrence(yearData, monthIndex, rowId, row) {
  const newYearData = { ...yearData };
  if (row.recorrente === "SIM") {
    const linkId = row.linkId || uid();
    for (let idx = monthIndex; idx <= 11; idx++) {
      const monthData = { ...(newYearData[idx] || emptyMonth()) };
      let list = [...monthData.fixas];
      if (idx === monthIndex) {
        const pos = list.findIndex((r) => r.id === rowId);
        if (pos >= 0) list[pos] = { ...list[pos], ...row, linkId };
      } else {
        const pos = list.findIndex((r) => r.linkId === linkId);
        if (pos >= 0) {
          list[pos] = { ...list[pos], despesa: row.despesa, valor: row.valor, categoria: row.categoria, pagamento: row.pagamento, recorrente: "SIM", linkId };
        } else {
          list.push({ id: uid(), linkId, despesa: row.despesa, data: "", valor: row.valor, pagamento: row.pagamento, categoria: row.categoria, pago: "NÃO", recorrente: "SIM" });
        }
      }
      monthData.fixas = list;
      newYearData[idx] = monthData;
    }
  } else if (row.linkId) {
    for (let idx = 0; idx < 12; idx++) {
      if (idx === monthIndex || !newYearData[idx]) continue;
      newYearData[idx] = { ...newYearData[idx], fixas: newYearData[idx].fixas.filter((r) => r.linkId !== row.linkId) };
    }
    const monthData = { ...newYearData[monthIndex] };
    monthData.fixas = monthData.fixas.map((r) => (r.id === rowId ? { ...r, linkId: undefined } : r));
    newYearData[monthIndex] = monthData;
  }
  return newYearData;
}

/* Dívida não paga: joga automaticamente uma cópia para o mês seguinte.
   Se marcada como paga, remove a cópia que havia sido lançada no próximo mês. */
function syncDividaRollover(yearData, monthIndex, rowId, row) {
  const newYearData = { ...yearData };
  const nextIdx = monthIndex + 1;
  if (row.pago !== "SIM") {
    if (nextIdx > 11) return newYearData;
    const linkId = row.linkId || uid();
    const md = { ...(newYearData[monthIndex] || emptyMonth()) };
    md.dividas = md.dividas.map((r) => (r.id === rowId ? { ...r, ...row, linkId } : r));
    newYearData[monthIndex] = md;

    const nextMd = { ...(newYearData[nextIdx] || emptyMonth()) };
    let list = [...nextMd.dividas];
    const pos = list.findIndex((r) => r.linkId === linkId);
    if (pos >= 0) {
      list[pos] = { ...list[pos], nome: row.nome, valor: row.valor, linkId };
    } else {
      list.push({ id: uid(), linkId, nome: row.nome, valor: row.valor, pago: "NÃO" });
    }
    nextMd.dividas = list;
    newYearData[nextIdx] = nextMd;
  } else if (row.linkId) {
    if (nextIdx <= 11 && newYearData[nextIdx]) {
      newYearData[nextIdx] = { ...newYearData[nextIdx], dividas: newYearData[nextIdx].dividas.filter((r) => r.linkId !== row.linkId) };
    }
    const md = { ...newYearData[monthIndex] };
    md.dividas = md.dividas.map((r) => (r.id === rowId ? { ...r, linkId: undefined } : r));
    newYearData[monthIndex] = md;
  }
  return newYearData;
}

async function loadJSON(key, fallback) {
  try {
    const res = await storage.get(key);
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveJSON(key, value) {
  try { await storage.set(key, JSON.stringify(value)); } catch {}
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportMonthCSV(monthName, year, month) {
  const lines = [];
  lines.push(["Seção", "Descrição", "Data/Parcela", "Valor", "Pagamento", "Categoria", "Pago?"].map(csvEscape).join(";"));
  const pushRows = (label, rows, mapRow) => rows.forEach((r) => lines.push([label, ...mapRow(r)].map(csvEscape).join(";")));
  pushRows("Entrada", month.entradas, (r) => [r.fonte, "", r.valor, "", "", ""]);
  pushRows("Fixa", month.fixas, (r) => [r.despesa, r.data, r.valor, r.pagamento, r.categoria, r.pago]);
  pushRows("Variável", month.variaveis, (r) => [r.despesa, r.data, r.valor, r.pagamento, r.categoria, r.pago]);
  pushRows("Parcelada", month.parceladas, (r) => [r.despesa, r.parcela, r.valor, r.pagamento, r.categoria, r.pago]);
  pushRows("Investimento", month.investimentos, (r) => [r.nome, r.data, r.valor, "", "", ""]);
  pushRows("Dívida", month.dividas, (r) => [r.nome, "", r.valor, "", "", ""]);
  const csv = "\uFEFF" + lines.join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `financeiro-${monthName.toLowerCase()}-${year}.csv`);
}

function exportMonthXLSX(monthName, year, month) {
  const wb = XLSX.utils.book_new();
  const addSheet = (name, headers, rows, mapRow) => {
    const aoa = [headers, ...rows.map(mapRow)];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addSheet("Entradas", ["Fonte", "Valor"], month.entradas, (r) => [r.fonte, num(r.valor)]);
  addSheet("Fixas", ["Despesa", "Data", "Valor", "Pagamento", "Categoria", "Pago?"], month.fixas, (r) => [r.despesa, r.data, num(r.valor), r.pagamento, r.categoria, r.pago]);
  addSheet("Variáveis", ["Despesa", "Data", "Valor", "Pagamento", "Categoria", "Pago?"], month.variaveis, (r) => [r.despesa, r.data, num(r.valor), r.pagamento, r.categoria, r.pago]);
  addSheet("Parceladas", ["Despesa", "Parcela", "Valor", "Pagamento", "Categoria", "Pago?"], month.parceladas, (r) => [r.despesa, r.parcela, num(r.valor), r.pagamento, r.categoria, r.pago]);
  addSheet("Investimentos", ["Nome", "Data", "Valor"], month.investimentos, (r) => [r.nome, r.data, num(r.valor)]);
  addSheet("Dívidas", ["Nome", "Valor"], month.dividas, (r) => [r.nome, num(r.valor)]);
  XLSX.writeFile(wb, `financeiro-${monthName.toLowerCase()}-${year}.xlsx`);
}

/* Gera um relatório em HTML autocontido (sem depender de recursos externos),
   já colorido com o tema ativo. O usuário pode abrir no navegador e, se quiser
   um PDF, usar Imprimir > Salvar como PDF direto do navegador dele. */
function exportReportHTML(periodLabel, filenameBase, theme, s, categoryBudgets) {
  const catEntries = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  const payEntries = Object.entries(s.byPayment).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catEntries.map((e) => e[1]));

  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const statCard = (label, value, color) => `
    <div style="background:${theme.card};border:1px solid ${theme.border};border-radius:16px;padding:14px 16px;flex:1 1 140px;min-width:140px;">
      <div style="color:${theme.muted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">${label}</div>
      <div style="font-weight:700;font-size:22px;color:${color};margin-top:4px;">${esc(brl(value))}</div>
    </div>`;

  const categoryRows = catEntries.map(([cat, val]) => {
    const budget = num(categoryBudgets?.[cat]);
    const over = budget > 0 && val > budget;
    const pct = Math.min(100, (val / (budget > 0 ? budget : maxCat)) * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:130px;font-size:12px;color:${theme.text};flex-shrink:0;">${esc(cat)}</div>
        <div style="flex:1;height:8px;background:${theme.bgAlt};border-radius:6px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${over ? theme.negative : theme.accent};"></div>
        </div>
        <div style="width:120px;text-align:right;font-size:12px;color:${over ? theme.negative : theme.muted};font-weight:${over ? 700 : 400};">
          ${esc(brl(val))}${budget > 0 ? " / " + esc(brl(budget)) : ""}
        </div>
      </div>`;
  }).join("") || `<div style="color:${theme.muted};font-size:13px;">Sem gastos categorizados neste mês.</div>`;

  const paymentChips = payEntries.map(([p, v]) => `
    <div style="background:${theme.bgAlt};border-radius:10px;padding:8px 12px;">
      <div style="font-size:11px;color:${theme.muted};font-weight:600;">${esc(p)}</div>
      <div style="font-size:14px;font-weight:700;color:${theme.text};">${esc(brl(v))}</div>
    </div>`).join("") || `<div style="color:${theme.muted};font-size:13px;">Sem lançamentos.</div>`;

  const pendentesRows = s.pendentes.map((r) => {
    const d = daysUntil(r.data);
    let badge = "";
    if (d !== null) {
      if (d < 0) badge = ` <span style="color:${theme.negative};font-weight:700;">⚠ atrasada há ${Math.abs(d)}d</span>`;
      else if (d <= 5) badge = ` <span style="color:${theme.negative};font-weight:700;">⚠ ${d === 0 ? "vence hoje" : `vence em ${d}d`}</span>`;
    }
    return `
      <div style="display:flex;justify-content:space-between;font-size:13px;color:${theme.text};padding:4px 0;border-bottom:1px dashed ${theme.border};">
        <span>${esc(r.despesa || "—")} <span style="color:${theme.muted};">· ${esc(r.categoria || "sem categoria")}</span>${badge}</span>
        <span style="font-weight:700;">${esc(brl(r.valor))}</span>
      </div>`;
  }).join("") || `<div style="color:${theme.positive};font-size:13px;">Nenhuma despesa pendente. Tudo pago! 🎉</div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório · ${esc(periodLabel)}</title>
<style>
  body { margin:0; padding:32px 18px; background:${theme.bg}; font-family: Arial, Helvetica, sans-serif; }
  .card { max-width:640px; margin:0 auto; background:${theme.card}; border:1px solid ${theme.border}; border-radius:18px; padding:28px; }
  .eyebrow { font-weight:700; letter-spacing:.1em; text-transform:uppercase; font-size:12px; color:${theme.accent2}; margin-bottom:6px; }
  h2 { font-weight:800; font-size:26px; color:${theme.text}; margin:0 0 4px; }
  h3 { font-weight:700; letter-spacing:.1em; text-transform:uppercase; font-size:12px; color:${theme.accent2}; margin:24px 0 10px; }
  .print-btn { display:inline-flex; align-items:center; gap:6px; background:${theme.accent2}; color:#fff; border:none; border-radius:999px; padding:10px 18px; font-weight:700; font-size:13px; cursor:pointer; margin-bottom:18px; font-family: Arial, Helvetica, sans-serif; }
  @media print { .no-print { display:none !important; } body { background:#fff; } .card { border:none; } }
</style></head>
<body>
  <div style="max-width:640px;margin:0 auto 10px;" class="no-print">
    <button class="print-btn" onclick="window.print()">🖨️ Salvar como PDF / Imprimir</button>
  </div>
  <div class="card">
    <div class="eyebrow">Relatório financeiro mensal</div>
    <h2>${esc(periodLabel)}</h2>
    <div style="font-size:13px;color:${theme.muted};margin-bottom:18px;">
      Saldo final do mês: <strong style="color:${s.saldo >= 0 ? theme.positive : theme.negative};">${esc(brl(s.saldo))}</strong>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;">
      ${statCard("Entradas", s.totalEntradas, theme.positive)}
      ${statCard("Gastos totais", s.totalGastos, theme.negative)}
      ${statCard("Investido", s.totalInvestimentos, theme.text)}
      ${statCard("Dívidas em aberto", s.totalDividas, theme.negative)}
    </div>
    <h3>Gastos por categoria</h3>
    ${categoryRows}
    <h3>Gastos por forma de pagamento</h3>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">${paymentChips}</div>
    <h3>Pendências (${s.pendentes.length})</h3>
    ${pendentesRows}
    <div style="margin-top:28px;font-size:11px;color:${theme.muted};">
      Gerado pelo seu app de Organização Financeira.
    </div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 350);
    });
  </script>
</body></html>`;

  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8;" }), `${filenameBase}.html`);
}

function computeAnnualMatrix(yearData, categories) {
  const perMonth = MONTHS.map((_, i) => computeSummary(yearData[i] || emptyMonth()));
  const matrix = categories.map((cat) => {
    const values = MONTHS.map((_, i) => {
      const m = yearData[i] || emptyMonth();
      return [...m.fixas, ...m.variaveis, ...m.parceladas]
        .filter((r) => r.categoria === cat)
        .reduce((s, r) => s + num(r.valor), 0);
    });
    return { cat, values, total: values.reduce((s, v) => s + v, 0) };
  });
  const totalGastosRow = perMonth.map((s) => s.totalGastos);
  const totalEntradasRow = perMonth.map((s) => s.totalEntradas);
  const totalSaldoRow = perMonth.map((s) => s.saldo);
  const totalDividasRow = perMonth.map((s) => s.totalDividas);
  return { matrix, totalGastosRow, totalEntradasRow, totalSaldoRow, totalDividasRow };
}

function exportYearCSV(year, yearData, categories) {
  const { matrix, totalGastosRow, totalEntradasRow, totalSaldoRow } = computeAnnualMatrix(yearData, categories);
  const lines = [];
  lines.push(["Categoria", ...MONTHS, "Total"].map(csvEscape).join(";"));
  matrix.forEach((row) => lines.push([row.cat, ...row.values, row.total].map(csvEscape).join(";")));
  lines.push(["TOTAL GASTOS", ...totalGastosRow, totalGastosRow.reduce((s, v) => s + v, 0)].map(csvEscape).join(";"));
  lines.push(["ENTRADAS", ...totalEntradasRow, totalEntradasRow.reduce((s, v) => s + v, 0)].map(csvEscape).join(";"));
  lines.push(["SALDO", ...totalSaldoRow, totalSaldoRow.reduce((s, v) => s + v, 0)].map(csvEscape).join(";"));
  const csv = "\uFEFF" + lines.join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `financeiro-anual-${year}.csv`);
}

function exportYearXLSX(year, yearData, categories) {
  const { matrix, totalGastosRow, totalEntradasRow, totalSaldoRow } = computeAnnualMatrix(yearData, categories);
  const wb = XLSX.utils.book_new();
  const aoa = [["Categoria", ...MONTHS, "Total"]];
  matrix.forEach((row) => aoa.push([row.cat, ...row.values, row.total]));
  aoa.push(["TOTAL GASTOS", ...totalGastosRow, totalGastosRow.reduce((s, v) => s + v, 0)]);
  aoa.push(["ENTRADAS", ...totalEntradasRow, totalEntradasRow.reduce((s, v) => s + v, 0)]);
  aoa.push(["SALDO", ...totalSaldoRow, totalSaldoRow.reduce((s, v) => s + v, 0)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 20 }, ...MONTHS.map(() => ({ wch: 12 })), { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Visão Anual");

  MONTHS.forEach((mName, i) => {
    const m = yearData[i] || emptyMonth();
    const rows = [
      ...m.entradas.map((r) => ["Entrada", r.fonte, "", num(r.valor), "", "", ""]),
      ...m.fixas.map((r) => ["Fixa", r.despesa, r.data, num(r.valor), r.pagamento, r.categoria, r.pago]),
      ...m.variaveis.map((r) => ["Variável", r.despesa, r.data, num(r.valor), r.pagamento, r.categoria, r.pago]),
      ...m.parceladas.map((r) => ["Parcelada", r.despesa, r.parcela, num(r.valor), r.pagamento, r.categoria, r.pago]),
      ...m.investimentos.map((r) => ["Investimento", r.nome, r.data, num(r.valor), "", "", ""]),
      ...m.dividas.map((r) => ["Dívida", r.nome, "", num(r.valor), "", "", ""]),
    ];
    if (rows.length === 0) return;
    const monthAoa = [["Seção", "Descrição", "Data/Parcela", "Valor", "Pagamento", "Categoria", "Pago?"], ...rows];
    const monthWs = XLSX.utils.aoa_to_sheet(monthAoa);
    monthWs["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, monthWs, mName.slice(0, 10));
  });

  XLSX.writeFile(wb, `financeiro-anual-${year}.xlsx`);
}

function exportYearHTML(year, theme, yearData, categories) {
  const { matrix, totalGastosRow, totalEntradasRow, totalSaldoRow, totalDividasRow } = computeAnnualMatrix(yearData, categories);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);

  const statCard = (label, value, color) => `
    <div style="background:${theme.card};border:1px solid ${theme.border};border-radius:16px;padding:14px 16px;flex:1 1 140px;min-width:140px;">
      <div style="color:${theme.muted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">${label}</div>
      <div style="font-weight:700;font-size:20px;color:${color};margin-top:4px;">${esc(brl(value))}</div>
    </div>`;

  const cell = (v, bold, color) => `<td style="padding:5px 7px;font-size:11px;text-align:right;white-space:nowrap;${bold ? "font-weight:700;" : ""}${color ? `color:${color};` : ""}">${v}</td>`;
  const th = (v) => `<th style="padding:5px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.03em;color:${theme.muted};text-align:right;">${v}</th>`;

  const headerRow = `<tr><th style="padding:5px 7px;font-size:9px;text-align:left;color:${theme.muted};">Categoria</th>${MONTHS.map((m) => th(m.slice(0, 3))).join("")}${th("Total")}</tr>`;
  const bodyRows = matrix.map((row) => `<tr style="border-top:1px solid ${theme.border};">
    <td style="padding:5px 7px;font-size:11px;font-weight:600;text-align:left;color:${theme.text};">${esc(row.cat)}</td>
    ${row.values.map((v) => cell(v > 0 ? esc(brl(v)) : "—", false, v > 0 ? theme.text : theme.border)).join("")}
    ${cell(esc(brl(row.total)), true, theme.accent2)}
  </tr>`).join("");

  const totalsRows = `
    <tr style="border-top:2px solid ${theme.border};">
      <td style="padding:5px 7px;font-size:11px;font-weight:800;text-align:left;">TOTAL GASTOS</td>
      ${totalGastosRow.map((v) => cell(esc(brl(v)), true, theme.negative)).join("")}
      ${cell(esc(brl(sum(totalGastosRow))), true, theme.negative)}
    </tr>
    <tr>
      <td style="padding:5px 7px;font-size:11px;font-weight:800;text-align:left;">ENTRADAS</td>
      ${totalEntradasRow.map((v) => cell(esc(brl(v)), true, theme.positive)).join("")}
      ${cell(esc(brl(sum(totalEntradasRow))), true, theme.positive)}
    </tr>
    <tr>
      <td style="padding:5px 7px;font-size:11px;font-weight:800;text-align:left;">SALDO</td>
      ${totalSaldoRow.map((v) => cell(esc(brl(v)), true, v >= 0 ? theme.positive : theme.negative)).join("")}
      ${cell(esc(brl(sum(totalSaldoRow))), true, theme.text)}
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Anual · ${year}</title>
<style>
  body { margin:0; padding:32px 18px; background:${theme.bg}; font-family: Arial, Helvetica, sans-serif; }
  .card { max-width:920px; margin:0 auto; background:${theme.card}; border:1px solid ${theme.border}; border-radius:18px; padding:28px; }
  .eyebrow { font-weight:700; letter-spacing:.1em; text-transform:uppercase; font-size:12px; color:${theme.accent2}; margin-bottom:6px; }
  h2 { font-weight:800; font-size:26px; color:${theme.text}; margin:0 0 16px; }
  .print-btn { display:inline-flex; align-items:center; gap:6px; background:${theme.accent2}; color:#fff; border:none; border-radius:999px; padding:10px 18px; font-weight:700; font-size:13px; cursor:pointer; margin-bottom:18px; font-family: Arial, Helvetica, sans-serif; }
  table { border-collapse:collapse; width:100%; }
  @media print { .no-print { display:none !important; } body { background:#fff; } .card { border:none; } table { font-size:9px; } }
</style></head>
<body>
  <div style="max-width:920px;margin:0 auto 10px;" class="no-print">
    <button class="print-btn" onclick="window.print()">🖨️ Salvar como PDF / Imprimir</button>
  </div>
  <div class="card">
    <div class="eyebrow">Relatório financeiro anual</div>
    <h2>Ano de ${year}</h2>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px;">
      ${statCard("Entradas (ano)", sum(totalEntradasRow), theme.positive)}
      ${statCard("Gastos (ano)", sum(totalGastosRow), theme.negative)}
      ${statCard("Saldo (ano)", sum(totalSaldoRow), theme.text)}
      ${statCard("Dívidas (fim do ano)", totalDividasRow[totalDividasRow.length - 1] || 0, theme.negative)}
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead>${headerRow}</thead>
        <tbody>${bodyRows}${totalsRows}</tbody>
      </table>
    </div>
    <div style="margin-top:24px;font-size:11px;color:${theme.muted};">
      Gerado pelo seu app de Organização Financeira.
    </div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 350);
    });
  </script>
</body></html>`;

  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8;" }), `financeiro-anual-${year}.html`);
}

function Eyebrow({ children, theme }) {
  return (
    <div style={{
      fontFamily: "'Manrope', sans-serif", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      fontSize: 12, color: theme.accent2, marginBottom: 4, display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ width: 18, height: 1, background: theme.accent2, display: "inline-block" }} />
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, theme, tone }) {
  const color = tone === "positive" ? theme.positive : tone === "negative" ? theme.negative : theme.text;
  return (
    <div style={{
      background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16,
      padding: "14px 16px", flex: "1 1 140px", minWidth: 140, boxShadow: `0 4px 14px ${theme.shadow}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: theme.muted, fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Icon size={14} /> {label}
      </div>
      <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 22, color, marginTop: 4 }}>
        {brl(value)}
      </div>
    </div>
  );
}

function SectionTable({ title, icon: Icon, theme, columns, rows, onAdd, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const total = rows.reduce((s, r) => s + num(r.valor), 0);
  const filteredRows = search.trim()
    ? rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(search.trim().toLowerCase())))
    : rows;
  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 18, boxShadow: `0 4px 14px ${theme.shadow}` }}>
      <button onClick={() => setExpanded((v) => !v)} style={{
        width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Manrope',sans-serif", fontWeight: 600, fontSize: 17, color: theme.text }}>
          <Icon size={17} color={theme.accent} /> {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, color: theme.text }}>{brl(total)}</span>
          {expanded ? <ChevronUp size={18} color={theme.muted} /> : <ChevronDown size={18} color={theme.muted} />}
        </div>
      </button>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={onAdd} style={{
              display: "flex", alignItems: "center", gap: 4, background: theme.accent2, color: "#fff",
              border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 13, fontFamily: "'Inter',sans-serif", fontWeight: 600, cursor: "pointer",
            }}>
              <Plus size={14} /> Adicionar
            </button>
          </div>

          {rows.length > 3 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: "100%", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "7px 10px",
                fontSize: 13, fontFamily: "'Inter',sans-serif", background: theme.bgAlt, color: theme.text, outline: "none", marginBottom: 10,
              }}
            />
          )}

          {rows.length === 0 ? (
            <div style={{ color: theme.muted, fontSize: 13, fontFamily: "'Inter',sans-serif", padding: "10px 0" }}>
              Nada lançado ainda. Toque em "Adicionar" para começar.
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{ color: theme.muted, fontSize: 13, fontFamily: "'Inter',sans-serif", padding: "10px 0" }}>
              Nenhum resultado para "{search}".
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredRows.map((row) => (
                <div key={row.id} style={{
                  display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(90px,1fr)) 28px`,
                  gap: 6, alignItems: "center", background: theme.bgAlt, borderRadius: 12, padding: "8px 8px",
                }}>
                  {columns.map((col) => (
                    <Field key={col.key} col={col} value={row[col.key]} theme={theme}
                      onChange={(v) => onUpdate(row.id, col.key, v)} />
                  ))}
                  <button onClick={() => onDelete(row.id)} style={{ background: "none", border: "none", cursor: "pointer", color: theme.negative, display:"flex", justifyContent:"center" }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ col, value, onChange, theme }) {
  const baseStyle = {
    width: "100%", border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 7px",
    fontSize: 13, fontFamily: "'Inter',sans-serif", background: theme.card, color: theme.text, outline: "none",
  };
  if (col.type === "select") {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={baseStyle}>
        <option value="">—</option>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.type === "pago") {
    const isSim = value === "SIM";
    return (
      <button onClick={() => onChange(isSim ? "NÃO" : "SIM")} title="Marcar como pago/não pago" style={{
        ...baseStyle, cursor: "pointer", fontWeight: 700, textAlign: "center", fontSize: 11,
        background: isSim ? "rgba(63,143,99,0.15)" : "rgba(193,85,74,0.15)",
        color: isSim ? theme.positive : theme.negative, border: "none",
      }}>
        {isSim ? "✓ Pago" : "✕ Não pago"}
      </button>
    );
  }
  if (col.type === "recorrente") {
    const isSim = value === "SIM";
    return (
      <button onClick={() => onChange(isSim ? "NÃO" : "SIM")} title="Repetir todo mês" style={{
        ...baseStyle, cursor: "pointer", fontWeight: 700, textAlign: "center", fontSize: 11,
        background: isSim ? theme.accentSoft : "transparent",
        color: isSim ? theme.accent2 : theme.muted, border: `1px solid ${theme.border}`,
      }}>
        {isSim ? "🔁 Repete" : "Único"}
      </button>
    );
  }
  return (
    <input
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
      value={value ?? ""}
      placeholder={col.label}
      onChange={(e) => onChange(e.target.value)}
      style={baseStyle}
    />
  );
}

function computeSummary(month) {
  const totalEntradas = month.entradas.reduce((s, r) => s + num(r.valor), 0);
  const totalFixas = month.fixas.reduce((s, r) => s + num(r.valor), 0);
  const totalVariaveis = month.variaveis.reduce((s, r) => s + num(r.valor), 0);
  const totalParceladas = month.parceladas.reduce((s, r) => s + num(r.valor), 0);
  const totalInvestimentos = month.investimentos.reduce((s, r) => s + num(r.valor), 0);
  const totalDividas = month.dividas.filter((r) => r.pago !== "SIM").reduce((s, r) => s + num(r.valor), 0);
  const totalDividasPagas = month.dividas.filter((r) => r.pago === "SIM").reduce((s, r) => s + num(r.valor), 0);
  const totalGastos = totalFixas + totalVariaveis + totalParceladas + totalDividasPagas;
  const saldo = totalEntradas - totalGastos - totalInvestimentos;

  const byCategory = {};
  const byPayment = {};
  [...month.fixas, ...month.variaveis, ...month.parceladas].forEach((r) => {
    if (r.categoria) byCategory[r.categoria] = (byCategory[r.categoria] || 0) + num(r.valor);
    if (r.pagamento) byPayment[r.pagamento] = (byPayment[r.pagamento] || 0) + num(r.valor);
  });
  if (totalDividasPagas > 0) byCategory["Dívidas pagas"] = (byCategory["Dívidas pagas"] || 0) + totalDividasPagas;
  const pendentes = [...month.fixas, ...month.variaveis, ...month.parceladas].filter((r) => r.pago === "NÃO");

  return { totalEntradas, totalFixas, totalVariaveis, totalParceladas, totalInvestimentos, totalDividas, totalDividasPagas, totalGastos, saldo, byCategory, byPayment, pendentes };
}

function ReportView({ periodLabel, monthName, year, month, theme, onClose, categoryBudgets }) {
  const s = useMemo(() => computeSummary(month), [month]);
  const catEntries = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  const payEntries = Object.entries(s.byPayment).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catEntries.map((e) => e[1]));
  const [showExportMenu, setShowExportMenu] = useState(false);

  const exportOptions = [
    {
      key: "html", label: "Relatório mensal", icon: FileDown,
      action: () => exportReportHTML(periodLabel, `relatorio-${monthName.toLowerCase()}-${year}`, theme, s, categoryBudgets),
      errorMsg: "Não foi possível gerar o relatório agora.",
    },
    {
      key: "xlsx", label: "Planilha Excel (.xlsx)", icon: FileSpreadsheet,
      action: () => exportMonthXLSX(monthName, year, month),
      errorMsg: "Não foi possível gerar o Excel agora.",
    },
    {
      key: "csv", label: "Arquivo CSV", icon: FileText,
      action: () => exportMonthCSV(monthName, year, month),
      errorMsg: "Não foi possível gerar o CSV agora.",
    },
  ];

  const runExport = (opt) => {
    setShowExportMenu(false);
    try { opt.action(); }
    catch (e) { console.error(e); alert(opt.errorMsg); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 20, color: theme.text }}>Relatório · {periodLabel}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowExportMenu((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: theme.accent2, color: "#fff", border: "none", borderRadius: 999, padding: "8px 14px", fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              <FileDown size={14} /> Relatório {showExportMenu ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showExportMenu && (
              <div style={{ position: "absolute", right: 0, top: 42, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 6, boxShadow: `0 8px 24px ${theme.shadow}`, zIndex: 10, width: 210 }}>
                {exportOptions.map((opt) => (
                  <button key={opt.key} onClick={() => runExport(opt)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                    background: "none", border: "none", borderRadius: 8, padding: "9px 10px", cursor: "pointer",
                    fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13, color: theme.text,
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgAlt)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                    <opt.icon size={14} color={theme.accent2} /> {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: theme.bgAlt, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "8px 14px", fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", display:"flex", alignItems:"center", gap:6 }}>
            <X size={14} /> Fechar
          </button>
        </div>
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 24, boxShadow: `0 4px 14px ${theme.shadow}` }}>
        <Eyebrow theme={theme}>Relatório financeiro mensal</Eyebrow>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 28, color: theme.text, marginBottom: 2 }}>{periodLabel}</div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: theme.muted, marginBottom: 18 }}>
          Saldo final do mês: <strong style={{ color: s.saldo >= 0 ? theme.positive : theme.negative }}>{brl(s.saldo)}</strong>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 22 }}>
          <StatCard icon={TrendingUp} label="Entradas" value={s.totalEntradas} theme={theme} tone="positive" />
          <StatCard icon={TrendingDown} label="Gastos totais" value={s.totalGastos} theme={theme} tone="negative" />
          <StatCard icon={PiggyBank} label="Investido" value={s.totalInvestimentos} theme={theme} />
          <StatCard icon={AlertTriangle} label="Dívidas em aberto" value={s.totalDividas} theme={theme} tone="negative" />
        </div>

        <Eyebrow theme={theme}>Gastos por categoria</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {catEntries.length === 0 && <div style={{ color: theme.muted, fontSize: 13, fontFamily:"'Inter',sans-serif" }}>Sem gastos categorizados neste mês.</div>}
          {catEntries.map(([cat, val]) => {
            const budget = num(categoryBudgets?.[cat]);
            const over = budget > 0 && val > budget;
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 130, fontSize: 12, fontFamily: "'Inter',sans-serif", color: theme.text, flexShrink: 0 }}>{cat}</div>
                <div style={{ flex: 1, height: 8, background: theme.bgAlt, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (val / (budget > 0 ? budget : maxCat)) * 100)}%`, height: "100%", background: over ? theme.negative : theme.accent }} />
                </div>
                <div style={{ width: 100, textAlign: "right", fontSize: 12, fontFamily: "'Inter',sans-serif", color: over ? theme.negative : theme.muted, fontWeight: over ? 700 : 400 }}>
                  {brl(val)}{budget > 0 ? ` / ${brl(budget)}` : ""}
                </div>
              </div>
            );
          })}
        </div>

        <Eyebrow theme={theme}>Gastos por forma de pagamento</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {payEntries.length === 0 && <div style={{ color: theme.muted, fontSize: 13, fontFamily:"'Inter',sans-serif" }}>Sem lançamentos.</div>}
          {payEntries.map(([p, v]) => (
            <div key={p} style={{ background: theme.bgAlt, borderRadius: 10, padding: "8px 12px", fontFamily: "'Inter',sans-serif" }}>
              <div style={{ fontSize: 11, color: theme.muted, fontWeight: 600 }}>{p}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{brl(v)}</div>
            </div>
          ))}
        </div>

        <Eyebrow theme={theme}>Pendências ({s.pendentes.length})</Eyebrow>
        {s.pendentes.length === 0 ? (
          <div style={{ color: theme.positive, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Nenhuma despesa pendente. Tudo pago! 🎉</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {s.pendentes.map((r) => {
              const d = daysUntil(r.data);
              let badge = null;
              if (d !== null) {
                if (d < 0) badge = { text: `atrasada há ${Math.abs(d)}d`, color: theme.negative };
                else if (d <= 5) badge = { text: d === 0 ? "vence hoje" : `vence em ${d}d`, color: theme.negative };
              }
              return (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "'Inter',sans-serif", color: theme.text, padding: "4px 0", borderBottom: `1px dashed ${theme.border}` }}>
                  <span>{r.despesa || "—"} <span style={{ color: theme.muted }}>· {r.categoria || "sem categoria"}</span>
                    {badge && <span style={{ color: badge.color, fontWeight: 700, marginLeft: 6 }}>⚠ {badge.text}</span>}
                  </span>
                  <span style={{ fontWeight: 700 }}>{brl(r.valor)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, theme }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 12px", fontFamily: "'Inter',sans-serif", fontSize: 12, boxShadow: `0 4px 14px ${theme.shadow}` }}>
      <div style={{ fontWeight: 700, color: theme.text, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {brl(p.value)}</div>
      ))}
    </div>
  );
}

function ChartCard({ title, children, theme, height = 220 }) {
  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 18, boxShadow: `0 4px 14px ${theme.shadow}` }}>
      <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 16, color: theme.text, marginBottom: 12 }}>{title}</div>
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

function DashboardView({ yearData, theme, year }) {
  const monthly = MONTHS.map((m, i) => {
    const s = computeSummary(yearData[i] || emptyMonth());
    return { month: m.slice(0, 3), ...s };
  });

  let acumulado = 0;
  const investEvolution = monthly.map((r) => {
    acumulado += r.totalInvestimentos;
    return { month: r.month, Acumulado: acumulado };
  });

  const categoryTotals = {};
  MONTHS.forEach((_, i) => {
    const m = yearData[i] || emptyMonth();
    [...m.fixas, ...m.variaveis, ...m.parceladas].forEach((r) => {
      if (r.categoria) categoryTotals[r.categoria] = (categoryTotals[r.categoria] || 0) + num(r.valor);
    });
  });
  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, valor]) => ({ name, valor }));

  const paymentTotals = {};
  MONTHS.forEach((_, i) => {
    const m = yearData[i] || emptyMonth();
    [...m.fixas, ...m.variaveis, ...m.parceladas].forEach((r) => {
      if (r.pagamento) paymentTotals[r.pagamento] = (paymentTotals[r.pagamento] || 0) + num(r.valor);
    });
  });
  const topPayments = Object.entries(paymentTotals).sort((a, b) => b[1] - a[1]).map(([name, valor]) => ({ name, valor }));

  const yearEntradas = monthly.reduce((s, r) => s + r.totalEntradas, 0);
  const yearGastos = monthly.reduce((s, r) => s + r.totalGastos, 0);
  const yearInvest = monthly.reduce((s, r) => s + r.totalInvestimentos, 0);

  const dividasSeries = monthly.map((r) => ({ month: r.month, Dívidas: r.totalDividas }));
  const mesesComDados = monthly.filter((r) => r.totalDividas > 0 || r.totalEntradas > 0 || r.totalGastos > 0);
  const dividaInicio = mesesComDados.length ? mesesComDados[0].totalDividas : 0;
  const dividaFim = mesesComDados.length ? mesesComDados[mesesComDados.length - 1].totalDividas : 0;
  const dividaVariacao = dividaFim - dividaInicio;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Eyebrow theme={theme}>Evolução financeira · {year}</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <StatCard icon={TrendingUp} label="Entradas (ano)" value={yearEntradas} theme={theme} tone="positive" />
        <StatCard icon={TrendingDown} label="Gastos (ano)" value={yearGastos} theme={theme} tone="negative" />
        <StatCard icon={PiggyBank} label="Investido (ano)" value={yearInvest} theme={theme} />
        <StatCard icon={AlertTriangle} label="Dívidas atuais" value={dividaFim} theme={theme} tone="negative" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: 14, alignItems: "start" }}>
      <ChartCard title="Saldo mês a mês" theme={theme}>
        <ResponsiveContainer>
          <LineChart data={monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.muted }} axisLine={{ stroke: theme.border }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: theme.muted }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip theme={theme} />} />
            <Line type="monotone" dataKey="saldo" name="Saldo" stroke={theme.accent2} strokeWidth={3} dot={{ r: 3, fill: theme.accent2 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Entradas vs. Gastos" theme={theme}>
        <ResponsiveContainer>
          <AreaChart data={monthly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gEntradas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.positive} stopOpacity={0.5} />
                <stop offset="100%" stopColor={theme.positive} stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="gGastos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.negative} stopOpacity={0.5} />
                <stop offset="100%" stopColor={theme.negative} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.muted }} axisLine={{ stroke: theme.border }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: theme.muted }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip theme={theme} />} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter',sans-serif" }} />
            <Area type="monotone" dataKey="totalEntradas" name="Entradas" stroke={theme.positive} fill="url(#gEntradas)" strokeWidth={2} />
            <Area type="monotone" dataKey="totalGastos" name="Gastos" stroke={theme.negative} fill="url(#gGastos)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Investimentos acumulados" theme={theme}>
        <ResponsiveContainer>
          <AreaChart data={investEvolution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gInvest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.accent2} stopOpacity={0.45} />
                <stop offset="100%" stopColor={theme.accent2} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.muted }} axisLine={{ stroke: theme.border }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: theme.muted }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip theme={theme} />} />
            <Area type="monotone" dataKey="Acumulado" stroke={theme.accent2} fill="url(#gInvest)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Evolução das dívidas" theme={theme}>
        <ResponsiveContainer>
          <AreaChart data={dividasSeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gDividas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.negative} stopOpacity={0.5} />
                <stop offset="100%" stopColor={theme.negative} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.muted }} axisLine={{ stroke: theme.border }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: theme.muted }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip theme={theme} />} />
            <Area type="monotone" dataKey="Dívidas" stroke={theme.negative} fill="url(#gDividas)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        {mesesComDados.length > 1 && (
          <div style={{
            marginTop: 10, fontSize: 12, fontFamily: "'Inter',sans-serif",
            color: dividaVariacao > 0 ? theme.negative : theme.positive, fontWeight: 600,
          }}>
            {dividaVariacao > 0
              ? `⚠ Suas dívidas aumentaram ${brl(dividaVariacao)} ao longo do ano.`
              : dividaVariacao < 0
                ? `✅ Você conseguiu reduzir suas dívidas em ${brl(Math.abs(dividaVariacao))} ao longo do ano.`
                : "Suas dívidas se mantiveram estáveis ao longo do ano."}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Top categorias do ano" theme={theme} height={Math.max(180, topCategories.length * 34)}>
        <ResponsiveContainer>
          <BarChart data={topCategories} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={theme.border} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: theme.muted }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: theme.text }} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<CustomTooltip theme={theme} />} />
            <Bar dataKey="valor" name="Total" fill={theme.accent2} radius={[0, 6, 6, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Gastos por forma de pagamento" theme={theme} height={Math.max(180, topPayments.length * 34)}>
        {topPayments.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: theme.muted, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
            Sem lançamentos com forma de pagamento definida ainda.
          </div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={topPayments} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={theme.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: theme.muted }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: theme.text }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<CustomTooltip theme={theme} />} />
              <Bar dataKey="valor" name="Total" fill={theme.accent} radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   CALENDÁRIO DE VENCIMENTOS
----------------------------------------------------------------*/
/* Calcula os lançamentos que entram na fatura de um cartão no mês selecionado.
   Se o cartão tiver "dia de fechamento" configurado, considera o ciclo real
   (do dia seguinte ao fechamento do mês anterior até o fechamento deste mês). */
function getCardInvoiceItems(card, yearData, monthIndex) {
  const entriesOf = (m) => [...m.fixas, ...m.variaveis, ...m.parceladas].filter((r) => r.pagamento === card.name);
  const closing = parseInt(card.closingDay, 10);
  const curMonth = yearData[monthIndex] || emptyMonth();

  if (!closing || closing < 1 || closing > 31) {
    return entriesOf(curMonth);
  }

  const prevIdx = monthIndex - 1;
  const prevMonth = prevIdx >= 0 ? (yearData[prevIdx] || emptyMonth()) : emptyMonth();
  const items = [];

  entriesOf(prevMonth).forEach((r) => {
    if (!r.data) return;
    const d = new Date(r.data + "T00:00:00");
    if (isNaN(d.getTime())) return;
    if (d.getDate() > closing) items.push(r);
  });
  entriesOf(curMonth).forEach((r) => {
    if (!r.data) { items.push(r); return; }
    const d = new Date(r.data + "T00:00:00");
    if (isNaN(d.getTime())) { items.push(r); return; }
    if (d.getDate() <= closing) items.push(r);
  });
  return items;
}

/* ---------------------------------------------------------------
   CARTÕES — valor de cada fatura e categoria que mais pesa
----------------------------------------------------------------*/
function CardsView({
  yearData, monthIndex, year, theme, paymentMethods,
  onRenameCard, onSetCardDates, onToggleIsCard, onAddCard,
  requestRemoveCard, confirmDeleteIndex, onCancelDeleteCard, onConfirmDeleteCard, countCardUsage,
}) {
  const [expanded, setExpanded] = useState(null);

  const cardsData = (paymentMethods || []).map((card, index) => {
    const items = getCardInvoiceItems(card, yearData, monthIndex);
    const total = items.reduce((s, r) => s + num(r.valor), 0);
    const byCat = {};
    items.forEach((r) => { if (r.categoria) byCat[r.categoria] = (byCat[r.categoria] || 0) + num(r.valor); });
    const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    return { ...card, index, total, catEntries, items };
  });

  const maxTotal = Math.max(1, ...cardsData.map((c) => c.total));
  const inputStyle = {
    border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px",
    fontSize: 12, fontFamily: "'Inter',sans-serif", background: theme.bgAlt, color: theme.text, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow theme={theme}>Cartões · {MONTHS[monthIndex]} de {year}</Eyebrow>
        <button onClick={onAddCard} style={{
          display: "flex", alignItems: "center", gap: 6, background: theme.accent2, color: "#fff",
          border: "none", borderRadius: 999, padding: "8px 14px", fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>
          <Plus size={14} /> Adicionar cartão / forma de pagamento
        </button>
      </div>

      {cardsData.length === 0 ? (
        <div style={{ color: theme.muted, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Nenhuma forma de pagamento cadastrada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cardsData.map((card) => {
            const isOpen = expanded === card.index;
            return (
              <div key={card.index} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 18, boxShadow: `0 4px 14px ${theme.shadow}` }}>
                <button onClick={() => setExpanded(isOpen ? null : card.index)} style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <CreditCard size={17} color={theme.accent2} />
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, color: theme.text }}>{card.name}</div>
                      {card.isCard && (card.closingDay || card.dueDay) ? (
                        <div style={{ fontSize: 11, color: theme.muted, fontFamily: "'Inter',sans-serif" }}>
                          {card.closingDay && `Fecha dia ${card.closingDay}`}{card.closingDay && card.dueDay ? " · " : ""}{card.dueDay && `Vence dia ${card.dueDay}`}
                        </div>
                      ) : !card.isCard ? (
                        <div style={{ fontSize: 11, color: theme.muted, fontFamily: "'Inter',sans-serif" }}>Pagamento à vista</div>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 18, color: theme.text }}>{brl(card.total)}</span>
                    {isOpen ? <ChevronUp size={18} color={theme.muted} /> : <ChevronDown size={18} color={theme.muted} />}
                  </div>
                </button>

                {isOpen && (
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ height: 6, background: theme.bgAlt, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${(card.total / maxTotal) * 100}%`, height: "100%", background: theme.accent2 }} />
                    </div>

                    {card.catEntries.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: theme.accent2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                          Mais gasta em: {card.catEntries[0][0]}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {card.catEntries.slice(0, 5).map(([cat, val]) => (
                            <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "'Inter',sans-serif", color: theme.text }}>
                              <span>{cat}</span>
                              <span style={{ fontWeight: 600, color: theme.muted }}>{brl(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: 11, color: theme.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        Lançamentos nesta fatura ({card.items.length})
                      </div>
                      {card.items.length === 0 ? (
                        <div style={{ fontSize: 12, color: theme.muted, fontFamily: "'Inter',sans-serif" }}>Nenhum gasto nesta forma de pagamento.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {card.items.map((r) => (
                            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "'Inter',sans-serif", color: theme.text, padding: "3px 0", borderBottom: `1px dashed ${theme.border}` }}>
                              <span>{r.despesa} <span style={{ color: theme.muted }}>· {r.categoria || "sem categoria"}</span></span>
                              <span style={{ fontWeight: 700 }}>{brl(r.valor)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ borderTop: `1px dashed ${theme.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={card.name} onChange={(e) => onRenameCard(card.index, e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                        <button onClick={() => onToggleIsCard(card.index)} style={{
                          border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: card.isCard ? theme.accentSoft : "transparent", color: card.isCard ? theme.accent2 : theme.muted,
                        }}>
                          {card.isCard ? "💳 Cartão" : "Pagto à vista"}
                        </button>
                        <button onClick={() => requestRemoveCard(card.index)} style={{ background: "none", border: "none", cursor: "pointer", color: theme.negative }}>
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {card.isCard && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, color: theme.muted, whiteSpace: "nowrap" }}>Fecha dia</span>
                            <input type="number" min="1" max="31" value={card.closingDay} onChange={(e) => onSetCardDates(card.index, "closingDay", e.target.value)} placeholder="—" style={{ ...inputStyle, width: "100%" }} />
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, color: theme.muted, whiteSpace: "nowrap" }}>Vence dia</span>
                            <input type="number" min="1" max="31" value={card.dueDay} onChange={(e) => onSetCardDates(card.index, "dueDay", e.target.value)} placeholder="—" style={{ ...inputStyle, width: "100%" }} />
                          </div>
                        </div>
                      )}

                      {confirmDeleteIndex === card.index && (
                        <div style={{ background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10 }}>
                          <div style={{ fontSize: 12, color: theme.text, marginBottom: 8 }}>
                            ⚠ "{card.name}" está em {countCardUsage(card.name)} despesa(s). Se excluir, elas ficam sem forma de pagamento.
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={onCancelDeleteCard} style={{
                              flex: 1, background: theme.card, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8,
                              padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            }}>Cancelar</button>
                            <button onClick={() => onConfirmDeleteCard(card.index)} style={{
                              flex: 1, background: theme.negative, color: "#fff", border: "none", borderRadius: 8,
                              padding: "6px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
                            }}>Excluir mesmo assim</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CalendarView({ yearData, monthIndex, year, theme, paymentMethods }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const month = yearData[monthIndex] || emptyMonth();
  const pendentes = [...month.fixas, ...month.variaveis, ...month.parceladas].filter((r) => r.pago === "NÃO" && r.data);

  const byDay = {};
  pendentes.forEach((r) => {
    const d = new Date(r.data + "T00:00:00");
    if (isNaN(d.getTime())) return;
    if (d.getFullYear() === year && d.getMonth() === monthIndex) {
      const day = d.getDate();
      byDay[day] = byDay[day] || [];
      byDay[day].push(r);
    }
  });

  const firstDow = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayReal = new Date();
  const isToday = (day) => todayReal.getFullYear() === year && todayReal.getMonth() === monthIndex && todayReal.getDate() === day;

  const cardsComData = (paymentMethods || []).filter((p) => p.dueDay || p.closingDay);
  const byDayCards = {};
  (paymentMethods || []).forEach((p) => {
    const due = parseInt(p.dueDay, 10);
    if (due >= 1 && due <= daysInMonth) {
      byDayCards[due] = byDayCards[due] || [];
      byDayCards[due].push(p.name);
    }
  });

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const diasComConta = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const totalPendente = pendentes.reduce((s, r) => s + num(r.valor), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Eyebrow theme={theme}>Calendário de vencimentos · {MONTHS[monthIndex]} de {year}</Eyebrow>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <StatCard icon={AlertTriangle} label="Pendente no mês" value={totalPendente} theme={theme} tone="negative" />
        <StatCard icon={Calendar} label="Dias com vencimento" value={diasComConta.length} theme={theme} />
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 18, boxShadow: `0 4px 14px ${theme.shadow}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 11, color: theme.muted, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const items = byDay[day] || [];
            const has = items.length > 0;
            const cardsHoje = byDayCards[day] || [];
            const hasCard = cardsHoje.length > 0;
            return (
              <button key={i} onClick={() => setSelectedDay(has ? day : null)} title={hasCard ? `Vence: ${cardsHoje.join(", ")}` : undefined} style={{
                aspectRatio: "1", borderRadius: 10, cursor: has ? "pointer" : "default",
                border: isToday(day) ? `2px solid ${theme.accent2}` : `1px solid ${theme.border}`,
                background: selectedDay === day ? theme.accentSoft : (has || hasCard) ? theme.bgAlt : theme.card,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 2,
              }}>
                <span style={{ fontSize: 12, fontWeight: isToday(day) ? 800 : 500, color: theme.text, fontFamily: "'Inter',sans-serif" }}>{day}</span>
                <span style={{ display: "flex", gap: 2 }}>
                  {has && <span style={{ width: 5, height: 5, borderRadius: "50%", background: theme.negative }} />}
                  {hasCard && <span style={{ width: 5, height: 5, borderRadius: "50%", background: theme.accent2 }} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>


      {selectedDay && byDay[selectedDay] && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 14, boxShadow: `0 4px 14px ${theme.shadow}` }}>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: theme.text, marginBottom: 8 }}>Dia {selectedDay}</div>
          {byDay[selectedDay].map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "'Inter',sans-serif", color: theme.text, padding: "4px 0", borderBottom: `1px dashed ${theme.border}` }}>
              <span>{r.despesa} <span style={{ color: theme.muted }}>· {r.categoria || "sem categoria"}</span></span>
              <span style={{ fontWeight: 700 }}>{brl(r.valor)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16, boxShadow: `0 4px 14px ${theme.shadow}` }}>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: theme.text, marginBottom: 10 }}>Agenda do mês</div>
        {diasComConta.length === 0 ? (
          <div style={{ color: theme.positive, fontSize: 13, fontFamily: "'Inter',sans-serif" }}>Nenhuma conta pendente com data marcada este mês. 🎉</div>
        ) : (
          diasComConta.map((day) => (
            <div key={day} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.accent2, fontFamily: "'Inter',sans-serif", marginBottom: 3 }}>Dia {day}</div>
              {byDay[day].map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "'Inter',sans-serif", color: theme.text, padding: "2px 0 2px 10px" }}>
                  <span>{r.despesa}</span>
                  <span style={{ fontWeight: 700 }}>{brl(r.valor)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {cardsComData.length > 0 && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 16, boxShadow: `0 4px 14px ${theme.shadow}` }}>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, color: theme.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.accent2, display: "inline-block" }} /> Cartões deste mês
          </div>
          {cardsComData.map((p) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "'Inter',sans-serif", color: theme.text, padding: "4px 0", borderBottom: `1px dashed ${theme.border}` }}>
              <span>{p.name}</span>
              <span style={{ color: theme.muted }}>
                {p.closingDay && `Fecha dia ${p.closingDay}`}{p.closingDay && p.dueDay ? " · " : ""}{p.dueDay && `Vence dia ${p.dueDay}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnualTableView({ yearData, categories, theme, year }) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const { matrix, totalGastosRow, totalEntradasRow, totalSaldoRow } = computeAnnualMatrix(yearData, categories);

  const exportOptions = [
    { key: "html", label: "Relatório anual", icon: FileDown, action: () => exportYearHTML(year, theme, yearData, categories), errorMsg: "Não foi possível gerar o relatório agora." },
    { key: "xlsx", label: "Planilha Excel (.xlsx)", icon: FileSpreadsheet, action: () => exportYearXLSX(year, yearData, categories), errorMsg: "Não foi possível gerar o Excel agora." },
    { key: "csv", label: "Arquivo CSV", icon: FileText, action: () => exportYearCSV(year, yearData, categories), errorMsg: "Não foi possível gerar o CSV agora." },
  ];
  const runExport = (opt) => {
    setShowExportMenu(false);
    try { opt.action(); }
    catch (e) { console.error(e); alert(opt.errorMsg); }
  };

  const cellStyle = { padding: "6px 8px", fontSize: 11, fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap", textAlign: "right" };
  const thStyle = { ...cellStyle, fontWeight: 700, color: theme.muted, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.03em" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow theme={theme}>Visão anual · {year}</Eyebrow>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowExportMenu((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: theme.accent2, color: "#fff", border: "none", borderRadius: 999, padding: "8px 14px", fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <FileDown size={14} /> Relatório {showExportMenu ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showExportMenu && (
            <div style={{ position: "absolute", right: 0, top: 42, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 6, boxShadow: `0 8px 24px ${theme.shadow}`, zIndex: 10, width: 210 }}>
              {exportOptions.map((opt) => (
                <button key={opt.key} onClick={() => runExport(opt)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                  background: "none", border: "none", borderRadius: 8, padding: "9px 10px", cursor: "pointer",
                  fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13, color: theme.text,
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bgAlt)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                  <opt.icon size={14} color={theme.accent2} /> {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <StatCard icon={TrendingUp} label="Entradas (ano)" value={totalEntradasRow.reduce((s, v) => s + v, 0)} theme={theme} tone="positive" />
        <StatCard icon={TrendingDown} label="Gastos (ano)" value={totalGastosRow.reduce((s, v) => s + v, 0)} theme={theme} tone="negative" />
        <StatCard icon={Wallet} label="Saldo (ano)" value={totalSaldoRow.reduce((s, v) => s + v, 0)} theme={theme} />
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 16, boxShadow: `0 4px 14px ${theme.shadow}`, overflowX: "auto" }}>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 16, color: theme.text, marginBottom: 12 }}>Gastos por categoria — mês a mês</div>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: theme.card }}>Categoria</th>
              {MONTHS.map((m) => <th key={m} style={thStyle}>{m.slice(0, 3)}</th>)}
              <th style={{ ...thStyle, color: theme.accent2 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.cat} style={{ borderTop: `1px solid ${theme.border}` }}>
                <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, color: theme.text, position: "sticky", left: 0, background: theme.card }}>{row.cat}</td>
                {row.values.map((v, i) => (
                  <td key={i} style={{ ...cellStyle, color: v > 0 ? theme.text : theme.border }}>{v > 0 ? brl(v) : "—"}</td>
                ))}
                <td style={{ ...cellStyle, fontWeight: 700, color: theme.accent2 }}>{brl(row.total)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${theme.border}` }}>
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: 800, color: theme.text, position: "sticky", left: 0, background: theme.card }}>TOTAL GASTOS</td>
              {totalGastosRow.map((v, i) => <td key={i} style={{ ...cellStyle, fontWeight: 700, color: theme.negative }}>{brl(v)}</td>)}
              <td style={{ ...cellStyle, fontWeight: 800, color: theme.negative }}>{brl(totalGastosRow.reduce((s, v) => s + v, 0))}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: 800, color: theme.text, position: "sticky", left: 0, background: theme.card }}>ENTRADAS</td>
              {totalEntradasRow.map((v, i) => <td key={i} style={{ ...cellStyle, fontWeight: 700, color: theme.positive }}>{brl(v)}</td>)}
              <td style={{ ...cellStyle, fontWeight: 800, color: theme.positive }}>{brl(totalEntradasRow.reduce((s, v) => s + v, 0))}</td>
            </tr>
            <tr>
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: 800, color: theme.text, position: "sticky", left: 0, background: theme.card }}>SALDO</td>
              {totalSaldoRow.map((v, i) => <td key={i} style={{ ...cellStyle, fontWeight: 700, color: v >= 0 ? theme.positive : theme.negative }}>{brl(v)}</td>)}
              <td style={{ ...cellStyle, fontWeight: 800, color: theme.text }}>{brl(totalSaldoRow.reduce((s, v) => s + v, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [themeKey, setThemeKey] = useState("rosa");
  const [year, setYear] = useState(REAL_YEAR);
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [data, setData] = useState({});
  const [paymentMethods, setPaymentMethods] = useState(DEFAULT_PAYMENT_METHODS);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [categoryBudgets, setCategoryBudgets] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("calendario");
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(null);
  const [confirmDeletePayment, setConfirmDeletePayment] = useState(null);

  const theme = THEMES[themeKey];

  const loadYear = useCallback(async (y) => {
    const yearData = {};
    for (let i = 0; i < 12; i++) {
      yearData[i] = await loadJSON(`month:${y}:${i}`, emptyMonth());
    }
    setData((prev) => (prev[y] ? prev : { ...prev, [y]: yearData }));
  }, []);

  useEffect(() => {
    (async () => {
      const settings = await loadJSON("settings", { theme: "rosa" });
      setThemeKey(settings.theme || "rosa");
      const pm = await loadJSON("paymentMethods", DEFAULT_PAYMENT_METHODS);
      setPaymentMethods(normalizePaymentMethods(pm));
      const cats = await loadJSON("categories", DEFAULT_CATEGORIES);
      setCategories(cats && cats.length ? cats : DEFAULT_CATEGORIES);
      const budgets = await loadJSON("categoryBudgets", {});
      setCategoryBudgets(budgets || {});
      await loadYear(REAL_YEAR);
      setLoaded(true);
    })();
  }, [loadYear]);

  useEffect(() => {
    if (!loaded) return;
    if (!data[year]) loadYear(year);
  }, [year, loaded, data, loadYear]);

  useEffect(() => { if (loaded) saveJSON("settings", { theme: themeKey }); }, [themeKey, loaded]);
  useEffect(() => { if (loaded) saveJSON("paymentMethods", paymentMethods); }, [paymentMethods, loaded]);
  useEffect(() => { if (loaded) saveJSON("categories", categories); }, [categories, loaded]);
  useEffect(() => { if (loaded) saveJSON("categoryBudgets", categoryBudgets); }, [categoryBudgets, loaded]);
  useEffect(() => {
    if (!loaded) return;
    Object.keys(data).forEach((y) => {
      Object.keys(data[y]).forEach((idx) => saveJSON(`month:${y}:${idx}`, data[y][idx]));
    });
  }, [data, loaded]);

  const yearData = data[year] || {};
  const month = yearData[monthIndex] || emptyMonth();
  const summary = useMemo(() => computeSummary(month), [month]);
  const periodLabel = `${MONTHS[monthIndex]} de ${year}`;

  const globalReminders = useMemo(() => {
    const yd = data[REAL_YEAR] || {};
    const items = [];
    Object.keys(yd).forEach((idx) => {
      const m = yd[idx];
      [...m.fixas, ...m.variaveis, ...m.parceladas].forEach((r) => {
        if (r.pago === "NÃO" && r.data) {
          const d = daysUntil(r.data);
          if (d !== null && d <= 5) items.push({ ...r, d });
        }
      });
    });
    return items.sort((a, b) => a.d - b.d);
  }, [data]);

  const updateSection = useCallback((section, updater) => {
    setData((prev) => {
      const yd = prev[year] || {};
      const md = yd[monthIndex] || emptyMonth();
      return { ...prev, [year]: { ...yd, [monthIndex]: { ...md, [section]: updater(md[section] || []) } } };
    });
  }, [year, monthIndex]);

  const addRow = (section, template) => updateSection(section, (rows) => [...rows, { id: uid(), ...template }]);

  const updateRow = (section, id, key, value) => {
    if (section === "fixas") {
      setData((prev) => {
        const yd = { ...(prev[year] || {}) };
        const md = { ...(yd[monthIndex] || emptyMonth()) };
        const list = md.fixas.map((r) => (r.id === id ? { ...r, [key]: value } : r));
        md.fixas = list;
        yd[monthIndex] = md;
        const updatedRow = list.find((r) => r.id === id);
        const newYd = updatedRow ? syncFixaRecurrence(yd, monthIndex, id, updatedRow) : yd;
        return { ...prev, [year]: newYd };
      });
      return;
    }
    if (section === "dividas") {
      setData((prev) => {
        const yd = { ...(prev[year] || {}) };
        const md = { ...(yd[monthIndex] || emptyMonth()) };
        const list = md.dividas.map((r) => (r.id === id ? { ...r, [key]: value } : r));
        md.dividas = list;
        yd[monthIndex] = md;
        const updatedRow = list.find((r) => r.id === id);
        const newYd = updatedRow ? syncDividaRollover(yd, monthIndex, id, updatedRow) : yd;
        return { ...prev, [year]: newYd };
      });
      return;
    }
    if (section !== "parceladas") {
      updateSection(section, (rows) => rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
      return;
    }
    setData((prev) => {
      const yd = { ...(prev[year] || {}) };
      const md = { ...(yd[monthIndex] || emptyMonth()) };
      const list = md.parceladas.map((r) => (r.id === id ? { ...r, [key]: value } : r));
      md.parceladas = list;
      yd[monthIndex] = md;
      const updatedRow = list.find((r) => r.id === id);
      const newYd = updatedRow ? syncParceladaChain(yd, monthIndex, id, updatedRow) : yd;
      return { ...prev, [year]: newYd };
    });
  };

  const deleteRow = (section, id) => {
    if (section === "fixas") {
      setData((prev) => {
        const yd = prev[year] || {};
        const md = yd[monthIndex] || emptyMonth();
        const row = md.fixas.find((r) => r.id === id);
        if (!row) return prev;
        if (!row.linkId) {
          return { ...prev, [year]: { ...yd, [monthIndex]: { ...md, fixas: md.fixas.filter((r) => r.id !== id) } } };
        }
        const newYd = { ...yd };
        for (let idx = 0; idx < 12; idx++) {
          if (!newYd[idx]) continue;
          newYd[idx] = { ...newYd[idx], fixas: newYd[idx].fixas.filter((r) => r.linkId !== row.linkId) };
        }
        return { ...prev, [year]: newYd };
      });
      return;
    }
    if (section === "dividas") {
      setData((prev) => {
        const yd = prev[year] || {};
        const md = yd[monthIndex] || emptyMonth();
        const row = md.dividas.find((r) => r.id === id);
        if (!row) return prev;
        if (!row.linkId) {
          return { ...prev, [year]: { ...yd, [monthIndex]: { ...md, dividas: md.dividas.filter((r) => r.id !== id) } } };
        }
        const newYd = { ...yd };
        for (let idx = 0; idx < 12; idx++) {
          if (!newYd[idx]) continue;
          newYd[idx] = { ...newYd[idx], dividas: newYd[idx].dividas.filter((r) => r.linkId !== row.linkId) };
        }
        return { ...prev, [year]: newYd };
      });
      return;
    }
    if (section !== "parceladas") {
      updateSection(section, (rows) => rows.filter((r) => r.id !== id));
      return;
    }
    setData((prev) => {
      const yd = prev[year] || {};
      const md = yd[monthIndex] || emptyMonth();
      const row = md.parceladas.find((r) => r.id === id);
      if (!row) return prev;
      if (!row.linkId) {
        return { ...prev, [year]: { ...yd, [monthIndex]: { ...md, parceladas: md.parceladas.filter((r) => r.id !== id) } } };
      }
      const newYd = { ...yd };
      for (let idx = 0; idx < 12; idx++) {
        if (!newYd[idx]) continue;
        newYd[idx] = { ...newYd[idx], parceladas: newYd[idx].parceladas.filter((r) => r.linkId !== row.linkId) };
      }
      return { ...prev, [year]: newYd };
    });
  };

  const countFieldUsage = (field, value) => {
    let count = 0;
    Object.values(data).forEach((yd) => {
      Object.values(yd).forEach((m) => {
        count += m.fixas.filter((r) => r[field] === value).length;
        count += m.variaveis.filter((r) => r[field] === value).length;
        count += m.parceladas.filter((r) => r[field] === value).length;
      });
    });
    return count;
  };

  const requestRemoveCategory = (index) => {
    const count = countFieldUsage("categoria", categories[index]);
    if (count > 0) setConfirmDeleteCategory(index);
    else removeCategory(index);
  };
  const requestRemovePaymentMethod = (index) => {
    const count = countFieldUsage("pagamento", paymentMethods[index].name);
    if (count > 0) setConfirmDeletePayment(index);
    else removePaymentMethod(index);
  };

  const swapFieldAcrossAllYears = (field, oldValue, newValue) => {
    setData((prev) => {
      const newData = {};
      Object.keys(prev).forEach((y) => {
        const yd = prev[y];
        const newYd = {};
        Object.keys(yd).forEach((idx) => {
          const m = yd[idx];
          const swap = (list) => list.map((r) => (r[field] === oldValue ? { ...r, [field]: newValue } : r));
          newYd[idx] = { ...m, fixas: swap(m.fixas), variaveis: swap(m.variaveis), parceladas: swap(m.parceladas) };
        });
        newData[y] = newYd;
      });
      return newData;
    });
  };

  const renamePaymentMethod = (index, newName) => {
    const oldName = paymentMethods[index].name;
    if (oldName === newName) return;
    setPaymentMethods((prev) => prev.map((p, i) => (i === index ? { ...p, name: newName } : p)));
    swapFieldAcrossAllYears("pagamento", oldName, newName);
  };
  const setCardDates = (index, field, value) => {
    setPaymentMethods((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };
  const toggleIsCard = (index) => {
    setPaymentMethods((prev) => prev.map((p, i) => (i === index ? { ...p, isCard: !p.isCard, ...(p.isCard ? { closingDay: "", dueDay: "" } : {}) } : p)));
  };
  const addPaymentMethod = () => setPaymentMethods((prev) => [...prev, { name: "Novo cartão", isCard: true, closingDay: "", dueDay: "" }]);
  const removePaymentMethod = (index) => {
    const name = paymentMethods[index].name;
    setPaymentMethods((prev) => prev.filter((_, i) => i !== index));
    swapFieldAcrossAllYears("pagamento", name, "");
  };

  const renameCategory = (index, newName) => {
    const oldName = categories[index];
    if (oldName === newName) return;
    setCategories((prev) => prev.map((c, i) => (i === index ? newName : c)));
    setCategoryBudgets((prev) => {
      if (prev[oldName] === undefined) return prev;
      const { [oldName]: val, ...rest } = prev;
      return { ...rest, [newName]: val };
    });
    swapFieldAcrossAllYears("categoria", oldName, newName);
  };
  const addCategory = () => setCategories((prev) => [...prev, "Nova categoria"]);
  const removeCategory = (index) => {
    const name = categories[index];
    setCategories((prev) => prev.filter((_, i) => i !== index));
    setCategoryBudgets((prev) => {
      if (prev[name] === undefined) return prev;
      const { [name]: _drop, ...rest } = prev;
      return rest;
    });
    swapFieldAcrossAllYears("categoria", name, "");
  };
  const setCategoryBudget = (name, value) => setCategoryBudgets((prev) => ({ ...prev, [name]: value }));

  const expenseCols = [
    { key: "despesa", label: "Despesa", type: "text" },
    { key: "data", label: "Data", type: "date" },
    { key: "valor", label: "Valor", type: "number" },
    { key: "pagamento", label: "Pagamento", type: "select", options: paymentMethods.map((p) => p.name) },
    { key: "categoria", label: "Categoria", type: "select", options: categories },
    { key: "pago", label: "Pago?", type: "pago" },
  ];
  const fixedCols = [...expenseCols, { key: "recorrente", label: "Repetir?", type: "recorrente" }];
  const parceladaCols = [
    { key: "despesa", label: "Despesa", type: "text" },
    { key: "parcela", label: "Parcela (N/M)", type: "text" },
    { key: "valor", label: "Valor", type: "number" },
    { key: "pagamento", label: "Pagamento", type: "select", options: paymentMethods.map((p) => p.name) },
    { key: "categoria", label: "Categoria", type: "select", options: categories },
    { key: "pago", label: "Pago?", type: "pago" },
  ];

  const selectStyle = {
    flex: 1, textAlign: "center", appearance: "none", WebkitAppearance: "none",
    border: `1px solid ${theme.border}`, borderRadius: 999, padding: "9px 12px",
    fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, color: theme.text,
    background: theme.card, cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, transition: "background 0.3s", fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        ${FONTS_LINK}
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: ${theme.accent} !important; }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 4px; }
      `}</style>

      <div style={{ padding: "24px 18px 14px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Eyebrow theme={theme}>Painel financeiro pessoal</Eyebrow>
            <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 30, color: theme.text, lineHeight: 1.05 }}>
              Organização<br />Financeira
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ position: "relative" }}>
              <button onClick={() => { setShowCategoryManager((v) => !v); setShowThemePicker(false); }} style={{
                width: 40, height: 40, borderRadius: "50%", border: `2px solid ${theme.border}`,
                background: theme.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Tag size={18} color={theme.accent2} />
              </button>
              {showCategoryManager && (
                <div style={{ position: "absolute", right: 0, top: 46, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 14, boxShadow: `0 8px 24px ${theme.shadow}`, zIndex: 10, width: 240 }}>
                  <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 8 }}>Categorias</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                    {categories.map((c, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, paddingBottom: 6, borderBottom: `1px dashed ${theme.border}` }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input value={c} onChange={(e) => renameCategory(i, e.target.value)} style={{
                            flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px",
                            fontSize: 12, fontFamily: "'Inter',sans-serif", background: theme.bgAlt, color: theme.text, outline: "none",
                          }} />
                          <button onClick={() => requestRemoveCategory(i)} style={{ background: "none", border: "none", cursor: "pointer", color: theme.negative }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <input
                          type="number"
                          value={categoryBudgets[c] ?? ""}
                          onChange={(e) => setCategoryBudget(c, e.target.value)}
                          placeholder="Meta mensal (opcional)"
                          style={{
                            border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px",
                            fontSize: 11, fontFamily: "'Inter',sans-serif", background: "transparent", color: theme.muted, outline: "none",
                          }}
                        />
                        {confirmDeleteCategory === i && (
                          <div style={{ background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, marginTop: 2 }}>
                            <div style={{ fontSize: 11, color: theme.text, marginBottom: 6 }}>
                              ⚠ "{c}" está em {countFieldUsage("categoria", c)} despesa(s). Se excluir, elas ficam sem categoria.
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setConfirmDeleteCategory(null)} style={{
                                flex: 1, background: theme.bgAlt, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8,
                                padding: "5px 0", fontSize: 11, fontWeight: 600, cursor: "pointer",
                              }}>Cancelar</button>
                              <button onClick={() => { removeCategory(i); setConfirmDeleteCategory(null); }} style={{
                                flex: 1, background: theme.negative, color: "#fff", border: "none", borderRadius: 8,
                                padding: "5px 0", fontSize: 11, fontWeight: 700, cursor: "pointer",
                              }}>Excluir mesmo assim</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={addCategory} style={{
                    marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    background: theme.bgAlt, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "7px 0",
                    fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600, cursor: "pointer",
                  }}>
                    <Plus size={13} /> Nova categoria
                  </button>
                  <button onClick={() => { setShowCategoryManager(false); setConfirmDeleteCategory(null); }} style={{
                    marginTop: 6, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    background: theme.accent2, color: "#fff", border: "none", borderRadius: 999, padding: "8px 0",
                    fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 700, cursor: "pointer",
                  }}>
                    <Check size={13} /> Salvar
                  </button>
                </div>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <button onClick={() => { setShowThemePicker((v) => !v); setShowCategoryManager(false); }} style={{
                width: 40, height: 40, borderRadius: "50%", border: `2px solid ${theme.border}`,
                background: theme.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Palette size={18} color={theme.accent2} />
              </button>
              {showThemePicker && (
                <div style={{ position: "absolute", right: 0, top: 46, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 10, boxShadow: `0 8px 24px ${theme.shadow}`, zIndex: 10, display: "flex", gap: 8 }}>
                  {Object.entries(THEMES).map(([key, t]) => (
                    <button key={key} onClick={() => { setThemeKey(key); setShowThemePicker(false); }} style={{
                      width: 36, height: 36, borderRadius: "50%", border: themeKey === key ? `2px solid ${t.accent2}` : `1px solid ${theme.border}`,
                      background: t.swatch, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    }} title={t.label}>
                      {themeKey === key && <Check size={14} color={t.checkColor} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          {[["calendario", "Calendário"], ["dashboard", "Dashboard"], ["cartoes", "Cartões"], ["mensal", "Mensal"], ["anual", "Visão Anual"], ["relatorio", "Relatório"]].map(([key, label]) => (
            <button key={key} onClick={() => setView(key)} style={{
              flex: "1 1 auto", minWidth: 90, padding: "9px 6px", borderRadius: 999, border: "none", cursor: "pointer",
              fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13,
              background: view === key ? theme.accent : theme.bgAlt,
              color: view === key ? theme.bg : theme.text,
            }}>{label}</button>
          ))}
        </div>

        {globalReminders.length > 0 && (
          <div style={{ background: theme.accentSoft, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 13, color: theme.text, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={14} color={theme.negative} /> Você tem {globalReminders.length} conta{globalReminders.length !== 1 ? "s" : ""} vencendo em breve
            </div>
            {globalReminders.slice(0, 4).map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "'Inter',sans-serif", color: theme.text, padding: "3px 0" }}>
                <span>{r.despesa}</span>
                <span style={{ color: theme.negative, fontWeight: 700 }}>
                  {r.d < 0 ? `atrasada há ${Math.abs(r.d)}d` : r.d === 0 ? "vence hoje" : `vence em ${r.d}d`} · {brl(r.valor)}
                </span>
              </div>
            ))}
            {globalReminders.length > 4 && (
              <div style={{ fontSize: 11, color: theme.muted, marginTop: 4, fontFamily: "'Inter',sans-serif" }}>+ {globalReminders.length - 4} outra(s)</div>
            )}
          </div>
        )}

        {(view === "mensal" || view === "calendario" || view === "cartoes") && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <select value={monthIndex} onChange={(e) => setMonthIndex(Number(e.target.value))} style={{ ...selectStyle, flex: 1.6 }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, flex: 1 }}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {(view === "dashboard" || view === "anual") && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: theme.muted }}>Ano:</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, flex: "none", width: 110 }}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
        {view === "mensal" && (
          <>
            <div style={{
              background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent})`, borderRadius: 20, padding: "20px 22px",
              color: "#fff", boxShadow: `0 10px 26px ${theme.shadow}`,
            }}>
              <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 12, opacity: 0.9 }}>Saldo de {periodLabel}</div>
              <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 34 }}>{brl(summary.saldo)}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <StatCard icon={TrendingUp} label="Entradas" value={summary.totalEntradas} theme={theme} tone="positive" />
              <StatCard icon={TrendingDown} label="Gastos" value={summary.totalGastos} theme={theme} tone="negative" />
              <StatCard icon={PiggyBank} label="Investido" value={summary.totalInvestimentos} theme={theme} />
              <StatCard icon={AlertTriangle} label="Dívidas" value={summary.totalDividas} theme={theme} tone="negative" />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionTable title="Entradas" icon={Wallet} theme={theme}
                columns={[{ key: "fonte", label: "Fonte", type: "text" }, { key: "valor", label: "Valor", type: "number" }]}
                rows={month.entradas}
                onAdd={() => addRow("entradas", { fonte: "", valor: "" })}
                onUpdate={(id, k, v) => updateRow("entradas", id, k, v)}
                onDelete={(id) => deleteRow("entradas", id)} />

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SectionTable title="Despesas Fixas" icon={CreditCard} theme={theme}
                  columns={fixedCols} rows={month.fixas}
                  onAdd={() => addRow("fixas", { despesa: "", data: "", valor: "", pagamento: "", categoria: "", pago: "NÃO", recorrente: "NÃO" })}
                  onUpdate={(id, k, v) => updateRow("fixas", id, k, v)}
                  onDelete={(id) => deleteRow("fixas", id)} />
                <div style={{ fontSize: 12, fontFamily: "'Inter',sans-serif", color: theme.muted, padding: "0 4px" }}>
                  💡 Ative "Repete" numa despesa fixa para ela aparecer sozinha nos meses seguintes até você desativar.
                </div>
              </div>

              <SectionTable title="Despesas Variáveis" icon={CreditCard} theme={theme}
                columns={expenseCols} rows={month.variaveis}
                onAdd={() => addRow("variaveis", { despesa: "", data: "", valor: "", pagamento: "", categoria: "", pago: "NÃO" })}
                onUpdate={(id, k, v) => updateRow("variaveis", id, k, v)}
                onDelete={(id) => deleteRow("variaveis", id)} />

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <SectionTable title="Parceladas" icon={CreditCard} theme={theme}
                  columns={parceladaCols}
                  rows={month.parceladas}
                  onAdd={() => addRow("parceladas", { despesa: "", parcela: "", valor: "", pagamento: "", categoria: "", pago: "NÃO" })}
                  onUpdate={(id, k, v) => updateRow("parceladas", id, k, v)}
                  onDelete={(id) => deleteRow("parceladas", id)} />
                <div style={{ fontSize: 12, fontFamily: "'Inter',sans-serif", color: theme.muted, padding: "0 4px" }}>
                  💡 Preencha "Parcela" como <strong>1/3</strong>, <strong>2/3</strong> etc. — ao informar o total, as próximas parcelas aparecem sozinhas nos meses seguintes.
                </div>
              </div>

              <SectionTable title="Investimentos" icon={PiggyBank} theme={theme}
                columns={[{ key: "nome", label: "Nome", type: "text" }, { key: "data", label: "Data", type: "date" }, { key: "valor", label: "Valor", type: "number" }]}
                rows={month.investimentos}
                onAdd={() => addRow("investimentos", { nome: "", data: "", valor: "" })}
                onUpdate={(id, k, v) => updateRow("investimentos", id, k, v)}
                onDelete={(id) => deleteRow("investimentos", id)} />

              <SectionTable title="Dívidas" icon={AlertTriangle} theme={theme}
                columns={[{ key: "nome", label: "Nome", type: "text" }, { key: "valor", label: "Valor", type: "number" }, { key: "pago", label: "Pago?", type: "pago" }]}
                rows={month.dividas}
                onAdd={() => addRow("dividas", { nome: "", valor: "", pago: "NÃO" })}
                onUpdate={(id, k, v) => updateRow("dividas", id, k, v)}
                onDelete={(id) => deleteRow("dividas", id)} />
            </div>
            <div style={{ marginTop: -10, fontSize: 12, fontFamily: "'Inter',sans-serif", color: theme.muted, padding: "0 4px" }}>
              💡 Se uma dívida ficar como "Não pago", ela aparece sozinha no mês seguinte também — até você marcar como paga.
            </div>

            <button onClick={() => setView("relatorio")} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: theme.accent2, color: "#fff",
              border: "none", borderRadius: 999, padding: "13px 0", fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
              <FileText size={16} /> Gerar relatório de {periodLabel}
            </button>
          </>
        )}

        {view === "dashboard" && <DashboardView yearData={yearData} theme={theme} year={year} />}
        {view === "calendario" && <CalendarView yearData={yearData} monthIndex={monthIndex} year={year} theme={theme} paymentMethods={paymentMethods} />}
        {view === "cartoes" && (
          <CardsView
            yearData={yearData} monthIndex={monthIndex} year={year} theme={theme} paymentMethods={paymentMethods}
            onRenameCard={renamePaymentMethod}
            onSetCardDates={setCardDates}
            onToggleIsCard={toggleIsCard}
            onAddCard={addPaymentMethod}
            requestRemoveCard={requestRemovePaymentMethod}
            confirmDeleteIndex={confirmDeletePayment}
            onCancelDeleteCard={() => setConfirmDeletePayment(null)}
            onConfirmDeleteCard={(index) => { removePaymentMethod(index); setConfirmDeletePayment(null); }}
            countCardUsage={(name) => countFieldUsage("pagamento", name)}
          />
        )}
        {view === "anual" && <AnnualTableView yearData={yearData} categories={categories} theme={theme} year={year} />}
        {view === "relatorio" && (
          <ReportView periodLabel={periodLabel} monthName={MONTHS[monthIndex]} year={year} month={month} theme={theme} onClose={() => setView("mensal")} categoryBudgets={categoryBudgets} />
        )}
      </div>
    </div>
  );
}
