// Run: node test/rbi-check.test.js
const assert = require("assert");
const { rbiCheck } = require("../public/rbi-check.js");

const base = { lender: "covered", wrote: "yes", received: "2026-12-01", reply: "none", replyDate: "", court: "no" };
const run = (over, today) => rbiCheck({ ...base, ...over }, today);
const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k]]));

assert.deepStrictEqual(pick(run({}, "2026-12-15"), ["stage", "opensOn", "lastDay", "days"]), { stage: "early", opensOn: "2026-12-31", lastDay: "2027-03-31", days: 16 });
assert.deepStrictEqual(pick(run({}, "2026-12-31"), ["stage", "days"]), { stage: "open", days: 90 });
assert.deepStrictEqual(pick(run({}, "2027-03-31"), ["stage", "days"]), { stage: "open", days: 0 });
assert.deepStrictEqual(pick(run({}, "2027-04-01"), ["stage", "lastDay"]), { stage: "late", lastDay: "2027-03-31" });
assert.deepStrictEqual(pick(run({ reply: "unhappy", replyDate: "2026-12-10" }, "2026-12-11"), ["stage", "opensOn", "lastDay"]), { stage: "open", opensOn: "2026-12-10", lastDay: "2027-03-31" });
assert.deepStrictEqual(pick(run({ reply: "unhappy", replyDate: "2027-01-20" }, "2027-01-21"), ["stage", "opensOn", "lastDay"]), { stage: "open", opensOn: "2026-12-31", lastDay: "2027-04-20" });
assert.strictEqual(run({ reply: "happy" }, "2026-12-15").stage, "resolved");
assert.deepStrictEqual(pick(run({ wrote: "no", received: "" }, "2026-11-19"), ["stage", "opensOn"]), { stage: "write", opensOn: "2026-12-19" });
assert.strictEqual(run({ lender: "hfc" }, "2026-12-15").stage, "hfc");
assert.strictEqual(run({ lender: "app" }, "2026-12-15").stage, "app");
assert.strictEqual(run({ court: "yes" }, "2026-12-15").stage, "court");
assert.strictEqual(run({}, "2026-11-19").stage, "invalid"); // received after today
assert.strictEqual(run({ reply: "unhappy", replyDate: "2026-11-20" }, "2026-12-15").stage, "invalid"); // reply before complaint
assert.strictEqual(run({ reply: "unhappy", replyDate: "" }, "2026-12-15").stage, "missing");
assert.strictEqual(run({ reply: "unhappy", replyDate: "2026-12-20" }, "2026-12-15").stage, "invalid"); // reply in the future
assert.strictEqual(run({ received: "" }, "2026-12-15").stage, "missing");
assert.strictEqual(run({ received: "", reply: "happy" }, "2026-12-15").stage, "missing");
assert.strictEqual(run({ received: "2026-02-30" }, "2026-12-15").stage, "invalid"); // not a real date
assert.deepStrictEqual(pick(run({ received: "2028-02-01" }, "2028-02-02"), ["stage", "opensOn", "lastDay"]), { stage: "early", opensOn: "2028-03-02", lastDay: "2028-05-31" });
assert.deepStrictEqual(pick(run({ received: "2026-09-12" }, "2026-11-19"), ["stage", "lastDay", "days"]), { stage: "open", lastDay: "2027-01-10", days: 52 }); // the reply script's example
console.log("rbi-check: all tests passed");
