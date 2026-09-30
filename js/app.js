/* ============================================================
   PaidPrompt — app.js
   Tabs, monetization gate + license unlock modal, ?demo=1,
   payment chaser UI (sequence render, copy, mailto, ics/csv
   exports, late-fee calculator), Stripe link wiring, misc UI.
   Depends on: config.js, sequences.js, invoice.js. Plain script.
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- utilities ---------------- */

  function $(id) { return document.getElementById(id); }

  var toastTimer = null;
  window.ppToast = function (msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  };

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); window.ppToast(okMsg || "Copied"); }
      catch (e) { window.ppToast("Copy failed — select the text manually"); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { window.ppToast(okMsg || "Copied"); }, fallback);
    } else fallback();
  }
  window.ppCopyText = copyText;

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  window.ppDownload = download;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------- monetization gate ---------------- */

  function demoActive() {
    var until = parseInt(ppStore().getItem(PP_KEYS.demo) || "0", 10);
    return until > Date.now();
  }

  function licenseStored() {
    var lic = ppGetJSON(PP_KEYS.license, null);
    if (!lic || !lic.email || !lic.key) return false;
    return ppValidateLicense(lic.email, lic.key); // re-verify integrity on every load
  }

  function isUnlocked() { return licenseStored() || demoActive(); }

  function activateDemo() {
    ppStore().setItem(PP_KEYS.demo, String(Date.now() + (SITE_CONFIG.demoHours || 24) * 3600 * 1000));
  }

  /* ---------------- tabs ---------------- */

  function initTabs() {
    var btns = document.querySelectorAll(".tab-btn");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () { selectTab(btn.getAttribute("data-tab")); });
    });
  }

  function selectTab(name) {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      var on = b.getAttribute("data-tab") === name;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.setAttribute("tabindex", on ? "0" : "-1");
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
  }
  window.ppSelectTab = selectTab;

  /* ---------------- chaser ---------------- */

  var currentStages = [];
  var currentData = null;

  function readChaserForm() {
    var val = function (id) { var el = $(id); return el ? el.value.trim() : ""; };
    var toneEl = document.querySelector('input[name="tone"]:checked');
    var amount = ppNum(val("chAmount"), 0);
    var dueIso = val("chDueDate");
    var dueDate = dueIso ? new Date(dueIso + "T00:00:00") : ppTodayStart();
    if (isNaN(dueDate.getTime())) dueDate = ppTodayStart();
    var rate = ppNum(val("chLateFeeRate"), 0);
    return {
      invoiceNumber: val("chInvoiceNumber") || "INV-0001",
      clientFirst: val("chClientFirst") || "there",
      clientEmail: val("chClientEmail"),
      amount: amount,
      amountFmt: ppMoney(amount, val("chCurrency") || "USD"),
      dueDate: dueDate,
      freelancer: val("chFreelancer") || "—",
      business: val("chBusiness") || "",
      payInfo: val("chPayInfo") || "",
      lateFeeRate: rate,
      tone: toneEl ? toneEl.value : "neutral"
    };
  }

  function generateChaser(silent) {
    currentData = readChaserForm();
    currentStages = ppBuildSequence(currentData, currentData.tone);
    ppSetJSON(PP_KEYS.tone, currentData.tone);
    renderStages();
    renderSchedule();
    renderLateFee();
    if (!silent) ppToast("5-stage sequence generated");
  }

  function renderStages() {
    var box = $("stageList");
    if (!box) return;
    if (!currentStages.length) { box.innerHTML = ""; return; }
    var unlocked = isUnlocked();
    box.innerHTML = "";
    currentStages.forEach(function (s) {
      var locked = !unlocked && s.id > 1;
      var card = document.createElement("article");
      card.className = "stage-card" + (locked ? " stage-locked" : "");
      var statusCls = s.status === "Upcoming" ? "upcoming" : "past";
      var actionsHtml = locked ? "" :
        '<div class="stage-actions">' +
        '<button type="button" class="btn btn-sm btn-primary st-copy">Copy email</button>' +
        '<a class="btn btn-sm btn-secondary" href="' + esc(s.mailto) + '">Open in email app</a>' +
        "</div>";
      card.innerHTML =
        '<div class="stage-head">' +
        '<div class="stage-dot s' + s.id + '">' + s.id + "</div>" +
        '<div><div class="st-name">' + esc(s.name) + "</div>" +
        '<div class="st-date">Send on ' + esc(s.dateFmt) + " · " + s.offset + " day" + (s.offset === 1 ? "" : "s") + " after due date</div></div>" +
        '<span class="st-status ' + statusCls + '">' + esc(s.status) + "</span>" +
        "</div>" +
        '<div class="stage-body">' +
        '<div class="email-subject">Subject: ' + esc(s.subject) + "</div>" +
        '<div class="email-body">' + esc(s.body) + "</div>" +
        actionsHtml + "</div>";
      if (locked) {
        card.querySelector(".stage-body").insertAdjacentHTML("beforeend",
          '<div class="lock-overlay"><span class="lock-chip">🔒 Locked — stage ' + s.id + " of 5</span></div>");
      } else {
        card.querySelector(".st-copy").addEventListener("click", function () {
          copyText("Subject: " + s.subject + "\n\n" + s.body, "Stage " + s.id + " email copied");
        });
      }
      box.appendChild(card);
    });

    var upsell = $("upsellCard");
    if (upsell) upsell.style.display = unlocked ? "none" : "block";
    var toolbar = $("seqToolbar");
    if (toolbar) toolbar.style.display = unlocked ? "flex" : "none";
    var scheduleWrap = $("scheduleWrap");
    if (scheduleWrap) scheduleWrap.style.display = unlocked ? "block" : "none";
  }

  function renderSchedule() {
    var wrap = $("scheduleBody");
    if (!wrap || !currentStages.length) return;
    wrap.innerHTML = "";
    currentStages.forEach(function (s) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="num">' + esc(s.dateShort) + "</td>" +
        "<td>Stage " + s.id + " — " + esc(s.name) + "</td>" +
        "<td>" + esc(s.status) + "</td>";
      wrap.appendChild(tr);
    });
    $("icsBtn").onclick = function () {
      if (!isUnlocked()) { openModal(); return; }
      download("paidprompt-reminders-" + (currentData.invoiceNumber || "invoice") + ".ics",
        ppBuildIcs(currentStages, currentData.invoiceNumber, SITE_CONFIG.brandName),
        "text/calendar;charset=utf-8");
      ppToast("Calendar file downloaded");
    };
    $("csvBtn").onclick = function () {
      if (!isUnlocked()) { openModal(); return; }
      var data = Object.assign({}, currentData, { tone: currentData.tone });
      download("paidprompt-schedule-" + (currentData.invoiceNumber || "invoice") + ".csv",
        ppBuildCsv(currentStages, data), "text/csv;charset=utf-8");
      ppToast("Schedule CSV downloaded");
    };
  }

  function renderLateFee() {
    var box = $("lateFeeResult");
    if (!box || !currentData) return;
    var cur = ($("chCurrency") || {}).value || "USD";
    var months = ppNum(($("lfMonths") || {}).value, 1);
    var fee = ppFeeForMonths(currentData.amount, currentData.lateFeeRate, months);
    var total = currentData.amount + fee;
    box.innerHTML =
      "<div>Late fee after " + months + " month" + (months === 1 ? "" : "s") + ": <span class=\"latefee-result\">" +
      esc(ppMoney(fee, cur)) + "</span></div>" +
      "<div style=\"font-size:.85rem;color:var(--muted)\">Total owed with fee: " +
      esc(ppMoney(total, cur)) +
      (currentData.lateFeeRate > 0 ? " · rate " + currentData.lateFeeRate + "% per month" : " · set a monthly rate above to include fees in the emails") + "</div>";
  }

  /* ---------------- unlock modal ---------------- */

  function openModal() {
    var m = $("unlockModal");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    var first = $("licEmail");
    if (first) first.focus();
  }

  function closeModal() {
    var m = $("unlockModal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
    var err = $("licError");
    if (err) err.classList.remove("show");
    var success = $("licSuccess");
    var form = $("licForm");
    if (success) success.style.display = "none";
    if (form) form.style.display = "block";
  }

  function initModal() {
    document.querySelectorAll("[data-open-unlock]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); openModal(); });
    });
    var backdrop = $("unlockModal");
    if (backdrop) {
      backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModal(); });
    }
    var closeBtn = $("modalClose");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    var form = $("licForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = $("licEmail").value;
        var key = $("licKey").value;
        var err = $("licError");
        if (!email || email.indexOf("@") < 1) {
          err.textContent = "Enter the email address you paid with.";
          err.classList.add("show");
          return;
        }
        if (!ppValidateLicense(email, key)) {
          err.textContent = "That key doesn't match this email. Check for typos (keys look like AB12-CD34), or reply to your receipt for help.";
          err.classList.add("show");
          return;
        }
        ppSetJSON(PP_KEYS.license, { email: ppNormalizeEmail(email), key: ppLicenseKeyForEmail(email), at: new Date().toISOString() });
        err.classList.remove("show");
        form.style.display = "none";
        var ok = $("licSuccess");
        ok.style.display = "block";
        renderStages();
        renderSchedule();
        updateGateUi();
        ppToast("Unlocked — all 5 stages are yours, forever");
      });
    }

    var doneBtn = $("licDone");
    if (doneBtn) doneBtn.addEventListener("click", closeModal);
  }

  function updateGateUi() {
    var unlocked = isUnlocked();
    var navBtn = $("navUnlock");
    if (navBtn) {
      navBtn.textContent = unlocked ? "Lifetime access ✓" : "Unlock — " + SITE_CONFIG.price + " lifetime";
    }
    var heroNote = $("heroGateNote");
    if (heroNote && unlocked) heroNote.innerHTML = "Lifetime access active on this browser — all 5 chaser stages unlocked.";
  }

  /* ---------------- stripe / pricing wiring ---------------- */

  function wireStripeLinks() {
    var link = SITE_CONFIG.stripePaymentLink || "";
    var isConfigured = link && link.indexOf("PASTE_YOUR") !== 0 && link.indexOf("http") === 0;
    document.querySelectorAll("[data-buy]").forEach(function (el) {
      if (isConfigured) {
        el.setAttribute("href", link);
        if (el.tagName === "A") {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener");
        } else {
          el.addEventListener("click", function () { window.open(link, "_blank", "noopener"); });
        }
      } else {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          // Owner hasn't pasted a Stripe link yet — demo unlock keeps the product usable.
          activateDemo();
          renderStages(); renderSchedule(); updateGateUi();
          window.ppToast("Demo mode: full access for " + (SITE_CONFIG.demoHours || 24) + " hours (owner: set stripePaymentLink in js/config.js)");
          closeModal();
        });
      }
    });
  }

  /* ---------------- misc landing interactions ---------------- */

  function wireCtaButtons() {
    document.querySelectorAll("[data-goto-tool]").forEach(function (el) {
      el.addEventListener("click", function () {
        var tab = el.getAttribute("data-goto-tool");
        selectTab(tab === "chaser" ? "chaser" : "invoice");
        var tool = $("tool");
        if (tool) tool.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function wireChaserDefaults() {
    var invLink = $("chFromInvoice");
    if (invLink) {
      invLink.addEventListener("click", function () {
        var inv = ppReadInvoiceForm();
        var set = function (id, v) { var el = $(id); if (el) el.value = v; };
        set("chInvoiceNumber", inv.invoiceNumber);
        set("chAmount", ppComputeInvoice(inv).total.toFixed(2));
        set("chCurrency", inv.currency);
        set("chClientFirst", (inv.clientName || "").split(" ")[0]);
        set("chClientEmail", inv.clientEmail || "");
        set("chBusiness", inv.bizName || "");
        set("chPayInfo", inv.payInstructions || "");
        if (inv.dueDate) set("chDueDate", invDueIso(inv.dueDate));
        ppToast("Pulled details from the invoice builder");
      });
    }
    function invDueIso(iso) { return iso; }

    var sig = $("chSignature");
    if (sig) {
      sig.value = ppStore().getItem(PP_KEYS.signature) || "";
      sig.addEventListener("input", function () {
        ppStore().setItem(PP_KEYS.signature, sig.value);
      });
    }

    var tone = ppGetJSON(PP_KEYS.tone, null);
    if (tone && typeof tone === "string") {
      var r = document.querySelector('input[name="tone"][value="' + tone + '"]');
      if (r) r.checked = true;
    }

    // default due date: yesterday (common case when someone arrives late)
    var due = $("chDueDate");
    if (due && !due.value) {
      var y = ppAddDays(ppTodayStart(), -1);
      due.value = y.getFullYear() + "-" + ("0" + (y.getMonth() + 1)).slice(-2) + "-" + ("0" + y.getDate()).slice(-2);
    }

    var lfMonths = $("lfMonths");
    if (lfMonths) lfMonths.addEventListener("input", renderLateFee);

    var genBtn = $("generateBtn");
    if (genBtn) genBtn.addEventListener("click", generateChaser);

    var printSeqBtn = $("printScheduleBtn");
    if (printSeqBtn) printSeqBtn.addEventListener("click", function () {
      document.body.classList.add("print-schedule");
      var done = function () {
        document.body.classList.remove("print-schedule");
        window.removeEventListener("afterprint", done);
      };
      window.addEventListener("afterprint", done);
      window.print();
      setTimeout(done, 2000); // fallback if afterprint never fires
    });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    // ?demo=1 -> 24h full access
    if (window.location.search.indexOf("demo=1") !== -1) {
      activateDemo();
      try {
        var url = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, url);
      } catch (e) { /* file:// etc. */ }
    }

    initTabs();
    initModal();
    wireStripeLinks();
    wireCtaButtons();
    wireChaserDefaults();
    ppInitInvoiceBuilder();
    updateGateUi();
    renderLateFee(); // no-op until data exists

    // auto-generate a sequence so the chaser tab is never empty
    generateChaser(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
