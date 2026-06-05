/* United Equity Partners — front-end app
 *
 * Lead capture: posts every form submission to the Repflow inbound webhook
 * which routes leads to UEP's pipeline. Falls back to a mailto: link if the
 * webhook is unreachable so submissions are never silently lost.
 */

(function () {
  // ── Nav: scroll-shadow + mobile toggle ────────────────────────────────────
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const burger = document.getElementById("navBurger");
    if (burger) {
      burger.addEventListener("click", () => nav.classList.toggle("is-open"));
      // Close on link click (mobile)
      nav.querySelectorAll(".nav-links a").forEach(a =>
        a.addEventListener("click", () => nav.classList.remove("is-open"))
      );
    }
  }

  // ── Footer year ───────────────────────────────────────────────────────────
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ── Lead form submission ─────────────────────────────────────────────────
  // Posts to Repflow's generic inbound webhook so leads land in UEP's
  // pipeline automatically. Source tag identifies UEP traffic for attribution.
  const WEBHOOK_URL  = "https://repflow.koino.capital/api/leads/inbound";
  const APPLY_URL    = "https://repflow.koino.capital/api/leads/inbound";
  // UEP's agency_id — Zay sets this once he creates his agency on Repflow.
  // Until then, leads land in the demo agency for testing. Override by
  // setting window.UEP_AGENCY_ID before app.js loads, or via a server-side
  // env var rewrite at build time.
  const AGENCY_ID = (typeof window !== "undefined" && window.UEP_AGENCY_ID)
    || "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9";

  function buildLeadPayload(formEl, source, opts = {}) {
    const data = Object.fromEntries(new FormData(formEl).entries());

    // Health snapshot — checkboxes don't appear in FormData when unchecked, so
    // a missing key reads as a clean "no". Flag any "yes" so the advisor
    // shortlist for this lead routes to simplified-issue / graded carriers
    // instead of standard underwriting.
    const health = {
      stroke:       data.health_stroke === "yes",
      diabetes:     data.health_diabetes === "yes",
      cancer:       data.health_cancer === "yes",
      heart_attack: data.health_heart_attack === "yes",
      tobacco:      data.health_tobacco === "yes",
    };
    const autoDisqualifiers = ["stroke", "cancer", "heart_attack"].filter(k => health[k]);
    const standardUnderwriting = autoDisqualifiers.length === 0;

    const monthlyContribution = data.monthly_contribution
      ? Math.max(0, parseInt(data.monthly_contribution, 10) || 0)
      : null;

    // Every product funnel has its own qualifying block (term length,
    // coverage amount, lump sum, mortgage balance, etc.). Rather than
    // hard-code each field name here, sweep anything that isn't a base
    // field into meta.qualifying. Adding a new product field in the
    // generator requires zero changes here.
    const BASE_FIELDS = new Set([
      "name", "email", "phone", "state", "age", "product", "notes",
      "license_status", "track", "experience",
      "health_stroke", "health_diabetes", "health_cancer",
      "health_heart_attack", "health_tobacco",
      "monthly_contribution",  // surfaced explicitly below
    ]);
    const qualifying = {};
    for (const [k, v] of Object.entries(data)) {
      if (BASE_FIELDS.has(k)) continue;
      const trimmed = typeof v === "string" ? v.trim() : v;
      if (trimmed === "" || trimmed == null) continue;
      qualifying[k] = trimmed;
    }

    return {
      lead_name: (data.name || "").trim(),
      phone:     (data.phone || "").trim(),
      email:     (data.email || "").trim() || null,
      state:     (data.state || "").trim().toUpperCase().slice(0, 2) || null,
      age:       data.age ? parseInt(data.age, 10) : null,
      product:   data.product || null,
      source,
      // Flips the Repflow inbound handler into live-transfer mode — Twilio
      // dials the lead now and bridges to the advisor. Only set when the
      // user clicked the "Get connected right now" button on the form.
      transfer_now: !!opts.transferNow,
      consent:   "verified",
      // Auto-disqualifiers on standard underwriting → re-heat as warm so
      // the dialer doesn't burn a hot-lead slot on a policy that will get
      // declined. Standard-underwriting clears stay "fresh".
      heat:      standardUnderwriting ? "fresh" : "warm",
      notes:     data.notes || null,
      agency_id: AGENCY_ID,
      // Pipeline ignores unknown fields; Repflow reads:
      //   meta.health             → carrier shortlist by health
      //   meta.monthly_contribution → IUL funding level
      //   meta.qualifying.*       → every product-specific selector
      //                             (coverage_amount, term_length, lump_sum,
      //                              mortgage_balance, whole_life_goal, etc.)
      // The careers form reuses the same path, so license/track/experience
      // flow through here as top-level meta fields.
      meta: {
        health,
        auto_disqualifiers:     autoDisqualifiers,            // [] if all clean
        standard_underwriting:  standardUnderwriting,
        monthly_contribution:   monthlyContribution,           // IUL-only; null elsewhere
        qualifying,                                            // per-product selectors
        license_status:         data.license_status || null,
        track:                  data.track || null,
        experience:             data.experience || null,
      },
    };
  }

  async function postLead(payload) {
    const r = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json().catch(() => ({}));
  }

  // Renders the "calling you now" state after a successful live-transfer
  // bridge fires. The lead's phone is about to ring (Twilio dials them
  // first). If the bridge response says it didn't fire, hand back to the
  // calendar embed so the user still has a path forward.
  function renderCallingNow(formEl, phoneNumberDisplay, schedulerUrl) {
    formEl.innerHTML = `
      <div style="text-align:center;padding:24px 12px;">
        <div style="font-size:46px;line-height:1;margin-bottom:10px;" aria-hidden="true">📞</div>
        <h3 style="font-family:var(--font-display);font-weight:600;font-size:24px;color:var(--brand);margin:0 0 8px;">Calling you now${phoneNumberDisplay ? ` at ${phoneNumberDisplay}` : ""}</h3>
        <p style="font-size:14px;color:var(--ink-3);margin:0 0 16px;line-height:1.55;">
          Your phone will ring in a few seconds. A licensed UEP advisor will be on the other end.
        </p>
        <p style="font-size:13px;color:var(--ink-3);margin:0;line-height:1.55;">
          Didn't get a call within a minute? <a href="${schedulerUrl}" style="color:var(--brand);text-decoration:underline;">Pick a time instead</a>.
        </p>
      </div>
    `;
  }

  function showError(form, message) {
    let banner = form.querySelector(".form-error");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "form-error";
      banner.style.cssText = "background:rgba(180,40,40,0.08);border:1px solid rgba(180,40,40,0.3);color:#9C2D2D;border-radius:8px;padding:10px 12px;font-size:13px;margin:6px 0;";
      form.insertBefore(banner, form.firstChild);
    }
    banner.textContent = message;
  }

  // Cal.com booking surface. Lead is captured first (Repflow), then the
  // cal.com inline embed is mounted in place of the form with the lead's
  // name/email/phone prefilled — so submissions hit a real calendar without
  // ever leaving uep.com. Two overrides for swapping calendars later
  // (e.g. to Zay's calendar or a UEP team event):
  //   window.UEP_CAL_LINK       — slug used by the inline embed (e.g. "zay/15min")
  //   window.UEP_SCHEDULER_URL  — full URL used by the fallback link / new-tab open
  const CAL_LINK = (typeof window !== "undefined" && window.UEP_CAL_LINK)
    || "koino/15min";
  const SCHEDULER_URL = (typeof window !== "undefined" && window.UEP_SCHEDULER_URL)
    || ("https://cal.com/" + CAL_LINK);

  // Live-transfer line — the number that rings the on-shift UEP advisor.
  // Overridable via window.UEP_PHONE_E164 / window.UEP_PHONE_DISPLAY so we
  // can swap to a Twilio round-robin number without a code change later.
  const PHONE_E164    = (typeof window !== "undefined" && window.UEP_PHONE_E164)    || "+13053223195";
  const PHONE_DISPLAY = (typeof window !== "undefined" && window.UEP_PHONE_DISPLAY) || "(305) 322-3195";

  // Install the official cal.com loader stub exactly once. After install,
  // Cal() is callable — calls before embed.js arrives get queued and
  // flushed when the real lib loads. This is the canonical cal.com pattern.
  function installCalLib() {
    if (typeof window === "undefined") return;
    if (window.Cal && typeof window.Cal === "function") return;
    (function (C, A, L) {
      let p = function (a, ar) { a.q.push(ar); };
      let d = C.document;
      C.Cal = C.Cal || function () {
        let cal = C.Cal; let ar = arguments;
        if (!cal.loaded) {
          cal.ns = {}; cal.q = cal.q || [];
          d.head.appendChild(d.createElement("script")).src = A;
          cal.loaded = true;
        }
        if (ar[0] === L) {
          const api = function () { p(api, arguments); };
          const namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === "string") {
            cal.ns[namespace] = cal.ns[namespace] || api;
            p(cal.ns[namespace], ar);
            p(cal, ["initNamespace", namespace]);
          } else { p(cal, ar); }
          return;
        }
        p(cal, ar);
      };
    })(window, "https://app.cal.com/embed/embed.js", "init");
  }

  function mountInlineCalendar(targetSelector, prefill) {
    try {
      installCalLib();
      const ns = CAL_LINK.replace(/[^a-zA-Z0-9]/g, "_");
      // First Cal() call appends embed.js to the DOM (loader cal.loaded
      // guard). Subsequent calls are queued and flushed once embed.js runs.
      window.Cal("init", ns, { origin: "https://cal.com" });
      window.Cal.ns[ns]("inline", {
        elementOrSelector: targetSelector,
        calLink: CAL_LINK,
        config: Object.assign({ layout: "month_view" }, prefill || {}),
      });
      window.Cal.ns[ns]("ui", {
        hideEventTypeDetails: false,
        layout: "month_view",
      });
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // Build a cal.com prefill / query payload from the form. Used by both the
  // inline embed (object form) and the new-tab fallback link (URL form), so
  // they always agree on what the booking already knows.
  function buildSchedulerData(formEl) {
    const data = Object.fromEntries(new FormData(formEl).entries());
    const noteBits = ["Preferred: phone call"];
    if (data.product)     noteBits.push(`Interested in: ${data.product}`);
    if (data.state)       noteBits.push(`State: ${String(data.state).toUpperCase()}`);
    if (data.phone)       noteBits.push(`Phone: ${data.phone}`);
    if (data.beneficiary) noteBits.push(`Intended beneficiary: ${data.beneficiary}`);
    if (data.notes)       noteBits.push(`Notes: ${data.notes}`);
    const notes = noteBits.join(" · ");
    return {
      name:  (data.name  || "").trim(),
      email: (data.email || "").trim(),
      // cal.com uses smsReminderNumber for the invitee's phone — also doubles
      // as the number the host dials when the event is configured as "Phone
      // call (attendee)" (the right setting for UEP, since appointments are
      // calls — the event owner sets this in cal.com).
      smsReminderNumber: (data.phone || "").trim(),
      notes,
    };
  }
  function buildSchedulerUrl(formEl) {
    const d = buildSchedulerData(formEl);
    const params = new URLSearchParams();
    if (d.name)  params.set("name",  d.name);
    if (d.email) params.set("email", d.email);
    if (d.smsReminderNumber) params.set("smsReminderNumber", d.smsReminderNumber);
    if (d.notes) params.set("notes", d.notes);
    const qs = params.toString();
    return qs ? `${SCHEDULER_URL}?${qs}` : SCHEDULER_URL;
  }

  function bindForm(formEl, source, opts = {}) {
    if (!formEl) return;
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      // submitter is the actual button clicked — used to distinguish
      // "schedule" (default) from "call me right now" (live transfer).
      const submitter = e.submitter || formEl.querySelector('button[type="submit"]');
      const transferNow = !!(submitter && submitter.dataset && submitter.dataset.action === "transfer_now");
      const buttons = Array.from(formEl.querySelectorAll('button[type="submit"]'));
      const oldText = submitter ? submitter.textContent : "";
      buttons.forEach(b => { b.disabled = true; });
      if (submitter) submitter.textContent = transferNow ? "Connecting…" : "Sending…";

      try {
        const wantsCalendar = opts.embedCalendar || opts.scheduler;
        const schedulerUrl = wantsCalendar ? buildSchedulerUrl(formEl) : null;
        const prefill      = wantsCalendar ? buildSchedulerData(formEl) : null;
        const formData = Object.fromEntries(new FormData(formEl).entries());
        const userPhone = String(formData.phone || "").trim();

        // Repflow lead post. For calendar-bound forms (book, quiz, funnels),
        // treat failure as non-fatal — the cal.com booking IS the conversion
        // event, and cal.com fires the host-email notification on booking
        // regardless of whether the Repflow row was created. We log the
        // failure but DO NOT block the user from picking a time.
        let leadResp = null;
        try {
          const payload = buildLeadPayload(formEl, source, { transferNow });
          leadResp = await postLead(payload);
        } catch (postErr) {
          console.warn("[uep] lead post non-fatal:", postErr?.message || postErr);
          if (!wantsCalendar && !transferNow) {
            // Non-calendar form with no scheduling fallback — re-throw to the
            // outer catch so the user sees the inline error / mailto fallback.
            throw postErr;
          }
        }

        // Live transfer path — only runs if the Repflow handler accepted the
        // lead AND actually fired the Twilio bridge. Otherwise fall through
        // to the calendar branch so the user always has a path.
        if (transferNow) {
          const lt = leadResp && leadResp.live_transfer;
          if (lt && lt.fired) {
            renderCallingNow(formEl, userPhone, schedulerUrl || SCHEDULER_URL);
            return;
          }
          console.warn("[uep] live transfer did not fire:", lt);
          // Fall through into the calendar branch so the user still gets a path.
        }

        // Embed: replace the form with an inline cal.com widget so the user
        // never leaves uep.com. Falls back to a "new tab" link if the embed
        // library fails to load (rare, but possible on ad-blockers).
        if (opts.embedCalendar) {
          const calId = "calInline_" + Math.random().toString(36).slice(2, 8);
          formEl.innerHTML = `
            <div style="padding:8px 4px 4px;text-align:center;">
              <h3 style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--brand);margin:0 0 6px;">Pick your 15-minute slot</h3>
              <p style="font-size:13px;color:var(--ink-3);margin:0 0 14px;line-height:1.5;">
                We've got your details — choose any time below and a UEP advisor will call you.
              </p>
              <div style="display:inline-flex;align-items:center;gap:8px;font-size:14px;margin-bottom:14px;">
                Or reach an advisor now —
                <a href="tel:${PHONE_E164}" style="color:var(--brand);font-weight:600;text-decoration:underline;">📞 Call</a>
                or
                <a href="sms:${PHONE_E164}" style="color:var(--brand);font-weight:600;text-decoration:underline;">💬 Text</a>
                <strong>${PHONE_DISPLAY}</strong>
              </div>
            </div>
            <div id="${calId}" style="min-height:560px;width:100%;overflow:hidden;border-radius:12px;border:1px solid rgba(45,31,24,0.10);background:#fff;"></div>
            <p style="font-size:12px;color:var(--ink-3);margin:10px 0 0;text-align:center;">
              Trouble loading the calendar? <a href="${schedulerUrl}" target="_blank" rel="noopener" style="color:var(--brand);text-decoration:underline;">Open in a new tab</a>.
            </p>
          `;
          mountInlineCalendar("#" + calId, prefill).catch(err => {
            console.error("[uep] cal.com embed failed:", err);
            const host = document.getElementById(calId);
            if (host) host.innerHTML = `
              <div style="padding:24px;text-align:center;">
                <p style="font-size:14px;color:var(--ink-2);margin:0 0 12px;">
                  Couldn't load the calendar inline. Open it in a new tab:
                </p>
                <a href="${schedulerUrl}" class="btn btn-primary" target="_blank" rel="noopener" style="text-decoration:none;">Open scheduler →</a>
              </div>
            `;
          });
          return;
        }

        // Redirect fallback (kept for older bindings / if embed is disabled).
        if (schedulerUrl) {
          formEl.innerHTML = `
            <div style="text-align:center;padding:18px 6px;">
              <h3 style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--brand);margin:0 0 8px;">Saved — pick your time</h3>
              <p style="font-size:14px;color:var(--ink-3);margin:0 0 14px;line-height:1.55;">
                Taking you to our scheduler so you can lock a 15-minute slot.
              </p>
              <a href="${schedulerUrl}" class="btn btn-primary btn-block" style="text-decoration:none;">Open scheduler →</a>
            </div>
          `;
          setTimeout(() => { window.location.href = schedulerUrl; }, 250);
          return;
        }

        // Hero form has a separate "done" panel; everything else inline-replaces.
        if (opts.doneEl) {
          formEl.hidden = true;
          opts.doneEl.hidden = false;
        } else {
          formEl.innerHTML = `
            <div style="text-align:center;padding:18px 6px;">
              <h3 style="font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--brand);margin:0 0 8px;">Got it.</h3>
              <p style="font-size:14px;color:var(--ink-3);margin:0;line-height:1.55;">
                A UEP advisor will reach out within one business day.<br>
                Check your phone for a confirmation text.
              </p>
            </div>
          `;
        }
      } catch (err) {
        console.error("[uep] submit failed:", err);
        // Restore all submit buttons + show inline error with mailto fallback.
        buttons.forEach(b => { b.disabled = false; });
        if (submitter) submitter.textContent = oldText;
        const data = Object.fromEntries(new FormData(formEl).entries());
        const fallback = `mailto:hello@unitedequitypartners.com?subject=Inquiry%20from%20website&body=${encodeURIComponent(
          Object.entries(data).map(([k, v]) => `${k}: ${v}`).join("\n")
        )}`;
        showError(formEl, "Couldn't reach our server. Please try again, or email hello@unitedequitypartners.com directly.");
        try { window.open(fallback, "_blank"); } catch {}
      }
    });
  }

  bindForm(
    document.getElementById("leadFormHero"),
    "uep_website:hero",
    { doneEl: document.getElementById("leadFormHeroDone") }
  );
  bindForm(document.getElementById("leadFormBook"), "uep_website:book",   { embedCalendar: true });
  bindForm(document.getElementById("leadFormQuiz"), "uep_website:quiz",   { embedCalendar: true });
  bindForm(document.getElementById("applyForm"),    "uep_website:careers");

  // Per-product funnel pages (term-life, whole-life, iul, final-expense,
  // annuities, mortgage-protection) all share id=leadFormFunnel with a
  // data-product attribute. Bind to embed the calendar there too and tag
  // the source by product so attribution stays clean in Repflow.
  const funnelForm = document.getElementById("leadFormFunnel");
  if (funnelForm) {
    const product = (funnelForm.dataset.product || "").trim();
    const slug    = product.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "product";
    bindForm(funnelForm, "uep_website:funnel_" + slug, { embedCalendar: true });
  }
})();
