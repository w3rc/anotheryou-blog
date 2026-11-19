// Tests for public/checks.js: the free next-step checks on 7 guides. Run: node test/checks.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { CHECKS, addMonths, parse, iso } = require("../public/checks.js");

const has = (r, s) => assert.ok(r.text.includes(s), `expected "${s}" in: ${r.text}`);
const hasNot = (r, s) => assert.ok(!r.text.includes(s), `did not expect "${s}" in: ${r.text}`);

// Month maths clamps to the month's end
assert.strictEqual(iso(addMonths(parse("2027-01-31"), 1)), "2027-02-28");
assert.strictEqual(iso(addMonths(parse("2028-02-29"), 12)), "2029-02-28");
assert.strictEqual(iso(addMonths(parse("2026-12-15"), 1)), "2027-01-15");

// ---------- recovery-agents
{
  const c = CHECKS["recovery-agents"];
  const base = { lender: "bank", did: ["early_late", "family"], wrote: "yes", received: "2026-12-01", reply: "none", replyDate: "", };
  let r = c({ ...base, lender: "app" }, "2026-12-15");
  assert.strictEqual(r.stage, "app"); assert.strictEqual(r.offer, false); has(r, "sachet.rbi.org.in");
  r = c({ ...base, did: [] }, "2026-12-15");
  assert.strictEqual(r.stage, "pick");
  r = c({ ...base, wrote: "no" }, "2026-11-19");
  assert.strictEqual(r.stage, "write"); assert.strictEqual(r.offer, true);
  has(r, "19 December 2026"); has(r, "before 8 am or after 7 pm"); has(r, "withdrawn");
  r = c({ ...base, lender: "nbfc", wrote: "no" }, "2026-11-19");
  hasNot(r, "withdrawn"); // the withdrawal rule is for banks only
  // the RBI guide's own vectors, so the two copies can't drift
  r = c(base, "2026-12-15"); assert.strictEqual(r.stage, "early"); has(r, "31 December 2026"); has(r, "31 March 2027");
  r = c(base, "2026-12-31"); assert.strictEqual(r.stage, "open"); has(r, "90 days from today");
  r = c(base, "2027-03-31"); assert.strictEqual(r.stage, "open"); has(r, "today is your last day");
  r = c(base, "2027-04-01"); assert.strictEqual(r.stage, "late"); assert.strictEqual(r.offer, false);
  r = c({ ...base, reply: "unhappy", replyDate: "2026-12-10" }, "2026-12-11"); assert.strictEqual(r.stage, "open"); has(r, "31 March 2027");
  r = c({ ...base, reply: "unhappy", replyDate: "2027-01-20" }, "2027-01-21"); assert.strictEqual(r.stage, "open"); has(r, "20 April 2027");
  r = c({ ...base, reply: "happy" }, "2026-12-15"); assert.strictEqual(r.stage, "resolved"); assert.strictEqual(r.offer, false);
  r = c({ ...base, received: "" }, "2026-12-15"); assert.strictEqual(r.stage, "missing");
  r = c({ ...base, received: "2027-01-01" }, "2026-12-15"); assert.strictEqual(r.stage, "invalid");
  r = c({ ...base, did: ["crime", "repeat"], wrote: "no" }, "2026-11-19");
  has(r, "police"); has(r, "1930"); assert.strictEqual(r.stage, "write");
  // stale value: received is ignored when wrote = no
  r = c({ ...base, wrote: "no", received: "2030-01-01" }, "2026-11-19"); assert.strictEqual(r.stage, "write");
}

// ---------- refund-stuck
{
  const c = CHECKS["refund-stuck"];
  const base = { where: "waiting", pickup: "2026-11-10", wrote: "no", wroteDate: "" };
  let r = c(base, "2026-11-19");
  assert.strictEqual(r.stage, "early"); assert.strictEqual(r.offer, false); has(r, "1 December 2026");
  r = c({ ...base, pickup: "2026-10-20" }, "2026-11-19");
  assert.strictEqual(r.stage, "write"); assert.strictEqual(r.offer, true); has(r, "19 December 2026"); has(r, "48 hours");
  r = c({ ...base, wrote: "yes", wroteDate: "2026-11-05" }, "2026-11-19");
  assert.strictEqual(r.stage, "wait"); has(r, "5 December 2026");
  r = c({ ...base, wrote: "yes", wroteDate: "2026-10-31" }, "2026-12-01");
  assert.strictEqual(r.stage, "escalate"); has(r, "30 November 2026"); has(r, "1915"); has(r, "edaakhil.nic.in");
  r = c({ ...base, wrote: "yes", wroteDate: "2027-01-31" }, "2027-03-01");
  assert.strictEqual(r.stage, "escalate"); has(r, "28 February 2027"); // month end clamps
  r = c({ ...base, where: "sent" }, "2026-11-19");
  assert.strictEqual(r.stage, "sent"); has(r, "ARN"); assert.strictEqual(r.offer, false);
  r = c({ ...base, pickup: "" }, "2026-11-19"); assert.strictEqual(r.stage, "missing");
  r = c({ ...base, pickup: "2026-12-01" }, "2026-11-19"); assert.strictEqual(r.stage, "invalid");
  r = c({ ...base, wrote: "yes", wroteDate: "" }, "2026-11-19"); assert.strictEqual(r.stage, "missing");
  // stale: the pickup date isn't needed once they've written
  r = c({ ...base, wrote: "yes", wroteDate: "2026-11-05", pickup: "" }, "2026-11-19"); assert.strictEqual(r.stage, "wait");
}

// ---------- client-not-paying
{
  const c = CHECKS["client-not-paying"];
  const base = { where: "india", udyam: "yes", accepted: "2026-09-01", agreedDays: "" };
  let r = c({ ...base, where: "abroad" }, "2026-11-19");
  assert.strictEqual(r.stage, "abroad"); assert.strictEqual(r.offer, true); has(r, "26 November 2026"); hasNot(r, "MSMED");
  r = c({ ...base, udyam: "no" }, "2026-11-19");
  assert.strictEqual(r.stage, "unregistered"); has(r, "udyamregistration.gov.in"); has(r, "26 November 2026");
  r = c(base, "2026-09-10"); // nothing agreed: 15 days, due 16 September
  assert.strictEqual(r.stage, "notdue"); has(r, "16 September 2026"); assert.strictEqual(r.offer, false);
  r = c(base, "2026-09-20");
  assert.strictEqual(r.stage, "overdue"); has(r, "4 days overdue"); hasNot(r, "43B(h)");
  r = c({ ...base, agreedDays: "90" }, "2026-10-01"); // capped at 45: due 16 October
  assert.strictEqual(r.stage, "notdue"); has(r, "16 October 2026"); has(r, "45 days");
  r = c({ ...base, agreedDays: "30" }, "2026-11-19");
  assert.strictEqual(r.stage, "overdue"); has(r, "1 October 2026"); has(r, "43B(h)"); has(r, "samadhaan.msme.gov.in"); has(r, "26 November 2026");
  r = c({ ...base, accepted: "" }, "2026-11-19"); assert.strictEqual(r.stage, "missing");
  r = c({ ...base, agreedDays: "-3" }, "2026-11-19"); assert.strictEqual(r.stage, "invalid");
  r = c({ ...base, accepted: "2026-12-01" }, "2026-11-19"); assert.strictEqual(r.stage, "invalid");
  // stale: udyam is ignored for a client abroad
  r = c({ ...base, where: "abroad", udyam: "no" }, "2026-11-19"); assert.strictEqual(r.stage, "abroad");
}

// ---------- health-insurance-claim
{
  const c = CHECKS["health-insurance-claim"];
  const base = { what: "cut", years: "", big: "no", wrote: "no", sent: "", reply: "none", replyDate: "" };
  let r = c(base, "2026-11-19");
  assert.strictEqual(r.stage, "write"); assert.strictEqual(r.offer, true); has(r, "clause"); has(r, "19 December 2026");
  r = c({ ...base, what: "ped", years: "5plus" }, "2026-11-19"); has(r, "60 months"); has(r, "very likely wrong");
  r = c({ ...base, what: "ped", years: "3to5" }, "2026-11-19"); has(r, "3 years"); hasNot(r, "very likely wrong");
  r = c({ ...base, what: "ped", years: "lt3" }, "2026-11-19"); has(r, "3 years");
  r = c({ ...base, what: "ped", years: "" }, "2026-11-19"); assert.strictEqual(r.stage, "missing");
  r = c({ ...base, wrote: "yes", sent: "2026-11-10" }, "2026-11-19");
  assert.strictEqual(r.stage, "wait"); has(r, "10 December 2026"); has(r, "155255");
  r = c({ ...base, wrote: "yes", sent: "2026-10-01" }, "2026-11-19");
  assert.strictEqual(r.stage, "open"); has(r, "cioins.co.in"); hasNot(r, "last day"); // no reply: the guide gives no last day
  r = c({ ...base, wrote: "yes", sent: "2026-10-01", reply: "unhappy", replyDate: "2026-10-20" }, "2026-11-19");
  assert.strictEqual(r.stage, "open"); has(r, "20 October 2027");
  r = c({ ...base, wrote: "yes", sent: "2024-01-01", reply: "unhappy", replyDate: "2024-02-29" }, "2025-03-01");
  assert.strictEqual(r.stage, "late"); has(r, "28 February 2025"); assert.strictEqual(r.offer, false);
  r = c({ ...base, wrote: "yes", sent: "2026-10-01", reply: "happy" }, "2026-11-19"); assert.strictEqual(r.stage, "resolved");
  r = c({ ...base, big: "yes" }, "2026-11-19"); has(r, "e-Daakhil"); hasNot(r, "Insurance Ombudsman opens");
  r = c({ ...base, big: "yes", wrote: "yes", sent: "2026-10-01", reply: "unhappy", replyDate: "2026-10-20" }, "2026-11-19");
  has(r, "e-Daakhil"); hasNot(r, "cioins");
  r = c({ ...base, wrote: "yes", sent: "2026-10-01", reply: "unhappy", replyDate: "2026-09-01" }, "2026-11-19"); assert.strictEqual(r.stage, "invalid");
  // stale: years is ignored unless the reason is a pre-existing disease
  r = c({ ...base, years: "5plus" }, "2026-11-19"); hasNot(r, "60 months");
}

// ---------- rent-agreement-deposit
{
  const c = CHECKS["rent-agreement-deposit"];
  const base = { stage: "sign", place: "other", deposit: "le2", asked: "no" };
  let r = c(base, "2026-11-19");
  assert.strictEqual(r.stage, "sign"); assert.strictEqual(r.offer, true); has(r, "whichever is lower");
  r = c({ ...base, place: "mta", deposit: "gt2" }, "2026-11-19"); has(r, "2 months");
  r = c({ ...base, place: "mta", deposit: "le2" }, "2026-11-19"); hasNot(r, "caps");
  r = c({ ...base, place: "mumbai" }, "2026-11-19"); has(r, "registered");
  r = c({ ...base, place: "maharashtra" }, "2026-11-19"); has(r, "registered");
  r = c({ ...base, stage: "left" }, "2026-11-19");
  assert.strictEqual(r.stage, "ask"); has(r, "4 December 2026");
  r = c({ ...base, stage: "left", asked: "yes", place: "mta" }, "2026-11-19"); assert.strictEqual(r.stage, "file"); has(r, "Rent Authority");
  r = c({ ...base, stage: "left", asked: "yes", place: "mumbai" }, "2026-11-19"); has(r, "Small Causes Court");
  r = c({ ...base, stage: "left", asked: "yes", place: "maharashtra" }, "2026-11-19"); has(r, "civil suit"); hasNot(r, "Small Causes");
  r = c({ ...base, stage: "left", asked: "yes", place: "other" }, "2026-11-19"); has(r, "civil suit"); has(r, "Consumer commissions");
  // stale: the deposit answer is ignored after moving out
  r = c({ ...base, stage: "left", place: "mta", deposit: "gt2" }, "2026-11-19"); hasNot(r, "caps");
}

// ---------- resume-format
{
  const c = CHECKS["resume-format"];
  const base = { exp: "mid", pages: "1", pdf: "yes", has: [] };
  let r = c(base, "2026-11-19");
  assert.strictEqual(r.stage, "fixes"); assert.strictEqual(r.offer, true); has(r, "work experience");
  r = c({ ...base, exp: "fresher", pages: "2" }, "2026-11-19"); has(r, "one page"); has(r, "education");
  r = c({ ...base, exp: "senior", pages: "2" }, "2026-11-19"); hasNot(r, "one page");
  r = c({ ...base, exp: "senior", pages: "3" }, "2026-11-19"); has(r, "two pages");
  r = c({ ...base, pdf: "no", has: ["photo", "ctc", "columns"] }, "2026-11-19");
  has(r, "PDF"); has(r, "a photo"); has(r, "CTC"); has(r, "notes app");
  r = c({ ...base, exp: "" }, "2026-11-19"); assert.strictEqual(r.stage, "missing");
}

// ---------- cyber-crime-complaint
{
  const c = CHECKS["cyber-crime-complaint"];
  const base = { how: "unauth", left: "2026-11-17", called: "yes", told: "no", toldDate: "", reply: "none", replyDate: "" };
  let r = c(base, "2026-11-19");
  assert.strictEqual(r.stage, "tell"); assert.strictEqual(r.offer, true); has(r, "3 working days");
  r = c({ ...base, called: "no" }, "2026-11-19"); has(r, "1930");
  r = c({ ...base, how: "sent" }, "2026-11-19"); has(r, "freeze");
  r = c({ ...base, how: "otp" }, "2026-11-19"); has(r, "negligence");
  r = c({ ...base, told: "yes", toldDate: "2026-11-18" }, "2026-11-19");
  assert.strictEqual(r.stage, "early"); has(r, "10 working days"); has(r, "take it back"); // provisional, never "money back" has(r, "16 February 2027"); has(r, "18 December 2026"); has(r, "can be zero");
  r = c({ ...base, left: "2026-11-01", told: "yes", toldDate: "2026-11-10" }, "2026-11-19");
  hasNot(r, "inside the 3 working day window"); has(r, "neither yours nor the bank's"); // 9 days later: no band placed, the condition kept
  r = c({ ...base, told: "yes", toldDate: "2026-11-18" }, "2026-12-20");
  assert.strictEqual(r.stage, "open"); has(r, "18 March 2027");
  r = c({ ...base, told: "yes", toldDate: "2026-11-18", reply: "unhappy", replyDate: "2026-11-25" }, "2026-11-26");
  assert.strictEqual(r.stage, "open"); has(r, "18 March 2027"); hasNot(r, "10 working days"); // they already said no
  r = c({ ...base, left: "2026-05-30", told: "yes", toldDate: "2026-06-01" }, "2026-11-19"); assert.strictEqual(r.stage, "late");
  r = c({ ...base, told: "yes", toldDate: "2026-11-18", reply: "happy" }, "2026-11-19"); assert.strictEqual(r.stage, "resolved"); assert.strictEqual(r.offer, false);
  r = c({ ...base, left: "2027-01-03", told: "no" }, "2027-01-05"); has(r, "5 calendar days"); hasNot(r, "3 working days");
  r = c({ ...base, how: "otp", left: "2027-01-03", told: "no" }, "2027-01-05"); hasNot(r, "5 calendar days"); // the new window is stated for unauthorised debits only
  r = c({ ...base, left: "2027-01-03", told: "yes", toldDate: "2027-01-04" }, "2027-01-05"); has(r, "5 calendar days"); hasNot(r, "10 working days");
  r = c(base, "2026-11-19"); has(r, "bank's own policy"); // all three bands
  r = c({ ...base, told: "yes", toldDate: "2026-11-18", reply: "happy" }, "2026-11-19"); has(r, "problem returns");
  r = c({ ...base, left: "" }, "2026-11-19"); assert.strictEqual(r.stage, "missing");
  r = c({ ...base, told: "yes", toldDate: "2026-11-10" }, "2026-11-19"); assert.strictEqual(r.stage, "invalid"); // told before the money left
  r = c({ ...base, how: "sent", told: "yes", toldDate: "2026-11-18" }, "2026-11-19"); hasNot(r, "10 working days");
}

// ---------- every number, phone and site in a message must be on that guide's page
{
  const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
  const DATE = new RegExp(`\\d{1,2} (${MONTHS}) \\d{4}`, "g"), NUM = /₹?\d[\d,.]*\d|₹?\d/g;
  const runs = {
    "recovery-agents": [[{ lender: "app", did: ["crime"] }], [{ lender: "bank", did: ["early_late", "repeat", "family", "public", "messages", "threats", "fake", "crime"], wrote: "no" }],
      [{ lender: "bank", did: ["repeat"], wrote: "yes", received: "2026-12-01", reply: "none" }, "2026-12-15"], [{ lender: "bank", did: ["repeat"], wrote: "yes", received: "2026-12-01", reply: "none" }, "2027-01-15"],
      [{ lender: "bank", did: ["repeat"], wrote: "yes", received: "2026-01-01", reply: "none" }], [{ lender: "bank", did: ["repeat"], wrote: "yes", received: "2026-11-01", reply: "happy" }], [{ lender: "bank", did: [] }]],
    "refund-stuck": [[{ where: "sent" }], [{ where: "waiting", pickup: "2026-11-18", wrote: "no" }], [{ where: "waiting", pickup: "2026-10-01", wrote: "no" }],
      [{ where: "waiting", wrote: "yes", wroteDate: "2026-11-10" }], [{ where: "waiting", wrote: "yes", wroteDate: "2026-09-10" }]],
    "client-not-paying": [[{ where: "abroad" }], [{ where: "india", udyam: "no" }], [{ where: "india", udyam: "yes", accepted: "2026-11-10", agreedDays: "60" }],
      [{ where: "india", udyam: "yes", accepted: "2026-11-01", agreedDays: "" }], [{ where: "india", udyam: "yes", accepted: "2026-08-01", agreedDays: "30" }]],
    "health-insurance-claim": [["cut", "other"].map(w => ({ what: w, big: "no", wrote: "no" }))[0], { what: "other", big: "yes", wrote: "no" },
      { what: "ped", years: "lt3", big: "no", wrote: "yes", sent: "2026-11-15", reply: "none" }, { what: "ped", years: "3to5", big: "no", wrote: "yes", sent: "2026-10-01", reply: "none" },
      { what: "ped", years: "5plus", big: "no", wrote: "yes", sent: "2026-10-01", reply: "unhappy", replyDate: "2026-10-05" },
      { what: "cut", big: "no", wrote: "yes", sent: "2024-10-01", reply: "unhappy", replyDate: "2024-10-05" }, { what: "cut", big: "no", wrote: "yes", sent: "2026-10-01", reply: "happy" }].map(a => [a]),
    "rent-agreement-deposit": ["mta", "mumbai", "maharashtra", "other"].flatMap(p => [[{ stage: "sign", place: p, deposit: "gt2" }], [{ stage: "left", place: p, asked: "no" }], [{ stage: "left", place: p, asked: "yes" }]]),
    "resume-format": [[{ exp: "fresher", pages: "3", pdf: "no", has: ["photo", "personal", "address", "ctc", "objective", "references", "declaration", "columns"] }], [{ exp: "senior", pages: "3", pdf: "yes", has: [] }]],
    "cyber-crime-complaint": ["unauth", "otp", "sent"].flatMap(h => [
      [{ how: h, left: "2026-11-17", called: "no", told: "no" }], [{ how: h, left: "2026-11-01", called: "yes", told: "yes", toldDate: "2026-11-02", reply: "none" }],
      [{ how: h, left: "2026-09-01", called: "yes", told: "yes", toldDate: "2026-09-12", reply: "unhappy", replyDate: "2026-10-01" }], [{ how: h, left: "2026-01-01", called: "yes", told: "yes", toldDate: "2026-01-02", reply: "none" }],
      [{ how: h, left: "2027-01-03", called: "yes", told: "no" }, "2027-01-05"]]),
  };
  for (const [slug, cases] of Object.entries(runs)) {
    const page = fs.readFileSync(path.join(__dirname, "..", "src", "content", "guides", slug + ".md"), "utf8");
    const facts = new Set(page.replace(/<form[\s\S]*?<\/form>/g, "").replace(DATE, "").match(NUM)); // the form's own labels can't vouch
    for (const [a, today = "2026-11-19"] of cases) {
      const r = CHECKS[slug](a, today);
      assert.ok(!/[—‘’“”]/.test(r.text), `${slug}: em dash or curly quote in: ${r.text}`);
      const t = r.text.replace(DATE, "").replace(/\d+ days? (from today|overdue)/g, "");
      // whole numbers only, and the page's own dates (sources "read 18 November") don't count as facts
      for (const n of t.match(NUM) || []) assert.ok(facts.has(n), `${slug}: "${n}" is not on the guide, in: ${r.text}`);
      for (const d of t.match(/[a-z0-9.-]+\.(in|org|com)\b/g) || []) assert.ok(page.includes(d), `${slug}: "${d}" is not on the guide`);
    }
  }
}

console.log("checks: all tests passed");
