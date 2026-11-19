// Free next-step checks on 7 guides: the reader's answers in, their stage, real dates and one next step out.
// Nothing leaves the browser. Every rule and number comes from that guide's own page (the RBI guide has its own rbi-check.js).
// Tests: node test/checks.test.js
(function () {
  var DAY = 86400000;
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return new Date(t).toISOString().slice(0, 10) === s ? t : null; // rejects 2026-02-30
  }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(t, n) { return t + n * DAY; }
  function addMonths(t, n) { // clamps to the month's end: 31 January + 1 month = 28 February
    var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
    return Date.UTC(y, m, Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate()));
  }
  function human(t) { var d = new Date(t); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function days(d) { return d === 1 ? "1 day" : d + " days"; }
  function between(a, b) { return Math.round((b - a) / DAY); }
  function out(stage, text, offer) { return { stage: stage, text: text, offer: !!offer }; }
  var MISSING = out("missing", "Add the dates the check asks for.");
  var INVALID = out("invalid", "Check the dates: none of them can be after today, and they have to be in the order things happened.");
  // A required date: the time, or MISSING / INVALID. `after` = an earlier step it can't come before.
  function date(v, now, after) {
    if (!v) return MISSING;
    var t = parse(v);
    return t === null || t > now || (after !== undefined && t < after) ? INVALID : t;
  }
  function bad(x) { return typeof x === "object"; }
  function list(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }

  // RB-IOS 2026, as the recovery and cyber guides state it: 30 days for the bank, then 90 days.
  function ombud(got, replied, now) {
    var end30 = addDays(got, 30);
    var opens = replied === null ? end30 : Math.min(replied, end30);
    var last = addDays(replied === null ? end30 : Math.max(end30, replied), 90);
    if (now < opens) return { stage: "early", opens: opens, last: last, days: between(now, opens) };
    if (now <= last) return { stage: "open", opens: opens, last: last, days: between(now, last) };
    return { stage: "late", opens: opens, last: last };
  }
  function ombudText(o) {
    if (o.stage === "early") return "If they don't sort it, you can go to the RBI Ombudsman from " + human(o.opens) + " (" + days(o.days) + " from today), and your last day is " + human(o.last) + ".";
    if (o.stage === "open") return o.days === 0 ? "You can file with the RBI Ombudsman now at cms.rbi.org.in, and today is your last day."
      : "You can file with the RBI Ombudsman now at cms.rbi.org.in. It's free and you don't need a lawyer. Your last day is " + human(o.last) + ", " + days(o.days) + " from today.";
    return "Your 90 days to go to the RBI Ombudsman ended on " + human(o.last) + ".";
  }

  var CHECKS = {};

  CHECKS["recovery-agents"] = function (a, today) {
    var now = parse(today), did = a.did || [];
    var crime = did.indexOf("crime") >= 0;
    var CRIME = "Threats of violence, extortion or morphed photos are crimes: go to the police, and for anything online, 1930 or cybercrime.gov.in. ";
    if (a.lender === "app") return out("app", (crime ? CRIME : "") + "A loan app with no bank or NBFC behind it isn't RBI regulated at all, so the RBI route doesn't apply. Report it on cybercrime.gov.in and on RBI's sachet.rbi.org.in.");
    var RULES = { crime: "intimidating or harassing you", early_late: "calling before 8 am or after 7 pm", repeat: "calling again and again",
      family: "intruding on the privacy of your family, referees and friends", public: "humiliating you in public",
      messages: "sending inappropriate messages by phone or social media", threats: "threatening or anonymous calls",
      fake: "false or misleading statements, like a fake legal notice or a threat of arrest" };
    var broken = Object.keys(RULES).filter(function (k) { return did.indexOf(k) >= 0; }).map(function (k) { return RULES[k]; });
    if (!broken.length) return out("pick", "Tick what they did, and the check names the RBI rule it breaks.");
    var head = (crime ? CRIME : "") + "What you describe breaks RBI's rules for lenders and their agents: " + list(broken) + ". ";
    if (a.wrote === "no") return out("write", head + "Next step: write to the grievance redressal officer (named on the lender's website). Name the agency, attach your call log and screenshots, quote the rule they broke" +
      (a.lender === "bank" ? ", and ask for the agency to be withdrawn from your account while your complaint is looked at" : "") +
      ". Keep the complaint number. If they get it today and don't sort it, you can go to the RBI Ombudsman from " + human(addDays(now, 30)) + ".", true);
    var got = date(a.received, now);
    if (bad(got)) return got;
    if (a.reply === "happy") return out("resolved", "Then there's nothing to file. Keep your call log in case the calls start again.");
    var replied = null;
    if (a.reply === "unhappy") { replied = date(a.replyDate, now, got); if (bad(replied)) return replied; }
    var o = ombud(got, replied, now);
    return out(o.stage, head + (o.stage === "early" ? "Keep logging every call. " : "") + ombudText(o), o.stage !== "late");
  };

  CHECKS["refund-stuck"] = function (a, today) {
    var now = parse(today);
    if (a.where === "sent") return out("sent", "Ask the site for the refund's reference number (ARN or RRN) and give it to your bank. That one number ends most \"we sent it\" arguments.");
    if (a.wrote === "yes") {
      var w = date(a.wroteDate, now);
      if (bad(w)) return w;
      var due = addMonths(w, 1);
      if (now <= due) return out("wait", "Under the Consumer Protection (E-Commerce) Rules, 2020, they have until " + human(due) + " to resolve it, one month from your complaint. If that passes with no refund, the next step is the National Consumer Helpline: call 1915, use WhatsApp, or file on consumerhelpline.gov.in.", true);
      return out("escalate", "Their month ran out on " + human(due) + ". Next: the National Consumer Helpline, which is free: call 1915, use WhatsApp, or file on consumerhelpline.gov.in. If that doesn't end it, file on e-Daakhil (edaakhil.nic.in) with no lawyer. You have 2 years from the problem.", true);
    }
    var p = date(a.pickup, now);
    if (bad(p)) return p;
    var fair = addDays(p, 21);
    if (now < fair) return out("early", "Once a return is picked up and checked, refunds to cards and UPI usually take 5 to 7 working days, and the bank can add a few more. Three weeks after pickup, " + human(fair) + ", is a fair point to stop waiting and write to the grievance officer.");
    return out("write", "Write to the site's grievance officer today, not the chatbot: their name and email are at the bottom of the site or in the app's help or legal section. Copy customer care. Under the Consumer Protection (E-Commerce) Rules, 2020, they have to acknowledge it within 48 hours and resolve it within one month: if they get it today, by " + human(addMonths(now, 1)) + ".", true);
  };

  CHECKS["client-not-paying"] = function (a, today) {
    var now = parse(today);
    var remind = "a written reminder (email, not a call) that attaches the invoice, says the date it was due, and gives a new date: 7 days is fair, so " + human(addDays(now, 7)) + ".";
    if (a.where === "abroad") return out("abroad", "The MSME law doesn't reach a client abroad, so your protection is the contract itself. Next step: " + remind + " On a platform like Upwork or Fiverr, its dispute process is your court.", true);
    if (a.udyam === "no") return out("unregistered", "The MSME law's payment protection doesn't reach back to work agreed before you registered, so for this invoice the contract is what you have. Next step: " + remind + " Then register on Udyam (free, at udyamregistration.gov.in) before you sign the next contract.", true);
    var acc = date(a.accepted, now);
    if (bad(acc)) return acc;
    var agreed = a.agreedDays === "" || a.agreedDays === undefined ? null : /^\d+$/.test(a.agreedDays) ? +a.agreedDays : NaN;
    if (agreed !== null && !(agreed >= 0)) return INVALID;
    var due = addDays(acc, agreed === null ? 15 : Math.min(agreed, 45));
    var rule = agreed === null ? "With nothing agreed, section 15 of the MSMED Act gives them 15 days from acceptance. "
      : agreed > 45 ? "Your agreed period is longer than the law allows: section 15 of the MSMED Act caps it at 45 days from acceptance. " : "";
    if (now <= due) return out("notdue", rule + "Payment is due by " + human(due) + ". Until then there's nothing to chase.");
    return out("overdue", rule + "It's " + days(between(due, now)) + " overdue: " + (agreed === null ? "" : "under section 15 of the MSMED Act ") + "it was due on " + human(due) +
      ". From then, section 16 makes them owe compound interest, with monthly rests, at three times the bank rate notified by RBI, whatever the contract says. Next step: " + remind +
      (now > addDays(acc, 45) ? " Mention section 43B(h): if they pay you after the 45 day limit, they can't claim it as an expense in their tax return until they actually pay." : "") +
      " If that fails, file on MSME Samadhaan (samadhaan.msme.gov.in).", true);
  };

  CHECKS["health-insurance-claim"] = function (a, today) {
    var now = parse(today), big = a.big === "yes", why;
    if (a.what === "ped") {
      if (a.years === "5plus") why = "After 60 months of continuous cover, an insurer can't reject a claim for non-disclosure, a pre-existing disease included, except for proven fraud. This rejection is very likely wrong. Collect every year's policy schedule to prove the continuity.";
      else if (a.years === "3to5") why = "IRDAI's rules from 2024 cap the waiting period for pre-existing diseases at 3 years, and your cover has run longer than that without a break, so a waiting period rejection looks wrong. Collect every year's policy schedule to prove the continuity.";
      else if (a.years === "lt3") why = "IRDAI's rules cap the waiting period for pre-existing diseases at 3 years, and your cover is younger than that, so ask for the exact clause in writing and check it.";
      else return MISSING;
    } else why = "Ask for the reason in writing, with the exact clause: \"as per policy terms\" isn't an answer." +
      (a.what === "cut" ? " The usual reasons are a room rent cap, a sub-limit or co-payment, or items the policy lists as not covered. Some are real, some are applied wrongly." : "");
    var BIG = " Above ₹50 lakh, the Insurance Ombudsman can't take it (it hears claims up to ₹50 lakh): after the insurer, the route is the consumer commission, on e-Daakhil.";
    var head = why + (big ? BIG : "") + " ";
    if (a.wrote === "no") return out("write", head + "Next step: write to the insurer's grievance officer, quoting the clause they used and the rule that answers it, and keep the acknowledgement. A reply is due in about 14 days." +
      (big ? "" : " If they reject it or don't reply within 30 days, the Insurance Ombudsman opens: if they get it today, from " + human(addDays(now, 30)) + "."), true);
    var sent = date(a.sent, now);
    if (bad(sent)) return sent;
    if (a.reply === "happy") return out("resolved", "Then you're done. Keep the folder: every year's policy schedule, the claim forms, the discharge summary, the final bill and their letter.");
    if (a.reply === "unhappy") {
      var r = date(a.replyDate, now, sent);
      if (bad(r)) return r;
      if (big) return out("commission", head + "File with the consumer commission on e-Daakhil.", true);
      var last = addMonths(r, 12);
      if (now <= last) return out("open", head + "You can go to the Insurance Ombudsman now at cioins.co.in. It's free and you don't need a lawyer. Your last day is " + human(last) + ", one year from their final reply.", true);
      return out("late", head + "Your year to go to the Insurance Ombudsman ended on " + human(last) + ", one year from their final reply. The other route is the consumer commission, on e-Daakhil.");
    }
    var opens = addDays(sent, 30);
    if (now < opens) return out("wait", head + "A reply is due in about 14 days, so around " + human(addDays(sent, 14)) + ". Meanwhile you can also complain on Bima Bharosa (bimabharosa.irdai.gov.in, toll free 155255)." +
      (big ? "" : " If there's no reply by " + human(opens) + ", you can go to the Insurance Ombudsman at cioins.co.in."), true);
    return out("open", head + (big ? "They've had 30 days without a reply. File with the consumer commission on e-Daakhil."
      : "They've had 30 days without a reply, so you can go to the Insurance Ombudsman now at cioins.co.in. It's free and you don't need a lawyer."), true);
  };

  CHECKS["rent-agreement-deposit"] = function (a, today) {
    var now = parse(today), mh = a.place === "mumbai" || a.place === "maharashtra";
    if (a.stage === "sign") return out("sign", "Before you sign, look for three lines. A deposit \"forfeited\" if you leave early: ask to replace it with rent for the remaining lock-in period or one month's rent, whichever is lower. Painting or cleaning deducted whatever the condition: limit it to damage beyond normal wear and tear. And no return date: write one in, say 15 days after you hand over the keys, with an itemised list and bills for any deduction." +
      (a.place === "mta" && a.deposit === "gt2" ? " Your state adopted the Model Tenancy Act, which caps a residential deposit at 2 months' rent, and this one is above it." : "") +
      (mh ? " In Maharashtra, every leave and licence agreement has to be in writing and registered, whatever its length, and that's the landlord's duty: ask." : ""), true);
    if (a.asked !== "yes") return out("ask", "Ask in writing today, by email or WhatsApp so there's a record, for the full deposit or an itemised list with bills, and give a date: say 15 days, " + human(addDays(now, 15)) + ".", true);
    var where = a.place === "mta" ? "the Rent Authority or Rent Court" : a.place === "mumbai" ? "the Small Causes Court in Mumbai"
      : a.place === "maharashtra" ? "a civil suit for recovery of money"
      : "a civil suit for recovery of money (or the Rent Authority or Rent Court, if your state or union territory adopted the Model Tenancy Act)";
    return out("file", "No answer by your date? A lawyer's legal notice costs a few thousand rupees, and many landlords pay at this stage. If they still don't, file: " + where + ". Consumer commissions generally don't hear landlord and tenant deposit disputes.");
  };

  CHECKS["resume-format"] = function (a) {
    if (!a.exp) return out("missing", "Pick your experience first.");
    var has = a.has || [], fix = [];
    if (a.pdf === "no") fix.push("Send it as a PDF.");
    if (a.exp !== "senior" && a.pages !== "1") fix.push("Cut it to one page: under 10 years of relevant experience, one page is the rule.");
    if (a.exp === "senior" && a.pages === "3") fix.push("Cut it to two pages at most.");
    fix.push(a.exp === "fresher" ? "Lead with education, then internships, projects and work." : "Lead with work experience, most recent first, and move education to the end.");
    var OFF = { photo: "a photo", personal: "date of birth, marital status, religion or father's name", address: "your full home address (your city is plenty)", ctc: "your CTC",
      objective: "the career objective", references: "the references line", declaration: "the declaration" };
    var off = Object.keys(OFF).filter(function (k) { return has.indexOf(k) >= 0; }).map(function (k) { return OFF[k]; });
    if (off.length) fix.push("Take off " + list(off) + ", unless the employer or the form asks.");
    if (has.indexOf("columns") >= 0) fix.push("Do the 30 second check: open your PDF, select everything, copy it and paste it into a plain notes app. If it comes out jumbled, move to a single column with plain headings.");
    fix.push("Then write each bullet as a result: \"Accomplished [X] as measured by [Y] by doing [Z]\".");
    return out("fixes", fix.join(" "), true);
  };

  CHECKS["cyber-crime-complaint"] = function (a, today) {
    var now = parse(today);
    var left = date(a.left, now);
    if (bad(left)) return left;
    var NEW = "For fraud on or after 1 January 2027, the zero liability window is 5 calendar days from the fraud.";
    var isNew = left >= Date.UTC(2027, 0, 1), s = [];
    if (a.how === "sent") s.push("RBI's liability rules usually don't cover money you sent yourself, so the 1930 call is what matters: it's the step that can freeze the money in the account it went to." +
      (a.called === "no" ? " Call 1930 today: it's free, any time. Then add the details on cybercrime.gov.in with the 14 digit number from the SMS." : ""));
    else if (a.called === "no") s.push("Call 1930 today if you haven't: it's free, any time, and it alerts the banks your money passed through. Then add the details on cybercrime.gov.in with the 14 digit number from the SMS.");
    if (a.told === "no") {
      s.push(a.how === "sent" ? "Tell your bank in writing today too, and get a complaint number."
        : a.how === "otp" ? (isNew ? "Tell your bank in writing today, even if you think it's your fault, and get a complaint number."
          : "Tell your bank in writing today, even if you think it's your fault: the bank treats a shared OTP, PIN or card details as your negligence, so you carry the loss until you report it, and the bank carries every rupee lost after that.")
        : isNew ? "Tell your bank in writing today, and get a complaint number. " + NEW
        : "Tell your bank in writing today, and get a complaint number. If the fault was neither yours nor the bank's, reporting within 3 working days of the bank's alert can make your liability zero; within 4 to 7 working days your loss is capped, depending on your account or card type; after 7 working days, the bank's own policy decides.");
      return out("tell", s.join(" "), true);
    }
    var told = date(a.toldDate, now, left);
    if (bad(told)) return told;
    if (a.reply === "happy") return out("resolved", "Then keep every reference number, from 1930 and from the bank, in case the problem returns.");
    if (a.how === "unauth" && isNew) s.push(NEW);
    else if (a.how !== "sent" && !isNew) {
      if (a.how === "otp") s.push("You carry the loss until the day you reported it, and the bank carries every rupee lost after that.");
      else s.push((between(left, told) <= 3 ? "You told the bank within 3 days of the money leaving, inside the 3 working day window: if the fault was neither yours nor the bank's, your liability can be zero."
        : "Under RBI's rules, if the fault was neither yours nor the bank's, reporting within 3 working days of the bank's alert means zero liability, 4 to 7 working days a capped loss, and after 7 working days the bank's own policy decides.") +
        " The bank decides, and it's on the bank to prove you were at fault.");
    }
    if (a.how === "unauth" && !isNew && a.reply === "none") s.push("The bank must put the amount back in your account within 10 working days while it checks. That's provisional: you can see it but can't spend it until the bank decides, and if it decides against you it can take it back, with reasons. It must decide your complaint within 90 days: by " + human(addDays(told, 90)) + ".");
    var replied = null;
    if (a.reply === "unhappy") { replied = date(a.replyDate, now, told); if (bad(replied)) return replied; }
    var o = ombud(told, replied, now);
    s.push(o.stage === "early" ? "If the bank rejects it or doesn't reply in 30 days, you can go to the RBI Ombudsman from " + human(o.opens) + ", and your last day is " + human(o.last) + "." : ombudText(o));
    return out(o.stage, s.join(" "), true);
  };

  var api = { CHECKS: CHECKS, parse: parse, iso: iso, addMonths: addMonths };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  function wire(f) {
    var check = CHECKS[f.getAttribute("data-check")];
    if (!check) return;
    function vals() {
      var o = {};
      Array.prototype.forEach.call(f.elements, function (el) {
        if (!el.name) return;
        if (el.type === "checkbox") { o[el.name] = o[el.name] || []; if (el.checked) o[el.name].push(el.value); }
        else if (el.type === "radio") { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = ""; }
        else o[el.name] = el.value.trim();
      });
      return o;
    }
    // <div data-when="told=yes;reply=unhappy|happy"> shows only while every condition holds
    function sync() {
      var o = vals();
      Array.prototype.forEach.call(f.querySelectorAll("[data-when]"), function (el) {
        el.hidden = !el.getAttribute("data-when").split(";").every(function (c) {
          var kv = c.split("=");
          return kv[1].split("|").indexOf(o[kv[0]] || "") >= 0;
        });
      });
    }
    f.addEventListener("change", sync);
    sync();
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new Date();
      var today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var r = check(vals(), today);
      f.querySelector(".check-result").textContent = r.text;
      f.querySelector(".check-offer").hidden = !r.offer;
    });
  }
  function start() { Array.prototype.forEach.call(document.querySelectorAll("form.check[data-check]"), wire); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
