/* ============================================================
   PaidPrompt — invoice.js
   Invoice builder: line items, live math, currency formatting,
   paper preview rendering, print-to-PDF, saved invoices in
   localStorage. No dependencies. Plain script.
   ============================================================ */

var PP_CURRENCIES = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CAD", label: "Canadian Dollar (CA$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "NZD", label: "New Zealand Dollar (NZ$)" },
  { code: "CHF", label: "Swiss Franc (CHF)" },
  { code: "SEK", label: "Swedish Krona (kr)" },
  { code: "NOK", label: "Norwegian Krone (kr)" },
  { code: "DKK", label: "Danish Krone (kr)" },
  { code: "INR", label: "Indian Rupee (₹)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "SGD", label: "Singapore Dollar (S$)" },
  { code: "ZAR", label: "South African Rand (R)" },
  { code: "BRL", label: "Brazilian Real (R$)" },
  { code: "MXN", label: "Mexican Peso (MX$)" }
];

function ppMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency, minimumFractionDigits: 2 }).format(amount);
  } catch (e) {
    return currency + " " + (Math.round(amount * 100) / 100).toFixed(2);
  }
}

function ppNum(v, fallback) {
  var n = parseFloat(v);
  return isFinite(n) ? n : (fallback || 0);
}

/* ---------- localStorage helpers ---------- */

function ppStore() {
  try {
    if (window.localStorage) return window.localStorage;
  } catch (e) { /* private mode etc. */ }
  // in-memory fallback so the app still works within the session
  var mem = {};
  return {
    getItem: function (k) { return k in mem ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

var PP_KEYS = {
  invoices: "pp_invoices",
  counter: "pp_invoice_counter",
  license: "pp_license",
  demo: "pp_demo_until",
  signature: "pp_signature",
  tone: "pp_tone"
};

function ppGetJSON(key, fallback) {
  try {
    var raw = ppStore().getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

function ppSetJSON(key, val) {
  ppStore().setItem(key, JSON.stringify(val));
}

/* ---------- Invoice state ---------- */

function ppNextInvoiceNumber() {
  var store = ppStore();
  var n = parseInt(store.getItem(PP_KEYS.counter) || "0", 10) + 1;
  store.setItem(PP_KEYS.counter, String(n));
  return "INV-" + ("0000" + n).slice(-4);
}

function ppReadInvoiceForm() {
  var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
  var items = [];
  document.querySelectorAll("#itemsTableBody tr").forEach(function (tr) {
    var desc = tr.querySelector(".it-desc").value.trim();
    var qty = ppNum(tr.querySelector(".it-qty").value, 0);
    var rate = ppNum(tr.querySelector(".it-rate").value, 0);
    items.push({ desc: desc, qty: qty, rate: rate });
  });
  return {
    bizName: val("bizName"), bizAddr: val("bizAddr"), logoUrl: val("logoUrl"),
    clientName: val("clientName"), clientAddr: val("clientAddr"), clientEmail: val("clientEmail"),
    invoiceNumber: val("invoiceNumber"),
    issueDate: val("issueDate"), dueDate: val("dueDate"),
    currency: val("currency") || "USD",
    items: items,
    discountPct: ppNum(val("discountPct"), 0),
    taxPct: ppNum(val("taxPct"), 0),
    notes: val("invoiceNotes"),
    payInstructions: val("payInstructions")
  };
}

function ppComputeInvoice(inv) {
  var subtotal = 0;
  inv.items.forEach(function (it) { subtotal += it.qty * it.rate; });
  var discountAmt = subtotal * (inv.discountPct / 100);
  var taxable = subtotal - discountAmt;
  var taxAmt = taxable * (inv.taxPct / 100);
  var total = taxable + taxAmt;
  return {
    subtotal: subtotal,
    discountAmt: discountAmt,
    taxAmt: taxAmt,
    total: total,
    items: inv.items.map(function (it) {
      return { desc: it.desc, qty: it.qty, rate: it.rate, line: it.qty * it.rate };
    })
  };
}

function ppFmtFormDate(iso) {
  if (!iso) return "—";
  var d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return ppFmtDateShort(d);
}

function ppRenderInvoice() {
  var inv = ppReadInvoiceForm();
  var calc = ppComputeInvoice(inv);
  var cur = inv.currency;

  var set = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text; };
  var setHtml = function (id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; };

  // business block
  set("ppBizName", inv.bizName || "Your Business Name");
  set("ppBizAddr", inv.bizAddr || "Your address\nyour@email.com");
  var logo = document.getElementById("ppLogo");
  if (logo) {
    if (inv.logoUrl) { logo.src = inv.logoUrl; logo.style.display = "block"; logo.onerror = function () { logo.style.display = "none"; }; }
    else { logo.removeAttribute("src"); logo.style.display = "none"; }
  }

  set("ppInvoiceNumber", inv.invoiceNumber || "INV-0001");
  set("ppIssueDate", ppFmtFormDate(inv.issueDate));
  set("ppDueDate", ppFmtFormDate(inv.dueDate));

  set("ppClientName", inv.clientName || "Client name");
  set("ppClientAddr", inv.clientAddr || "Client address");
  set("ppClientEmailLine", inv.clientEmail ? inv.clientEmail : "");

  // line items
  var rowsHtml = "";
  var any = false;
  calc.items.forEach(function (it, i) {
    if (it.desc || it.qty || it.rate) any = true;
    rowsHtml += "<tr>" +
      "<td>" + (it.desc ? String(it.desc).replace(/</g, "&lt;") : '<span class="pp-empty">Item description</span>') + "</td>" +
      '<td class="num">' + it.qty + "</td>" +
      '<td class="num">' + ppMoney(it.rate, cur) + "</td>" +
      '<td class="num">' + ppMoney(it.line, cur) + "</td>" +
      "</tr>";
  });
  if (!any) {
    rowsHtml = '<tr><td colspan="4" class="pp-empty">Add your first line item on the left — totals update live.</td></tr>';
  }
  setHtml("ppItemsBody", rowsHtml);

  // totals
  set("ppSubtotal", ppMoney(calc.subtotal, cur));
  var dRow = document.getElementById("ppDiscountRow");
  if (dRow) dRow.style.display = calc.discountAmt > 0 ? "flex" : "none";
  set("ppDiscount", "-" + ppMoney(calc.discountAmt, cur));
  var tRow = document.getElementById("ppTaxRow");
  if (tRow) tRow.style.display = calc.taxAmt > 0 ? "flex" : "none";
  set("ppTax", ppMoney(calc.taxAmt, cur));
  set("ppTotal", ppMoney(calc.total, cur));

  set("ppNotes", inv.notes || "");
  set("ppPayInstructions", inv.payInstructions || "");
  var notesBlock = document.getElementById("ppNotesBlock");
  if (notesBlock) notesBlock.style.display = (inv.notes || inv.payInstructions) ? "block" : "none";

  return { inv: inv, calc: calc };
}

/* ---------- Line items UI ---------- */

function ppAddItemRow(desc, qty, rate) {
  var tbody = document.getElementById("itemsTableBody");
  if (!tbody) return;
  var tr = document.createElement("tr");
  tr.innerHTML =
    '<td><input type="text" class="it-desc" placeholder="e.g. Homepage redesign — milestone 2" aria-label="Item description"></td>' +
    '<td><input type="number" class="it-qty" min="0" step="any" value="1" aria-label="Quantity" inputmode="decimal"></td>' +
    '<td><input type="number" class="it-rate" min="0" step="any" placeholder="0.00" aria-label="Rate" inputmode="decimal"></td>' +
    '<td class="item-total it-line">—</td>' +
    '<td><button type="button" class="rm-item" title="Remove item" aria-label="Remove item">✕</button></td>';
  if (desc !== undefined) tr.querySelector(".it-desc").value = desc;
  if (qty !== undefined) tr.querySelector(".it-qty").value = qty;
  if (rate !== undefined) tr.querySelector(".it-rate").value = rate;
  tbody.appendChild(tr);
  ppRecalcLines();
}

function ppRecalcLines() {
  var cur = (document.getElementById("currency") || {}).value || "USD";
  document.querySelectorAll("#itemsTableBody tr").forEach(function (tr) {
    var qty = ppNum(tr.querySelector(".it-qty").value, 0);
    var rate = ppNum(tr.querySelector(".it-rate").value, 0);
    tr.querySelector(".it-line").textContent = ppMoney(qty * rate, cur);
  });
}

/* ---------- Saved invoices ---------- */

function ppGetSaved() { return ppGetJSON(PP_KEYS.invoices, []); }
function ppSetSaved(list) { ppSetJSON(PP_KEYS.invoices, list); }

function ppSaveInvoice() {
  var inv = ppReadInvoiceForm();
  if (!inv.invoiceNumber) inv.invoiceNumber = ppNextInvoiceNumber();
  var list = ppGetSaved();
  var existing = -1;
  list.forEach(function (s, i) { if (s.invoiceNumber === inv.invoiceNumber) existing = i; });
  var record = { invoiceNumber: inv.invoiceNumber, savedAt: new Date().toISOString(), data: inv };
  if (existing >= 0) list[existing] = record; else list.unshift(record);
  ppSetSaved(list);
  ppRenderSaved();
  return record;
}

function ppRenderSaved() {
  var list = ppGetSaved();
  var box = document.getElementById("savedList");
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<div class="empty-note">No saved invoices yet. Click “Save invoice” to keep one in this browser.</div>';
    return;
  }
  box.innerHTML = "";
  list.forEach(function (rec) {
    var row = document.createElement("div");
    row.className = "saved-row";
    var label = rec.data.clientName || "Untitled client";
    var total = ppComputeInvoice(rec.data).total;
    row.innerHTML =
      '<div class="sr-main"><b>' + rec.invoiceNumber.replace(/</g, "&lt;") + " — " + label.replace(/</g, "&lt;") + "</b>" +
      "<span>" + ppMoney(total, rec.data.currency) + " · saved " + new Date(rec.savedAt).toLocaleDateString() + "</span></div>" +
      '<div class="sr-actions">' +
      '<button type="button" class="btn btn-sm btn-secondary sr-load">Load</button>' +
      '<button type="button" class="btn btn-sm btn-secondary sr-dup">Duplicate</button>' +
      '<button type="button" class="btn btn-sm btn-ghost sr-del" title="Delete">✕</button>' +
      "</div>";
    row.querySelector(".sr-load").addEventListener("click", function () { ppFillForm(rec.data); ppToast("Loaded " + rec.invoiceNumber); });
    row.querySelector(".sr-dup").addEventListener("click", function () {
      var copy = JSON.parse(JSON.stringify(rec.data));
      copy.invoiceNumber = ppNextInvoiceNumber();
      ppFillForm(copy);
      ppToast("Duplicated as " + copy.invoiceNumber);
    });
    row.querySelector(".sr-del").addEventListener("click", function () {
      ppSetSaved(ppGetSaved().filter(function (r) { return r.invoiceNumber !== rec.invoiceNumber; }));
      ppRenderSaved();
      ppToast("Deleted " + rec.invoiceNumber);
    });
    box.appendChild(row);
  });
}

function ppFillForm(inv) {
  var setV = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
  setV("bizName", inv.bizName); setV("bizAddr", inv.bizAddr); setV("logoUrl", inv.logoUrl || "");
  setV("clientName", inv.clientName); setV("clientAddr", inv.clientAddr); setV("clientEmail", inv.clientEmail || "");
  setV("invoiceNumber", inv.invoiceNumber); setV("issueDate", inv.issueDate); setV("dueDate", inv.dueDate);
  setV("currency", inv.currency || "USD"); setV("discountPct", inv.discountPct || 0); setV("taxPct", inv.taxPct || 0);
  setV("invoiceNotes", inv.notes || ""); setV("payInstructions", inv.payInstructions || "");
  var tbody = document.getElementById("itemsTableBody");
  tbody.innerHTML = "";
  (inv.items && inv.items.length ? inv.items : [{ desc: "", qty: 1, rate: 0 }]).forEach(function (it) {
    ppAddItemRow(it.desc, it.qty, it.rate);
  });
  ppRenderInvoice();
}

function ppNewInvoice() {
  var today = new Date();
  var due = ppAddDays(today, 14);
  var iso = function (d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  };
  ppFillForm({
    invoiceNumber: ppNextInvoiceNumber(),
    issueDate: iso(today), dueDate: iso(due),
    currency: (document.getElementById("currency") || {}).value || "USD",
    items: [{ desc: "", qty: 1, rate: 0 }],
    notes: "Thank you for your business!",
    bizName: "", bizAddr: "", logoUrl: "", clientName: "", clientAddr: "", clientEmail: "",
    discountPct: 0, taxPct: 0, payInstructions: ""
  });
}

/* ---------- Init (called from app.js once DOM is ready) ---------- */

function ppInitInvoiceBuilder() {
  var curSel = document.getElementById("currency");
  if (curSel && !curSel.options.length) {
    PP_CURRENCIES.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.code; o.textContent = c.label;
      curSel.appendChild(o);
    });
  }

  var addBtn = document.getElementById("addItemBtn");
  if (addBtn) addBtn.addEventListener("click", function () { ppAddItemRow(); ppRenderInvoice(); });

  var tbody = document.getElementById("itemsTableBody");
  if (tbody) {
    tbody.addEventListener("input", function () { ppRecalcLines(); ppRenderInvoice(); });
    tbody.addEventListener("click", function (e) {
      var btn = e.target.closest(".rm-item");
      if (!btn) return;
      var rows = tbody.querySelectorAll("tr");
      if (rows.length > 1) btn.closest("tr").remove();
      else { var tr = btn.closest("tr"); tr.querySelectorAll("input").forEach(function (i) { i.value = ""; }); tr.querySelector(".it-qty").value = "1"; }
      ppRecalcLines(); ppRenderInvoice();
    });
  }

  ["bizName", "bizAddr", "logoUrl", "clientName", "clientAddr", "clientEmail", "invoiceNumber",
   "issueDate", "dueDate", "currency", "discountPct", "taxPct", "invoiceNotes", "payInstructions"
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", ppRenderInvoice);
    if (el) el.addEventListener("change", function () { ppRecalcLines(); ppRenderInvoice(); });
  });

  var printBtn = document.getElementById("printBtn");
  if (printBtn) printBtn.addEventListener("click", function () {
    ppRenderInvoice();
    window.print();
  });

  var saveBtn = document.getElementById("saveInvoiceBtn");
  if (saveBtn) saveBtn.addEventListener("click", function () {
    var rec = ppSaveInvoice();
    ppToast("Saved " + rec.invoiceNumber + " to this browser");
  });

  var newBtn = document.getElementById("newInvoiceBtn");
  if (newBtn) newBtn.addEventListener("click", function () { ppNewInvoice(); ppToast("New invoice started"); });

  ppRenderSaved();
  // first run: fresh invoice with sensible defaults; otherwise restore last working state
  var last = ppGetJSON("pp_last_invoice", null);
  if (last) ppFillForm(last);
  else ppNewInvoice();

  // persist working state on change (session continuity)
  setInterval(function () {
    if (document.getElementById("bizName")) ppSetJSON("pp_last_invoice", ppReadInvoiceForm());
  }, 3000);
  window.addEventListener("beforeunload", function () {
    if (document.getElementById("bizName")) ppSetJSON("pp_last_invoice", ppReadInvoiceForm());
  });
}
