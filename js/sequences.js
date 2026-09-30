/* ============================================================
   PaidPrompt — sequences.js
   The paid value: a 5-stage escalating payment-chaser email
   library (friendly -> firm), a tone system (friendly/neutral/
   firm), date scheduling, license-key crypto (FNV-1a), and
   merge-field filling.
   No dependencies. Plain script.
   ============================================================ */

/* ---------- License key derivation (FNV-1a 32-bit) ---------- */

function ppNormalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function ppFnv1a32(str) {
  var h = 0x811c9dc5; // 2166136261
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime 16777619, via Math.imul to stay in int32 space
    h = Math.imul(h, 0x01000193);
    h = h >>> 0;
  }
  return h >>> 0;
}

function ppLicenseKeyForEmail(email) {
  var hex = ppFnv1a32("paidprompt-salt-v1" + ppNormalizeEmail(email)).toString(16).toUpperCase();
  while (hex.length < 8) hex = "0" + hex;
  return hex.slice(0, 4) + "-" + hex.slice(4, 8);
}

function ppValidateLicense(email, key) {
  var expected = ppLicenseKeyForEmail(email);
  var given = String(key || "").trim().toUpperCase().replace(/[^0-9A-F]/g, "");
  var exp = expected.replace("-", "");
  return given.length === 8 && given === exp;
}

/* ---------- Date helpers ---------- */

function ppAddDays(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ppFmtDate(date) {
  try {
    return date.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  } catch (e) {
    return date.toDateString();
  }
}

function ppFmtDateShort(date) {
  try {
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (e) {
    return date.toDateString();
  }
}

function ppIcsDate(date) {
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  return "" + date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate());
}

function ppTodayStart() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ---------- Merge fields ---------- */
/* Supported tokens: {first} {amount} {invoice} {due} {days} {me} {biz}
   {pay} {sig} {fee} {rate} {feeSentence} {finalDate} {feeStart}        */

function ppFill(tpl, ctx) {
  return String(tpl).replace(/\{(\w+)\}/g, function (m, key) {
    return (ctx[key] !== undefined && ctx[key] !== null) ? String(ctx[key]) : m;
  });
}

/* ---------- The 5-stage library ----------
   offset = days AFTER the due date. Tone adjusts phrasing.        */

var PP_STAGE_META = [
  { id: 1, offset: 1,  name: "Friendly nudge" },
  { id: 2, offset: 4,  name: "Gentle follow-up (invoice re-attached)" },
  { id: 3, offset: 10, name: "Clear request + late-fee mention" },
  { id: 4, offset: 20, name: "Formal final notice before the late fee applies" },
  { id: 5, offset: 35, name: "Firm escalation / work-pause notice" }
];

var PP_LIBRARY = {
  1: {
    friendly: {
      subject: "Just a friendly nudge — invoice {invoice} ({amount})",
      body:
"Hi {first},\n\n" +
"Hope your week is going well! Just a quick heads-up that invoice {invoice} for {amount} was due on {due} — it may have slipped through the cracks on your end.\n\n" +
"Invoice summary\n" +
"• Invoice: {invoice}\n" +
"• Amount due: {amount}\n" +
"• Due date: {due}\n" +
"{pay}\n" +
"If it's already scheduled, wonderful — please ignore this note. Otherwise, could you let me know when I can expect payment? A quick reply is all I need.\n\n" +
"Thanks so much,\n{me}{sig}"
    },
    neutral: {
      subject: "Invoice {invoice} — payment was due {due}",
      body:
"Hi {first},\n\n" +
"This is a quick reminder that invoice {invoice} for {amount} was due on {due} and is showing as unpaid on my end.\n\n" +
"Invoice summary\n" +
"• Invoice: {invoice}\n" +
"• Amount due: {amount}\n" +
"• Due date: {due}\n" +
"{pay}\n" +
"If payment has already been sent, thank you — please disregard this message. Otherwise, I'd appreciate an update on the expected payment date.\n\n" +
"Best regards,\n{me}{sig}"
    },
    firm: {
      subject: "Payment reminder: invoice {invoice} is due",
      body:
"Hi {first},\n\n" +
"Invoice {invoice} for {amount} was due on {due} and remains outstanding.\n\n" +
"Invoice summary\n" +
"• Invoice: {invoice}\n" +
"• Amount due: {amount}\n" +
"• Due date: {due}\n" +
"{pay}\n" +
"Please arrange payment at your earliest convenience, or reply with the exact date payment will be made.\n\n" +
"Regards,\n{me}{sig}"
    }
  },
  2: {
    friendly: {
      subject: "Following up on invoice {invoice} (copy attached)",
      body:
"Hi {first},\n\n" +
"Just following up on my note from earlier this week — invoice {invoice} for {amount} is still showing as outstanding. I've re-attached a copy of the invoice in case the original got buried under everything else.\n\n" +
"If everything looks good on your side, could you confirm that payment is on the way? And if something is holding it up — a PO number I'm missing, an approval that's still pending, a wrong billing contact — just tell me what you need and I'll turn it around today.\n\n" +
"Thanks so much,\n{me}{sig}"
    },
    neutral: {
      subject: "Second reminder: invoice {invoice} — {amount} outstanding",
      body:
"Hi {first},\n\n" +
"Following up on my previous email: invoice {invoice} for {amount}, due on {due}, remains open. A copy of the invoice is attached again for your records.\n\n" +
"Could you confirm the payment status, or share an expected payment date? If the invoice is being held in your approvals process, let me know what's needed from my side so we can clear it.\n\n" +
"Best regards,\n{me}{sig}"
    },
    firm: {
      subject: "Invoice {invoice} is now {days} days overdue",
      body:
"Hi {first},\n\n" +
"Invoice {invoice} for {amount} was due on {due} and is now {days} days overdue. A copy of the invoice is attached once more.\n\n" +
"Please confirm when payment will be made. If I haven't heard from you within 3 business days, I'll follow up again with next steps.\n\n" +
"Regards,\n{me}{sig}"
    }
  },
  3: {
    friendly: {
      subject: "Invoice {invoice} — {days} days past due",
      body:
"Hi {first},\n\n" +
"I wanted to flag that invoice {invoice} for {amount} is now {days} days past due, and I haven't yet received payment or an update. I know things get busy, so let me make this easy:\n\n" +
"• Amount due: {amount}\n" +
"• Due date: {due}\n" +
"• Days overdue: {days}\n" +
"{pay}\n" +
"{feeSentence}\n" +
"Could you reply with a payment date this week? If cash flow is tight right now, I'm open to a short payment plan — I just need to know where things stand rather than chasing quietly.\n\n" +
"Thank you,\n{me}{sig}"
    },
    neutral: {
      subject: "Action needed: invoice {invoice} is {days} days overdue",
      body:
"Hi {first},\n\n" +
"Invoice {invoice} for {amount} is now {days} days past its due date of {due}. Despite my earlier reminders, payment has not been received.\n\n" +
"• Amount due: {amount}\n" +
"• Due date: {due}\n" +
"• Days overdue: {days}\n" +
"{pay}\n" +
"{feeSentence}\n" +
"Please arrange payment within 5 business days, or reply with a specific payment date. If any part of this invoice is disputed, tell me now so we can resolve it directly.\n\n" +
"Best regards,\n{me}{sig}"
    },
    firm: {
      subject: "Overdue: invoice {invoice} — {days} days, payment required",
      body:
"Hi {first},\n\n" +
"Invoice {invoice} for {amount} is {days} days overdue, and my previous two reminders have gone unanswered. This is a formal request for payment.\n\n" +
"• Amount due: {amount}\n" +
"• Due date: {due}\n" +
"• Days overdue: {days}\n" +
"{pay}\n" +
"{feeSentence}\n" +
"Payment is required within 5 business days of this email. If the balance is not paid and no payment date is agreed in that window, I'll begin the escalation process set out in our agreement.\n\n" +
"Regards,\n{me}{sig}"
    }
  },
  4: {
    friendly: {
      subject: "Final notice: invoice {invoice} — late fee starts {feeStart}",
      body:
"Hi {first},\n\n" +
"This is a final friendly-notice before things get administrative: invoice {invoice} for {amount} is now {days} days overdue, and per our payment terms a late fee is scheduled to apply after {feeStart}.\n\n" +
"You can avoid the fee entirely by settling the balance by {finalDate}:\n\n" +
"• Amount due: {amount}\n" +
"• Pay-by date to avoid the late fee: {finalDate}\n" +
"{pay}\n" +
"{feeSentence}\n" +
"I'd much rather resolve this with a reply than a fee. If something is genuinely wrong — an issue with the work, an internal blocker — please tell me today.\n\n" +
"Thank you,\n{me}{sig}"
    },
    neutral: {
      subject: "FINAL NOTICE: invoice {invoice} — pay by {finalDate} to avoid late fee",
      body:
"Hi {first},\n\n" +
"This is a formal final notice for invoice {invoice} for {amount}, now {days} days past its due date of {due}.\n\n" +
"To avoid a late fee, payment must be received by {finalDate}.\n\n" +
"• Amount due: {amount}\n" +
"• Days overdue: {days}\n" +
"• Pay-by date: {finalDate}\n" +
"{pay}\n" +
"{feeSentence}\n" +
"If payment is not received by {finalDate}, the late fee will be added to the balance and further collection steps will follow. If this invoice is disputed, respond immediately with details.\n\n" +
"Regards,\n{me}{sig}"
    },
    firm: {
      subject: "FINAL NOTICE — invoice {invoice}: payment required by {finalDate}",
      body:
"Hi {first},\n\n" +
"Despite repeated reminders, invoice {invoice} for {amount} remains unpaid {days} days after its due date of {due}. This is my final notice before the account is escalated.\n\n" +
"Payment in full is required by {finalDate}. After that date:\n\n" +
"• A late fee will be added to the balance\n" +
"• All ongoing work and new bookings will be paused\n" +
"• The debt may be referred to a collections service\n" +
"{pay}\n" +
"{feeSentence}\n" +
"If there is a legitimate dispute or an obstacle on your side, reply today. Otherwise, please treat this as the final request for payment.\n\n" +
"Regards,\n{me}{sig}"
    }
  },
  5: {
    friendly: {
      subject: "Final attempt: invoice {invoice} — pausing work until settled",
      body:
"Hi {first},\n\n" +
"Invoice {invoice} for {amount} has now been outstanding for {days} days, and my earlier reminders haven't received a reply — so this is my last email before I have to take further steps.\n\n" +
"Regrettably, I am pausing all ongoing work for you and holding any new bookings until the balance is settled. The amount now due is {amount}{feeNote}.\n\n" +
"{feeSentence}\n" +
"If there's a real reason payment hasn't happened — a dispute, a cash-flow problem, a change of contact — reply and I will genuinely work with you on a plan. Otherwise, please treat this as a final request for payment within 7 days, after which the debt will be handed to a collections service and the late fee will continue to accrue.\n\n" +
"{me}{sig}"
    },
    neutral: {
      subject: "Escalation notice: invoice {invoice} — {days} days overdue",
      body:
"Hi {first},\n\n" +
"Invoice {invoice} for {amount} is {days} days overdue and remains unpaid despite four prior reminders, including a formal final notice dated {finalNoticeDate}.\n\n" +
"Effective immediately:\n\n" +
"• All work for your account is paused until the balance is settled\n" +
"• New bookings are on hold\n" +
"• The amount due is {amount}{feeNote}\n" +
"{feeSentence}\n" +
"If payment in full is not received within 7 days, this debt will be referred to a collections service and recorded accordingly. You can stop this today simply by settling the invoice or contacting me to agree a written payment plan.\n\n" +
"Regards,\n{me}{sig}"
    },
    firm: {
      subject: "FINAL DEMAND: invoice {invoice} — {days} days overdue",
      body:
"Hi {first},\n\n" +
"This is a final demand for invoice {invoice} for {amount}, which has been overdue for {days} days. Four prior reminders, including a final notice dated {finalNoticeDate}, have gone unanswered.\n\n" +
"As of today:\n\n" +
"• All work for your account is suspended\n" +
"• New engagements are refused until the balance is cleared\n" +
"• The total demanded is {amount}{feeNote}\n" +
"{feeSentence}\n" +
"Payment in full is required within 7 days of this email. Failing that, the debt will be passed to a collections agency and pursued through the terms of our agreement, and any applicable late fees will continue to accrue until settlement in full.\n\n" +
"If you believe this balance is genuinely in error, reply immediately with specifics. Otherwise, please arrange payment now.\n\n" +
"Regards,\n{me}{sig}"
    }
  }
};

/* ---------- Sequence builder ---------- */

/**
 * @param {Object} data
 *   invoiceNumber, clientFirst, clientEmail, amount (number),
 *   amountFmt (formatted string), dueDate (Date), freelancer (name),
 *   business, payInfo (string, optional), sigText (string, optional),
 *   lateFeeRate (percent per month, number, 0 = off)
 * @param {String} tone "friendly" | "neutral" | "firm"
 * @returns {Array} stages: {id, name, offset, date, dateFmt, subject, body, mailto}
 */
function ppBuildSequence(data, tone) {
  tone = PP_LIBRARY[1][tone] ? tone : "neutral";
  var due = data.dueDate;
  var today = ppTodayStart();
  var ctx = {
    first: data.clientFirst || "there",
    amount: data.amountFmt,
    invoice: data.invoiceNumber || "—",
    due: ppFmtDateShort(due),
    me: data.freelancer || "",
    biz: data.business || "",
    pay: data.payInfo ? "Payment details:\n" + data.payInfo + "\n" : "",
    sig: data.sigText ? "\n\n" + data.sigText : "",
    rate: data.lateFeeRate > 0 ? data.lateFeeRate : "",
    fee: data.lateFeeRate > 0 ? ppFeeForMonths(data.amount, data.lateFeeRate, 1) : ""
  };

  var feeStart = ppAddDays(due, PP_STAGE_META[3].offset); // day +20
  ctx.feeStart = ppFmtDateShort(feeStart);
  ctx.finalDate = ppFmtDateShort(ppAddDays(due, 27)); // one week after final notice
  var finalNoticeDate = ppFmtDateShort(ppAddDays(due, PP_STAGE_META[3].offset));

  return PP_STAGE_META.map(function (meta) {
    var variant = PP_LIBRARY[meta.id][tone];
    var stageCtx = Object.assign({}, ctx);
    stageCtx.days = meta.offset;

    // Stage-specific fee sentence (filled against ctx now, since it embeds its own tokens)
    if (data.lateFeeRate > 0) {
      var feeTpl = "";
      if (meta.id === 3) {
        feeTpl = "Per our payment terms, a late fee of {fee} ({rate}% per month) will begin to apply if the balance remains unpaid after {feeStart} — currently that would add {fee} in the first month alone.";
      } else if (meta.id === 4) {
        feeTpl = "The upcoming late fee is {fee} ({rate}% per month), and it keeps accruing every month the balance stays open.";
      } else if (meta.id === 5) {
        feeTpl = "The late fee ({rate}% per month) continues to accrue on the outstanding balance until it is paid in full.";
      }
      stageCtx.feeSentence = feeTpl ? ppFill(feeTpl, stageCtx) : "";
    } else {
      stageCtx.feeSentence = "";
    }

    if (meta.id === 5) {
      stageCtx.finalNoticeDate = finalNoticeDate;
      stageCtx.feeNote = data.lateFeeRate > 0 ? " plus the accrued late fee" : "";
    }

    var subject = ppFill(variant.subject, stageCtx);
    var body = ppFill(variant.body, stageCtx)
      .replace(/\n{3,}/g, "\n\n")              // collapse empty pay/fee blocks
      .trim();

    var date = ppAddDays(due, meta.offset);
    return {
      id: meta.id,
      name: meta.name,
      offset: meta.offset,
      date: date,
      dateFmt: ppFmtDate(date),
      dateShort: ppFmtDateShort(date),
      status: date.getTime() >= today.getTime() ? "Upcoming" : "Past due",
      subject: subject,
      body: body,
      mailto: ppMailto(data.clientEmail, subject, body)
    };
  });
}

function ppMailto(to, subject, body) {
  var parts = [];
  if (to) parts.push("mailto:" + encodeURIComponent(to.trim()));
  else parts.push("mailto:");
  parts.push("?subject=" + encodeURIComponent(subject));
  parts.push("&body=" + encodeURIComponent(body));
  return parts.join("");
}

/* ---------- Late fee calculator: amount x rate x months ---------- */

function ppFeeForMonths(amount, monthlyRatePct, months) {
  var fee = (Number(amount) || 0) * ((Number(monthlyRatePct) || 0) / 100) * (Number(months) || 0);
  return Math.round(fee * 100) / 100;
}

/* ---------- Exports ---------- */

function ppBuildIcs(stages, invoiceNumber, brandName) {
  brandName = brandName || "PaidPrompt";
  var now = new Date();
  var stamp = ppIcsDate(now) + "T" +
    ("0" + now.getHours()).slice(-2) + ("0" + now.getMinutes()).slice(-2) + "00Z";
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//" + brandName + "//Payment Chaser//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + brandName + " — payment reminders (invoice " + (invoiceNumber || "") + ")"
  ];
  stages.forEach(function (s, i) {
    var esc = function (t) {
      return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    };
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + ppIcsDate(s.date) + "-stage" + s.id + "-" + (invoiceNumber || "inv").replace(/[^\w-]/g, "") + "@paidprompt");
    lines.push("DTSTAMP:" + stamp);
    lines.push("DTSTART;VALUE=DATE:" + ppIcsDate(s.date));
    lines.push("DTEND;VALUE=DATE:" + ppIcsDate(ppAddDays(s.date, 1)));
    lines.push("SUMMARY:" + esc("Send stage " + s.id + " — " + s.name + " (invoice " + (invoiceNumber || "") + ")"));
    lines.push("DESCRIPTION:" + esc("Subject: " + s.subject + "\n\nOpen PaidPrompt, copy the stage " + s.id + " email and send it."));
    lines.push("BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:" + esc("Payment chaser: stage " + s.id + " due today"), "END:VALARM");
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function ppBuildCsv(stages, data) {
  var esc = function (v) {
    v = String(v === undefined || v === null ? "" : v);
    return '"' + v.replace(/"/g, '""') + '"';
  };
  var rows = [
    ["Invoice", "Client", "Amount", "Due date", "Stage", "Stage name", "Send date", "Status", "Subject", "Tone"]
  ];
  stages.forEach(function (s) {
    rows.push([
      data.invoiceNumber || "",
      data.clientFirst || "",
      data.amountFmt || "",
      ppFmtDateShort(data.dueDate),
      s.id,
      s.name,
      s.dateShort,
      s.status,
      s.subject,
      data.tone || ""
    ]);
  });
  return rows.map(function (r) { return r.map(esc).join(","); }).join("\r\n");
}
