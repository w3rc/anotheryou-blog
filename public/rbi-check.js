// Free next-step check on the RBI Ombudsman guide: the reader's own dates under RB-IOS 2026, worked out in the page.
// Nothing leaves the browser. Rules are the guide's Step 1 and Step 2; tests: node test/rbi-check.test.js
(function () {
  var DAY = 86400000;
  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return new Date(t).toISOString().slice(0, 10) === s ? t : null; // rejects 2026-02-30
  }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }

  function rbiCheck(a, today) {
    var out = { stage: null, opensOn: null, lastDay: null, days: null };
    var now = parse(today);
    if (a.lender === "hfc") return (out.stage = "hfc"), out;
    if (a.lender === "app") return (out.stage = "app"), out;
    if (a.court === "yes") return (out.stage = "court"), out;
    if (a.wrote === "no") { out.stage = "write"; out.opensOn = iso(now + 30 * DAY); return out; }
    var unhappy = a.reply === "unhappy";
    if (!a.received || (unhappy && !a.replyDate)) return (out.stage = "missing"), out;
    var got = parse(a.received);
    var replied = unhappy ? parse(a.replyDate) : null;
    if (got === null || got > now || (unhappy && (replied === null || replied < got || replied > now))) return (out.stage = "invalid"), out;
    if (a.reply === "happy") return (out.stage = "resolved"), out;
    var end30 = got + 30 * DAY;
    var opens = unhappy ? Math.min(replied, end30) : end30;
    var last = (unhappy ? Math.max(end30, replied) : end30) + 90 * DAY;
    out.opensOn = iso(opens);
    out.lastDay = iso(last);
    if (now < opens) { out.stage = "early"; out.days = Math.round((opens - now) / DAY); }
    else if (now <= last) { out.stage = "open"; out.days = Math.round((last - now) / DAY); }
    else out.stage = "late";
    return out;
  }

  if (typeof module !== "undefined") module.exports = { rbiCheck: rbiCheck };
  if (typeof document === "undefined") return;

  function human(s) { return new Date(parse(s)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
  function n(d) { return d === 1 ? "1 day" : d + " days"; }
  function message(r) {
    switch (r.stage) {
      case "hfc": return "The RBI Ombudsman doesn't cover housing finance companies, so this route won't work for you. Complain to the company in writing first, and keep the complaint number and the date.";
      case "app": return "A loan app with no bank or NBFC behind it isn't an RBI lender, so the Ombudsman can't take it. Report it on cybercrime.gov.in and on RBI's Sachet portal, sachet.rbi.org.in.";
      case "court": return "RBI won't take a problem that's already in a court, consumer commission or arbitration. A police case is different and doesn't stop you.";
      case "write": return "Step 1 first: complain to them in writing, on their grievance page, by email, or with a letter at the branch and a stamped copy. Keep the complaint number and the date. If they get it today, you can go to RBI from " + human(r.opensOn) + ".";
      case "missing": return "Add the date they got your complaint, and the date of their reply if they replied.";
      case "invalid": return "Check the dates: the bank can't have got your complaint, or replied, after today, and a reply can't come before the complaint.";
      case "resolved": return "Then there's nothing to file. Keep their reply and your complaint number in case the problem comes back.";
      case "early": return "It's too early to file: RBI can reject a complaint made before the bank's 30 days are up. You can file from " + human(r.opensOn) + " (" + n(r.days) + " from today), and your last day is " + human(r.lastDay) + ".";
      case "open": return r.days === 0 ? "You can file now at cms.rbi.org.in, and today is your last day." : "You can file now at cms.rbi.org.in. Your last day is " + human(r.lastDay) + ", " + n(r.days) + " from today.";
      case "late": return "Your 90 days ended on " + human(r.lastDay) + ", so RBI can reject the complaint without reading it.";
    }
  }

  function start() {
    var f = document.getElementById("rbi-check");
    if (!f) return;
    var val = function (name) { var el = f.querySelector('[name="' + name + '"]:checked') || f.querySelector('[name="' + name + '"]'); return el ? el.value : ""; };
    var sync = function () {
      document.getElementById("rbi-check-wrote").hidden = val("wrote") !== "yes";
      document.getElementById("rbi-reply-date-label").hidden = val("reply") !== "unhappy";
    };
    f.addEventListener("change", sync);
    sync();
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new Date();
      var today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var r = rbiCheck({ lender: val("lender"), wrote: val("wrote"), received: val("received"), reply: val("reply"), replyDate: val("replyDate"), court: val("court") }, today);
      document.getElementById("rbi-check-result").textContent = message(r);
      document.getElementById("rbi-check-offer").hidden = ["write", "early", "open"].indexOf(r.stage) < 0;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
