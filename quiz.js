/* United Equity Partners — Life Insurance Quiz Funnel
 *
 * High-intent qualification quiz -> contact capture -> option close.
 * On finish the prospect either (a) requests an instant call from a licensed
 * advisor (live transfer, target 5-10 min during business hours) or
 * (b) books an appointment.
 *
 * Lead delivery:
 *   - POST /api/lead  (same-origin) -> emails the agent inbox + fires the
 *     server-side Meta Conversions API event (source of truth).
 *   - Fire-and-forget to the Repflow inbound webhook so the dialer/pipeline
 *     catches it instantly. Live-transfer leads post as "hot".
 *
 * Meta tracking: browser Pixel events share an event_id with the server CAPI
 * event so Meta de-duplicates them (better match quality, no double counting).
 */
(function () {
  "use strict";

  // ── Config (override before quiz.js loads via window.UEP_*) ───────────────
  var CFG = {
    agencyId:   window.UEP_AGENCY_ID  || "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9",
    phone:      window.UEP_PHONE      || "",                 // e.g. "+18885551234" — enables tap-to-call
    bookingUrl: window.UEP_BOOKING_URL|| "",                 // e.g. Calendly/Cal.com — opens external calendar if set
    hours:      window.UEP_HOURS      || { open: 9, close: 21 }, // America/New_York
    leadApi:    "/api/lead",
    repflowUrl: "https://repflow.koino.capital/api/leads/inbound"
  };

  // ── Questions ─────────────────────────────────────────────────────────────
  var QUESTIONS = [
    {
      id: "reason",
      q: "What's the main reason you're looking for coverage?",
      sub: "This helps your advisor recommend the right type of policy.",
      options: [
        { v: "income",        label: "Replace my income",        desc: "Protect my family's lifestyle if I'm gone" },
        { v: "mortgage",      label: "Cover my mortgage or debts", desc: "Keep the house, clear what I owe" },
        { v: "final_expense", label: "Final expenses & burial",   desc: "Don't leave the cost to my family" },
        { v: "retirement",    label: "Build tax-free retirement", desc: "Cash value I can use later (IUL)" },
        { v: "legacy",        label: "Leave a legacy",            desc: "Pass on wealth to my kids" },
        { v: "unsure",        label: "I'm not sure yet",          desc: "Help me figure out what fits" }
      ]
    },
    {
      id: "protect",
      q: "Who are you looking to protect?",
      options: [
        { v: "self",     label: "Just me" },
        { v: "spouse",   label: "Me and my spouse / partner" },
        { v: "family",   label: "My whole family" },
        { v: "business", label: "My business" }
      ]
    },
    {
      id: "age",
      q: "What's your age?",
      sub: "Rates are based partly on age, so this gets you an accurate match.",
      options: [
        { v: "under_30", label: "Under 30" },
        { v: "30s",      label: "30 to 39" },
        { v: "40s",      label: "40 to 49" },
        { v: "50s",      label: "50 to 59" },
        { v: "60s",      label: "60 to 69" },
        { v: "70+",      label: "70 or older" }
      ]
    },
    {
      id: "tobacco",
      q: "Do you use tobacco or nicotine?",
      options: [
        { v: "no",      label: "No" },
        { v: "quit",    label: "I quit 12+ months ago" },
        { v: "yes",     label: "Yes" }
      ]
    },
    {
      id: "health",
      q: "How would you describe your health?",
      sub: "Be honest — there are great options at every level, including no-exam plans.",
      options: [
        { v: "excellent", label: "Excellent",         desc: "No major conditions" },
        { v: "good",      label: "Good",              desc: "Well-managed, minor issues" },
        { v: "some",      label: "A few conditions",  desc: "e.g. blood pressure, diabetes" },
        { v: "serious",   label: "Significant conditions", desc: "I want options that still approve me" }
      ]
    },
    {
      id: "coverage",
      q: "How much coverage are you thinking about?",
      sub: "A rough idea is fine. Your advisor will fine-tune it.",
      options: [
        { v: "lt100",   label: "Under $100,000" },
        { v: "100_250", label: "$100,000 – $250,000" },
        { v: "250_500", label: "$250,000 – $500,000" },
        { v: "500_1m",  label: "$500,000 – $1,000,000" },
        { v: "gt1m",    label: "More than $1,000,000" },
        { v: "unsure",  label: "Not sure — recommend an amount" }
      ]
    },
    {
      id: "timeline",
      q: "When would you like coverage in place?",
      options: [
        { v: "asap",     label: "As soon as possible" },
        { v: "30days",   label: "Within the next 30 days" },
        { v: "research", label: "Just researching for now" }
      ]
    }
  ];

  var TOTAL = QUESTIONS.length;
  var QLABEL = {}; // value -> label, for human-readable summaries
  QUESTIONS.forEach(function (qq) {
    qq.options.forEach(function (o) { QLABEL[qq.id + ":" + o.v] = o.label; });
  });

  // ── State ─────────────────────────────────────────────────────────────────
  var state = { step: 0, answers: {}, contact: {}, leadEventId: null, posted: false };
  var startedTracked = false;

  var app      = document.getElementById("quizApp");
  var progress = document.getElementById("qzProgress");
  var fill     = document.getElementById("qzFill");
  var stepLbl  = document.getElementById("qzStepLabel");
  var pctLbl   = document.getElementById("qzPct");
  var fineEl   = document.getElementById("funnelFine");

  // ── Helpers ─────────────────────────────────────────────────────────────
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "ev-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }
  function fbqTrack(name, params, eventId) {
    try {
      if (typeof window.fbq !== "function") return;
      var opts = eventId ? { eventID: eventId } : undefined;
      window.fbq("track", name, params || {}, opts);
    } catch (e) {}
  }
  function getCookie(n) {
    var m = document.cookie.match("(^|;)\\s*" + n + "\\s*=\\s*([^;]+)");
    return m ? m.pop() : "";
  }
  function etHour() {
    try {
      var h = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "numeric", hour12: false
      }).format(new Date());
      return parseInt(h, 10) % 24;
    } catch (e) { return new Date().getHours(); }
  }
  function isOpen() { var h = etHour(); return h >= CFG.hours.open && h < CFG.hours.close; }

  function recommend(a) {
    var r = a.reason, age = a.age;
    if (r === "retirement") return { name: "an Indexed Universal Life (IUL) plan", why: "tax-advantaged growth with a floor that never loses to the market" };
    if (r === "final_expense" || age === "70+") return { name: "a Final Expense Whole Life plan", why: "simplified approval, locked-in rates, and no medical exam on most plans" };
    if (r === "legacy") return { name: "a Whole Life plan", why: "lifelong coverage with guaranteed cash value you can pass on" };
    if (r === "mortgage") return { name: "a Mortgage Protection Term plan", why: "coverage sized to your loan so your family keeps the home" };
    if (r === "income") {
      if (age === "under_30" || age === "30s" || age === "40s")
        return { name: "a Term Life plan", why: "the most coverage per dollar to replace your income" };
      return { name: "a Term or Whole Life plan", why: "income protection matched to your age and budget" };
    }
    return { name: "a custom coverage plan", why: "matched to your answers across our 30+ carriers" };
  }

  function summaryLines() {
    return QUESTIONS.map(function (qq) {
      var v = state.answers[qq.id];
      return qq.q + "  ->  " + (QLABEL[qq.id + ":" + v] || "—");
    });
  }

  function setProgress(stepIdx, label) {
    progress.hidden = false;
    var pct = Math.round(((stepIdx + 1) / (TOTAL + 1)) * 100);
    fill.style.width = pct + "%";
    pctLbl.textContent = pct + "%";
    stepLbl.textContent = label;
  }

  // ── Lead delivery ─────────────────────────────────────────────────────────
  function postLead(extra) {
    var a = state.answers, c = state.contact, rec = recommend(a);
    var base = {
      name:    c.name || "",
      phone:   c.phone || "",
      email:   c.email || "",
      state:   (c.state || "").toUpperCase().slice(0, 2),
      zip:     c.zip || "",
      age:     QLABEL["age:" + a.age] || "",
      product: rec.name.replace(/^an? /, ""),
      fbp:     getCookie("_fbp"),
      fbc:     getCookie("_fbc"),
      answers: summaryLines(),
      notes:   "QUIZ MATCH: " + rec.name + "\n" + summaryLines().join("\n")
    };
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });

    // Same-origin: email + server CAPI. Returns a promise.
    var p = fetch(CFG.leadApi, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(base),
      keepalive: true
    }).catch(function () {});

    // Fire-and-forget into Repflow pipeline / dialer.
    try {
      var heat = base.mode === "live_transfer" ? "hot"
               : base.mode === "appointment"   ? "hot" : "warm";
      fetch(CFG.repflowUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "lead",
          lead_name: base.name,
          phone: base.phone,
          email: base.email || null,
          state: base.state || null,
          product: base.product,
          source: base.source || "uep_website:quiz",
          consent: "verified",
          heat: heat,
          notes: base.notes,
          agency_id: CFG.agencyId,
          meta: { quiz: state.answers, mode: base.mode || "quiz_complete" }
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}

    return p;
  }

  // ── Render: question step ──────────────────────────────────────────────────
  function renderQuestion(idx) {
    var qq = QUESTIONS[idx];
    setProgress(idx, "Question " + (idx + 1) + " of " + TOTAL);
    fineEl.style.display = "none";

    var html = "";
    if (idx > 0) html += '<button class="qz-back" id="qzBack" type="button">&larr; Back</button>';
    html += '<h1 class="qz-q">' + qq.q + "</h1>";
    if (qq.sub) html += '<p class="qz-sub">' + qq.sub + "</p>";
    html += '<div class="qz-options">';
    qq.options.forEach(function (o) {
      var sel = state.answers[qq.id] === o.v ? " is-selected" : "";
      html += '<button class="qz-opt' + sel + '" type="button" data-v="' + o.v + '">'
            +   '<span class="qz-opt-main">' + o.label + "</span>"
            +   (o.desc ? '<span class="qz-opt-desc">' + o.desc + "</span>" : "")
            +   '<span class="qz-opt-tick" aria-hidden="true"></span>'
            + "</button>";
    });
    html += "</div>";
    app.innerHTML = html;

    app.querySelectorAll(".qz-opt").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.answers[qq.id] = btn.getAttribute("data-v");
        app.querySelectorAll(".qz-opt").forEach(function (b) { b.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
        if (!startedTracked) { startedTracked = true; }
        window.setTimeout(next, 200);
      });
    });
    var back = document.getElementById("qzBack");
    if (back) back.addEventListener("click", prev);
    fadeIn();
  }

  // ── Render: contact capture ────────────────────────────────────────────────
  function renderContact() {
    setProgress(TOTAL, "Final step");
    fineEl.style.display = "";
    var rec = recommend(state.answers);
    app.innerHTML =
      '<button class="qz-back" id="qzBack" type="button">&larr; Back</button>'
      + '<div class="qz-match-note"><span class="qz-match-dot"></span>Based on your answers, you look like a strong match for <strong>' + rec.name + "</strong>.</div>"
      + '<h1 class="qz-q">Where should your advisor send your match?</h1>'
      + '<p class="qz-sub">A licensed United Equity Partners advisor will review your answers and reach out. No cost, no obligation.</p>'
      + '<form id="qzContact" class="qz-form" novalidate>'
      + '  <div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" tabindex="-1"><label>Company (leave blank)<input type="text" name="company" tabindex="-1" autocomplete="off"/></label></div>'
      + '  <label class="field"><span>Full name</span><input type="text" name="name" required autocomplete="name" placeholder="Jordan Smith"/></label>'
      + '  <label class="field"><span>Phone</span><input type="tel" name="phone" required autocomplete="tel" inputmode="tel" placeholder="(555) 123-4567"/></label>'
      + '  <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@email.com"/></label>'
      + '  <div class="row-2">'
      + '    <label class="field"><span>State</span><input type="text" name="state" required maxlength="2" autocomplete="address-level1" placeholder="TX" style="text-transform:uppercase"/></label>'
      + '    <label class="field"><span>ZIP</span><input type="text" name="zip" inputmode="numeric" maxlength="5" autocomplete="postal-code" placeholder="75001"/></label>'
      + "  </div>"
      + '  <button type="submit" class="btn btn-primary btn-block qz-submit">See my match &rarr;</button>'
      + '  <p class="qz-trustline"><span class="qz-lock"></span>Private &amp; secure. We never sell your information.</p>'
      + "</form>";

    document.getElementById("qzBack").addEventListener("click", prev);
    var form = document.getElementById("qzContact");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.company && form.company.value) return; // honeypot
      var fd = new FormData(form);
      state.contact = {
        name:  (fd.get("name")  || "").trim(),
        phone: (fd.get("phone") || "").trim(),
        email: (fd.get("email") || "").trim(),
        state: (fd.get("state") || "").trim(),
        zip:   (fd.get("zip")   || "").trim()
      };
      if (!state.contact.name || !state.contact.phone || !state.contact.email) {
        showError(form, "Please add your name, phone, and email so your advisor can reach you.");
        return;
      }
      var btn = form.querySelector(".qz-submit");
      btn.disabled = true; btn.textContent = "Matching you…";

      state.leadEventId = uuid();
      var rec2 = recommend(state.answers);
      fbqTrack("Lead", {
        content_name: "life_insurance_quiz",
        content_category: rec2.name,
        currency: "USD", value: 25
      }, state.leadEventId);

      postLead({ source: "uep_website:quiz", mode: "quiz_complete", event_id: state.leadEventId })
        .then(function () { renderResults(); })
        .catch(function () { renderResults(); }); // never trap the user
      state.posted = true;
    });
    fadeIn();
    var first = form.querySelector('input[name="name"]'); if (first) first.focus();
  }

  // ── Render: results / option close ──────────────────────────────────────────
  function renderResults() {
    progress.hidden = true;
    fineEl.style.display = "none";
    var rec = recommend(state.answers);
    var open = isOpen();
    var first = (state.contact.name || "").split(" ")[0];

    var head =
      '<div class="qz-result-badge">Your match is ready' + (first ? ", " + escapeHtml(first) : "") + "</div>"
      + '<h1 class="qz-q qz-result-h">You\'re a strong fit for <em>' + rec.name + "</em>.</h1>"
      + '<p class="qz-sub">Here\'s why: ' + rec.why + ". A licensed advisor will confirm pricing across our 30+ carriers and lock in the best rate you qualify for.</p>";

    var close;
    if (open) {
      close =
        '<div class="qz-close">'
        + '  <div class="qz-close-primary">'
        + '    <p class="qz-close-eyebrow"><span class="qz-live-dot"></span>Advisors are available right now</p>'
        + '    <h2 class="qz-close-h">Get a call in 5&ndash;10 minutes</h2>'
        + '    <p class="qz-close-sub">Tap below and a licensed advisor will call the number you provided to review your match and answer questions. Fastest way to get covered.</p>'
        + '    <button class="btn btn-primary btn-block qz-cta-live" id="qzLive" type="button">Receive a call within 5&ndash;10 minutes</button>'
        + (CFG.phone ? '    <a class="qz-call-link" href="tel:' + CFG.phone + '">or tap to call us: ' + formatPhone(CFG.phone) + "</a>" : "")
        + "  </div>"
        + '  <div class="qz-close-sep"><span>or</span></div>'
        + '  <div class="qz-close-secondary">'
        + '    <h3 class="qz-close-h2">Prefer a set time?</h3>'
        + '    <p class="qz-close-sub">Pick a window that works and an advisor will call you then.</p>'
        + '    <button class="btn btn-ghost qz-cta-book" id="qzBook" type="button">Book an appointment instead &rarr;</button>'
        + "  </div>"
        + "</div>";
    } else {
      var openTime = formatHour(CFG.hours.open);
      close =
        '<div class="qz-close">'
        + '  <div class="qz-close-primary">'
        + '    <p class="qz-close-eyebrow">Our advisors are offline right now</p>'
        + '    <h2 class="qz-close-h">Book your appointment</h2>'
        + '    <p class="qz-close-sub">Pick a time that works and a licensed advisor will call you to review your match. We answer ' + openTime + "&ndash;" + formatHour(CFG.hours.close) + ' ET, every day.</p>'
        + '    <button class="btn btn-primary btn-block qz-cta-book" id="qzBook" type="button">Pick my appointment time &rarr;</button>'
        + "  </div>"
        + '  <div class="qz-close-sep"><span>or</span></div>'
        + '  <div class="qz-close-secondary">'
        + '    <h3 class="qz-close-h2">Want a call instead of a set time?</h3>'
        + '    <p class="qz-close-sub">We\'ll put you at the front of the line and call you the moment we open at ' + openTime + " ET.</p>"
        + '    <button class="btn btn-ghost qz-cta-live" id="qzLive" type="button">Get a priority callback &rarr;</button>'
        + "  </div>"
        + "</div>";
    }

    app.innerHTML =
      '<div class="qz-result">' + head + close
      + '<ul class="qz-result-trust">'
      + '  <li><span class="check">&#10003;</span>Independent &mdash; 30+ A-rated carriers</li>'
      + '  <li><span class="check">&#10003;</span>Licensed advisors, never a call center</li>'
      + '  <li><span class="check">&#10003;</span>No cost and no obligation to buy</li>'
      + "</ul></div>";

    var liveBtn = document.getElementById("qzLive");
    var bookBtn = document.getElementById("qzBook");
    if (liveBtn) liveBtn.addEventListener("click", function () { chooseLive(open); });
    if (bookBtn) bookBtn.addEventListener("click", function () { chooseAppointment(); });
    fadeIn();
  }

  function chooseLive(openNow) {
    var evId = uuid();
    fbqTrack("Contact", { content_name: "live_transfer_request", currency: "USD", value: 50 }, evId);
    postLead({
      source: "uep_website:quiz_live",
      mode: "live_transfer",
      event_id: evId,
      notes: "LIVE CALL REQUESTED" + (openNow ? " (advisor online — call within 5-10 min)" : " (after hours — call at open)") + "\nQUIZ MATCH: " + recommend(state.answers).name + "\n" + summaryLines().join("\n")
    });
    var first = (state.contact.name || "").split(" ")[0];
    app.innerHTML =
      '<div class="qz-done">'
      + '  <div class="qz-done-mark" aria-hidden="true"></div>'
      + '  <h1 class="qz-q">' + (openNow ? "You're next in line" + (first ? ", " + escapeHtml(first) : "") + "." : "You're on the list" + (first ? ", " + escapeHtml(first) : "") + ".") + "</h1>"
      + '  <p class="qz-sub">' + (openNow
            ? "A licensed advisor is calling <strong>" + escapeHtml(maskPhone(state.contact.phone)) + "</strong> in the next 5&ndash;10 minutes. Keep your phone close and answer when it rings."
            : "A licensed advisor will call <strong>" + escapeHtml(maskPhone(state.contact.phone)) + "</strong> first thing when we open at " + formatHour(CFG.hours.open) + " ET.") + "</p>"
      + (CFG.phone ? '  <a class="btn btn-primary qz-done-call" href="tel:' + CFG.phone + '">Can\'t wait? Call us now &rarr;</a>' : "")
      + '  <div class="qz-done-actions">'
      + '    <button class="btn btn-ghost" id="qzToBook" type="button">Book an appointment instead</button>'
      + '    <a class="btn btn-ghost" href="/">Take me home</a>'
      + "  </div>";
    var toBook = document.getElementById("qzToBook");
    if (toBook) toBook.addEventListener("click", function () { chooseAppointment(); });
    fadeIn();
  }

  function chooseAppointment() {
    // If a real calendar is configured, hand off to it.
    if (CFG.bookingUrl) {
      fbqTrack("Schedule", { content_name: "appointment_booking" }, uuid());
      window.location.href = CFG.bookingUrl;
      return;
    }
    // Otherwise collect a preferred window in-page (fully functional today).
    progress.hidden = true;
    app.innerHTML =
      '<button class="qz-back" id="qzBack" type="button">&larr; Back</button>'
      + '<h1 class="qz-q">When works best for your call?</h1>'
      + '<p class="qz-sub">Pick a day and a time window. A licensed advisor will call you then.</p>'
      + '<form id="qzAppt" class="qz-form">'
      + '  <div class="row-2">'
      + '    <label class="field"><span>Preferred day</span><select name="day" required>'
      + '       <option value="">Select…</option><option>Today</option><option>Tomorrow</option>'
      + '       <option>This week</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option>'
      + '       <option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option></select></label>'
      + '    <label class="field"><span>Time window (ET)</span><select name="window" required>'
      + '       <option value="">Select…</option><option>Morning (9am–12pm)</option><option>Midday (12pm–3pm)</option>'
      + '       <option>Afternoon (3pm–6pm)</option><option>Evening (6pm–9pm)</option></select></label>'
      + "  </div>"
      + '  <button type="submit" class="btn btn-primary btn-block">Confirm my appointment &rarr;</button>'
      + "</form>";
    document.getElementById("qzBack").addEventListener("click", renderResults);
    var form = document.getElementById("qzAppt");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var when = (fd.get("day") || "") + ", " + (fd.get("window") || "");
      if (!fd.get("day") || !fd.get("window")) return;
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "Booking…";
      var evId = uuid();
      fbqTrack("Schedule", { content_name: "appointment_booking" }, evId);
      postLead({
        source: "uep_website:quiz_appt",
        mode: "appointment",
        event_id: evId,
        preferred_time: when,
        notes: "APPOINTMENT REQUESTED: " + when + "\nQUIZ MATCH: " + recommend(state.answers).name + "\n" + summaryLines().join("\n")
      }).then(showAppointmentDone.bind(null, when)).catch(showAppointmentDone.bind(null, when));
    });
    fadeIn();
  }

  function showAppointmentDone(when) {
    var first = (state.contact.name || "").split(" ")[0];
    app.innerHTML =
      '<div class="qz-done">'
      + '  <div class="qz-done-mark" aria-hidden="true"></div>'
      + '  <h1 class="qz-q">You\'re booked' + (first ? ", " + escapeHtml(first) : "") + ".</h1>"
      + '  <p class="qz-sub">A licensed advisor will call <strong>' + escapeHtml(maskPhone(state.contact.phone)) + "</strong> <strong>" + escapeHtml(when) + "</strong> to review your match. Watch for our call.</p>"
      + (CFG.phone ? '  <a class="btn btn-primary qz-done-call" href="tel:' + CFG.phone + '">Need us sooner? Call now &rarr;</a>' : "")
      + '  <p class="qz-done-fine"><a href="/">Return home</a></p>'
      + "</div>";
    fadeIn();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function render() {
    if (state.step < TOTAL) renderQuestion(state.step);
    else if (state.step === TOTAL) renderContact();
  }
  function next() {
    if (state.step < TOTAL) { state.step++; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  function prev() {
    if (state.step > 0) { state.step--; render(); }
  }

  // ── Tiny utilities ──────────────────────────────────────────────────────────
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function maskPhone(p) { var d = String(p).replace(/\D/g, ""); return d.length >= 4 ? "(•••) •••-" + d.slice(-4) : p; }
  function formatPhone(p) { var d = String(p).replace(/\D/g, "").slice(-10);
    return d.length === 10 ? "(" + d.slice(0,3) + ") " + d.slice(3,6) + "-" + d.slice(6) : p; }
  function formatHour(h) { var ap = h >= 12 ? "pm" : "am"; var hr = h % 12; if (hr === 0) hr = 12; return hr + ap; }
  function showError(form, msg) {
    var b = form.querySelector(".qz-err");
    if (!b) { b = document.createElement("div"); b.className = "qz-err"; form.insertBefore(b, form.firstChild); }
    b.textContent = msg;
  }
  function fadeIn() {
    app.classList.remove("qz-in"); void app.offsetWidth; app.classList.add("qz-in");
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  fbqTrack("ViewContent", { content_name: "life_insurance_quiz", content_category: "life_insurance" });
  render();
})();
