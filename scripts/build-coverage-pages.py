"""Generate per-product coverage funnel pages from a single template.

Run from repo root: python3 scripts/build-coverage-pages.py

Each coverage type gets its own info funnel HTML at /<slug>.html. The
structure is identical across all six pages (so visitors get a
predictable experience and so we only have one place to update layout
later); copy is product-specific.

VSL slot: each page has a <div class="vsl-frame"> with a documented
swap-in spot. To embed a video, replace the placeholder block's inner
HTML with an <iframe> from Wistia / Vimeo / YouTube — see the comment
inside each generated page.
"""
from pathlib import Path
import html

ROOT = Path(__file__).resolve().parent.parent

# Shared nav / footer — kept in sync with index.html. If index.html's nav
# changes, update here and re-run the script.
NAV = """<header class="nav" id="nav">
  <div class="container nav-inner">
    <a href="/" class="brand">
      <span class="brand-mark">U</span>
      <span class="brand-name">United Equity <span class="brand-name-soft">Partners</span></span>
    </a>
    <nav class="nav-links">
      <a href="/#approach">Approach</a>
      <a href="/#products">Coverage</a>
      <a href="/#trust">Why us</a>
      <a href="/careers">Careers</a>
      <a href="/#book" class="btn btn-primary btn-sm">Book a call</a>
    </nav>
    <button class="nav-burger" id="navBurger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>"""

FOOTER = """<footer class="foot">
  <div class="container foot-grid">
    <div>
      <a href="/" class="brand">
        <span class="brand-mark">U</span>
        <span class="brand-name">United Equity <span class="brand-name-soft">Partners</span></span>
      </a>
      <p class="foot-tag">Life insurance built around your family.</p>
    </div>
    <div class="foot-cols">
      <div>
        <h5>Coverage</h5>
        <a href="/term-life">Term life</a>
        <a href="/whole-life">Whole life</a>
        <a href="/iul">IUL</a>
        <a href="/final-expense">Final expense</a>
        <a href="/annuities">Annuities</a>
        <a href="/mortgage-protection">Mortgage protection</a>
      </div>
      <div>
        <h5>Company</h5>
        <a href="/#approach">Approach</a>
        <a href="/#trust">Why us</a>
        <a href="/careers">Careers</a>
        <a href="/#book">Book a call</a>
      </div>
      <div>
        <h5>Compliance</h5>
        <a href="#" data-modal="privacy">Privacy policy</a>
        <a href="#" data-modal="terms">Terms of service</a>
        <a href="#" data-modal="tpmo">TPMO disclosure</a>
      </div>
    </div>
  </div>
  <div class="container foot-fine">
    <p>© United Equity Partners. Insurance products offered through licensed UEP agents. Not affiliated with any government agency.</p>
  </div>
</footer>"""

# The marquee carrier strip — kept in sync with index.html so every
# coverage funnel carries the same proof bar.
STRIP = """<section class="strip">
  <p class="strip-label">Carrier partners include</p>
  <div class="strip-marquee">
    <div class="strip-track">
      <div class="strip-set">
        <img src="/logos/mutual-of-omaha.svg" alt="Mutual of Omaha" class="logo logo-mutual"/>
        <img src="/logos/fg.png" alt="F&amp;G" class="logo logo-fg"/>
        <img src="/logos/aetna.svg" alt="Aetna" class="logo logo-aetna"/>
        <img src="/logos/americo.png" alt="Americo" class="logo logo-americo"/>
        <img src="/logos/foresters.svg" alt="Foresters" class="logo logo-foresters"/>
        <img src="/logos/prosperity-life.png" alt="Prosperity Life" class="logo logo-prosperity"/>
        <img src="/logos/sbli.png" alt="SBLI" class="logo logo-sbli"/>
        <img src="/logos/liberty-bankers.png" alt="Liberty Bankers" class="logo logo-liberty"/>
      </div>
      <div class="strip-set" aria-hidden="true">
        <img src="/logos/mutual-of-omaha.svg" alt="" class="logo logo-mutual"/>
        <img src="/logos/fg.png" alt="" class="logo logo-fg"/>
        <img src="/logos/aetna.svg" alt="" class="logo logo-aetna"/>
        <img src="/logos/americo.png" alt="" class="logo logo-americo"/>
        <img src="/logos/foresters.svg" alt="" class="logo logo-foresters"/>
        <img src="/logos/prosperity-life.png" alt="" class="logo logo-prosperity"/>
        <img src="/logos/sbli.png" alt="" class="logo logo-sbli"/>
        <img src="/logos/liberty-bankers.png" alt="" class="logo logo-liberty"/>
      </div>
    </div>
  </div>
</section>"""

PRODUCTS = [
    {
        "slug": "term-life",
        "name": "Term Life",
        "eyebrow": "Coverage 101 · 4-minute breakdown",
        "h1": "Term life insurance, explained without the pitch.",
        "sub": "The highest coverage per dollar — for a fixed number of years. Watch the breakdown, then decide if it fits.",
        "vsl_caption": "What term life actually does — and the three mistakes most families make when they buy it.",
        "who": [
            ("Young families", "You want a meaningful death benefit (often $500K–$1.5M+) for the years your income is most replaceable — usually until the kids are out of the house and the mortgage is paid."),
            ("New homeowners", "A 20- or 30-year level term lines up with most mortgages and is dramatically cheaper than a comparable permanent policy."),
            ("Anyone debt-protecting", "Co-signed loans, business loans, alimony obligations — term covers the period the debt exists, then naturally ends."),
            ("Anyone who said \"I'll get to it later\"", "Rates only go up with age and underwriting. The cheapest term policy you'll ever buy is the one you buy today."),
        ],
        "how": [
            ("Pick a length", "Most families pick 20 or 30 years. The number should outlast the biggest financial obligation you're protecting — usually the mortgage or the kids' college years."),
            ("Pick a face amount", "Rule of thumb: 10–15× your income, but the better answer is replacement: how much capital would your family need invested at 4% to replace your paycheck?"),
            ("Lock the rate", "Once issued, your premium is locked for the full term. The carrier cannot raise it. If your health changes, your premium doesn't."),
        ],
        "facts": [
            "Highest coverage per dollar of any life-insurance product.",
            "Premiums lock for 10, 15, 20, 25, or 30 years (carrier-dependent).",
            "Most modern term policies are convertible to permanent coverage with no new underwriting — a critical option if your health changes.",
            "If you outlive the term, the policy ends. No cash value at the end — that's the trade-off for the low premium.",
        ],
        "faqs": [
            ("How much term insurance do I actually need?",
             "We work backwards from the obligation. Add up the years of income you'd want to replace + remaining mortgage + future college costs + any debts that don't die with you, then subtract liquid assets and existing coverage. The math usually lands between 10× and 15× annual income for working parents."),
            ("Is 20-year or 30-year term better?",
             "Cheaper per year is 20-year, but you're betting your health stays insurable when you reapply. 30-year locks in today's health for longer at a higher monthly premium. If your kids are under 8 or your mortgage runs past 20 years, 30-year usually wins."),
            ("What's the difference between term and whole life?",
             "Term is pure protection for a window of time. Whole life is permanent — it covers you for life and builds cash value, but costs 5–10× more for the same face amount. Most families need term first; whole life and IUL come later."),
            ("Can I convert my term policy to permanent later?",
             "On most carriers, yes — within a window (often 10–20 years from issue, before age 65–70). Conversion is the most underused feature of term insurance: it lets you upgrade to permanent coverage with no new medical exam, even if your health has changed."),
        ],
        "cta_headline": "Get a real term quote — across the top A-rated carriers in the nation.",
        "cta_sub": "One conversation. We'll show you the math, the carriers that fit your situation, and the actual monthly premium — no soft-quote bait.",
    },
    {
        "slug": "whole-life",
        "name": "Whole Life",
        "eyebrow": "Coverage 101 · 5-minute breakdown",
        "h1": "Whole life insurance — protection that doesn't expire.",
        "sub": "Lifetime coverage with guaranteed cash value. Slower to build, but it never ends and the cash value is yours to use.",
        "vsl_caption": "Why whole life premiums look high — and where the value actually shows up over 30 years.",
        "who": [
            ("People building generational wealth", "A whole life policy is one of the few assets that passes income-tax-free to the next generation and can be designed to fund estate taxes."),
            ("Business owners + key employees", "Funds buy-sell agreements, key-person insurance, and executive bonus plans. The cash value compounds tax-deferred on the business's balance sheet."),
            ("People who want a guaranteed bucket", "Cash value grows at a contractually guaranteed rate. No market volatility. You can borrow against it and the policy keeps compounding underneath the loan."),
            ("Parents and grandparents", "Locking in a child or grandchild's insurability at today's age and health is a gift they cannot replicate later. Most carriers let you do this from age 14 days."),
        ],
        "how": [
            ("Premiums never increase", "Whichever monthly premium you start with — that's the premium for life. Even at age 85, it doesn't change."),
            ("Cash value compounds tax-deferred", "Part of every premium funds a guaranteed cash value that grows each year. Most policies also pay dividends (if mutually-owned carrier) on top of the guarantee."),
            ("Borrow against it, tax-free", "You can take a policy loan against the cash value at any time, for any reason, without selling the asset. The death benefit reduces by the unpaid loan; the cash value keeps growing."),
        ],
        "facts": [
            "Premiums are guaranteed level for life.",
            "Cash value is guaranteed to grow each year (rate varies by carrier).",
            "Death benefit passes income-tax-free to your beneficiaries.",
            "Designed as a 30+ year vehicle — short-horizon math will make it look bad. Long-horizon math is where it wins.",
        ],
        "faqs": [
            ("Why is whole life so much more expensive than term?",
             "Because it never ends. You're not buying coverage for a window — you're buying coverage that will pay out at your death whenever that happens. The carrier knows it will pay the death benefit eventually, so the math is fundamentally different."),
            ("Is whole life a good investment?",
             "It's a savings instrument, not an investment. The internal rate of return on premiums vs. death benefit is usually 4–6% over 30+ years — comparable to a long-term bond, with the tax-free death benefit as the kicker. If you'd compare it to the S&P 500, you're using the wrong yardstick."),
            ("Can I stop paying premiums later?",
             "Many policies let you switch to \"paid-up\" status once cash value is sufficient — the policy stays in force using the cash value, with no further premiums. Some are explicitly designed as 10-pay or 20-pay so the premium schedule is finite by design."),
            ("What's an Infinite Banking policy?",
             "A whole life policy designed to maximize early cash value (via a paid-up additions rider) so the cash value can be borrowed against and used like a personal bank. The policy keeps compounding; the loan covers what you need. It's a real strategy, but it requires the policy to be designed for it from day one — not retrofitted."),
        ],
        "cta_headline": "Talk to an advisor about a properly-designed whole life policy.",
        "cta_sub": "Most whole life policies sold are designed for the agent's commission, not the policyholder's cash value. We'll show you the difference and quote it across our carriers.",
    },
    {
        "slug": "iul",
        "name": "IUL",
        "eyebrow": "Coverage 101 · 6-minute breakdown",
        "h1": "Indexed Universal Life — flexibility with a floor.",
        "sub": "Permanent coverage with cash value tied to a market index. Upside participation, 0% floor on downside, tax-advantaged retirement income.",
        "vsl_caption": "How IUL actually works — and why we lean toward variable-rate and uncapped crediting strategies when the carrier supports it.",
        "who": [
            ("High earners maxing out 401(k)/IRA", "Once you've hit qualified-plan limits, IUL becomes one of the few remaining vehicles for tax-advantaged long-term accumulation."),
            ("Business owners with variable income", "Premiums are flexible — pay more in good years, less in lean years, as long as the policy stays funded enough to maintain the death benefit."),
            ("Anyone planning tax-free retirement income", "Once cash value has built up, you can take policy loans against it in retirement. Properly structured, the loans are tax-free and don't reduce the death benefit if managed correctly."),
            ("Skeptics of market volatility", "The 0% floor means a bad market year is a 0% year, not a -30% year. The trade-off isn't one fixed cap — it's a participation rate or spread that depends on which crediting strategy your carrier offers and which one you qualify for."),
        ],
        "how": [
            ("Pick an index", "S&P 500 is the most common, but most carriers offer multiple indices and blends. The carrier credits gains based on the index's performance — without you owning the underlying."),
            ("Pick a crediting strategy", "Modern IULs offer multiple strategies on the same policy: capped (predictable ceiling), variable-cap (ceiling moves but participation is higher), and uncapped (no ceiling, with a participation rate or spread instead). We default to variable-rate or uncapped strategies when the carrier offers them and you qualify for the rate that makes the math work."),
            ("Pay flexible premiums", "Above a minimum needed to keep the policy in force, you can over-fund (within IRS limits) to build cash value faster. The more you fund early, the more compounding works in your favor."),
        ],
        "facts": [
            "0% floor — you cannot lose principal to a down market.",
            "Crediting strategy matters more than carrier brand. The carriers we use offer variable-cap and uncapped strategies on top of the standard capped option — we steer toward the strategy that fits your timeline and what your health qualifies for.",
            "Every crediting strategy has moving parts the carrier can adjust (caps, participation rates, spreads). The 0% floor is the only contractually-guaranteed piece.",
            "Cash value loans in retirement are tax-free when structured correctly.",
            "Death benefit is income-tax-free to beneficiaries.",
            "Underwriting matters — premium is often comparable to whole life for the same face amount, but the math changes dramatically with health rating, and so does the slate of crediting strategies you'll qualify for.",
        ],
        "faqs": [
            ("Is IUL too good to be true?",
             "It's a real product backed by carrier general accounts, not a scam. But it's also sold badly more often than any other policy. The math depends on the crediting strategy you select — capped, variable-cap, or uncapped — plus fees and how the loan provisions are structured. We illustrate at both guaranteed and current rates so you see both extremes before signing."),
            ("How is IUL different from whole life?",
             "Whole life has a guaranteed cash-value growth rate; IUL's cash value depends on index performance through your chosen crediting strategy. Whole life premiums are fixed; IUL premiums are flexible. Whole life dividends (if mutual) are smoother year to year; IUL can have a string of 0% years followed by 10%+ years — especially on variable-cap or uncapped strategies that swing harder than a fixed cap."),
            ("Capped vs. variable vs. uncapped — which one is right for me?",
             "Capped strategies trade upside for a predictable ceiling. Variable-cap raises the ceiling but the ceiling itself can move year to year. Uncapped removes the ceiling entirely in exchange for a participation rate (e.g. you get 70% of the index's gain) or a spread (the carrier keeps the first X% of the gain). For long horizons with appetite for swing, variable-cap and uncapped usually outperform capped — but only if the underlying carrier rate is competitive. We pick based on the carrier + rate you qualify for."),
            ("What's the catch with IUL loans?",
             "Loans are interest-charged (typically 3–5%) and the cash value keeps participating in the index while loaned. If the index returns more than the loan rate (the spread), you net positive. If it doesn't for years, the policy can lapse if not carefully managed — which forces a taxable event on accumulated gains. This is the #1 way IUL policies fail, regardless of which crediting strategy is used."),
            ("Why do some advisors hate IUL?",
             "Because it's sold with illustrations that assume the carrier's current crediting will hold forever, ignoring the carrier's ability to adjust caps, participation rates, or spreads. A properly illustrated IUL uses conservative assumptions across whichever crediting strategy is selected and shows the worst-case scenario alongside the projected one."),
        ],
        "cta_headline": "Get an IUL illustration that's actually honest.",
        "cta_sub": "We'll show you both the carrier's projected illustration AND the guaranteed-minimum illustration side by side — so you can see the range, not just the marketing.",
    },
    {
        "slug": "final-expense",
        "name": "Final Expense",
        "eyebrow": "Coverage 101 · 3-minute breakdown",
        "h1": "Final expense insurance — small policy, big peace of mind.",
        "sub": "$5K–$50K of coverage designed to handle burial, funeral, and end-of-life costs. Simplified issue, often no medical exam.",
        "vsl_caption": "Why families regret leaving final expenses uncovered — and how a $25K policy solves it for around $1/day.",
        "who": [
            ("Seniors without large coverage already", "If you're 50+ and your existing life insurance won't be in force when you pass (e.g. your term expires at 75), a small final-expense policy fills the gap that the family will actually need."),
            ("Anyone with health issues blocking traditional underwriting", "Simplified-issue products ask a short health questionnaire and skip the medical exam. Guaranteed-issue products skip the questions entirely (with a 2-year graded death benefit)."),
            ("Parents wanting to relieve their adult kids", "The average funeral now costs $7,000–$15,000. Final expense ensures your children aren't taking out loans or starting a GoFundMe in the worst week of their lives."),
            ("Anyone who wants the simplest possible product", "There's no cash-value optimization, no index, no riders to evaluate. Pay the premium, the carrier pays the benefit. Done."),
        ],
        "how": [
            ("Pick a face amount", "Most families land between $15K and $35K. Add up: casket + service + burial plot + headstone + reception + family travel + small debts. National average runs around $10K just for the funeral itself."),
            ("Answer the health questions", "Simplified-issue: 5–10 yes/no questions. If you answer no to all, you usually qualify at the best rate. If you answer yes to some, the carrier may offer a graded-benefit or guaranteed-issue policy instead."),
            ("Lock the rate for life", "Premiums never increase. Death benefit never decreases. As long as you pay the premium, the coverage is there — at any age."),
        ],
        "facts": [
            "Issue ages typically 40–85 (some carriers go to 89).",
            "Face amounts $5K–$50K (a few carriers go higher).",
            "No medical exam on simplified-issue products.",
            "Guaranteed-issue products have a 2- or 3-year graded benefit — die in those years from natural causes and the policy returns premiums + interest, not the full face amount.",
            "Premiums and death benefit are locked for life.",
        ],
        "faqs": [
            ("What's the difference between final expense and burial insurance?",
             "Same thing — different names. Both refer to small whole-life policies designed to cover end-of-life costs. \"Funeral insurance\" is another name for the same category."),
            ("Is final expense a rip-off?",
             "Per-dollar of coverage, final expense is more expensive than a regular life policy because the issue ages skew older and underwriting is light. But for someone who can't qualify for traditional underwriting at 70+, it's often the only available option — and the math works for the family that needs to bury you."),
            ("Can I just save the money in a CD instead?",
             "If you have the discipline, the cash, and the time, yes. The case for final expense is: you pay $40/month for 10 years ($4,800) and the family receives $25,000 the week you pass. The CD approach requires you to live long enough to fund it AND to not touch it. Different risks."),
            ("Why does the policy have a 2-year graded benefit?",
             "Because guaranteed-issue products skip health underwriting — anyone who applies is accepted. To protect against people with terminal diagnoses buying the policy on Monday and dying Thursday, carriers grade the benefit for the first 2–3 years. Death from accident pays the full benefit; death from natural causes returns premiums + interest."),
        ],
        "cta_headline": "Get a final-expense quote — even if other carriers declined.",
        "cta_sub": "We work with carriers that specialize in age 50+ underwriting, including guaranteed-issue products. One conversation and we'll know what you qualify for.",
    },
    {
        "slug": "annuities",
        "name": "Annuities",
        "eyebrow": "Coverage 101 · 7-minute breakdown",
        "h1": "Annuities — turning a lump sum into income you can't outlive.",
        "sub": "Fixed, indexed, immediate, deferred. Different annuities solve different problems. This is the framework that decides which one fits.",
        "vsl_caption": "The annuity conversation most agents skip — fees, surrender periods, and what \"guaranteed income\" actually means.",
        "who": [
            ("Retirees worried about outliving their money", "Longevity risk is the math problem the 4% rule was invented to solve and the math problem it doesn't fully solve. Annuities transfer that risk to the carrier."),
            ("Anyone with a maturing CD or large lump sum", "MYGA (multi-year guarantee annuities) often pay 1–2% more than CDs of equivalent duration, with tax-deferred growth."),
            ("Pre-retirees seeking guaranteed lifetime income", "Indexed annuities with income riders let you lock in a future guaranteed income stream while still participating (within caps) in market upside."),
            ("Conservative investors who want bond alternatives", "Fixed and indexed annuities offer principal protection with returns historically competitive with intermediate bonds — without interest-rate-risk drawdowns."),
        ],
        "how": [
            ("Choose your time horizon", "If you need income immediately, an immediate annuity (SPIA) starts paying within 12 months. If you have 5–10+ years before income is needed, a deferred annuity lets the money grow tax-deferred first."),
            ("Choose your growth model", "MYGA: a flat guaranteed rate (like a CD). FIA (Fixed Indexed Annuity): participates in market index with cap and 0% floor. Variable: fully participates in market subaccounts (more risk, more upside)."),
            ("Choose your income guarantee", "Most modern annuities have optional income riders that guarantee a future lifetime income stream regardless of account balance. You pay a small annual fee (0.95%–1.25%) for the rider; in exchange, your future income is contractually locked in."),
        ],
        "facts": [
            "Annuities are issued by insurance companies, not banks. The guarantee is only as strong as the carrier — read the carrier's A.M. Best rating before signing.",
            "Surrender periods (typically 5–10 years) limit how much you can withdraw early without penalty. Most contracts allow 10% annual withdrawals penalty-free.",
            "Tax-deferred growth — you don't pay tax on gains until you withdraw.",
            "Income payments are partially tax-free (return of basis) until your basis is exhausted; the rest is taxed as ordinary income.",
        ],
        "faqs": [
            ("Are annuity fees as bad as people say?",
             "Sometimes. Variable annuities can easily run 2–3.5% in total fees (mortality + subaccount + rider). MYGAs and most FIAs have no annual fees on the base contract — only the optional income rider fee. The bad reputation is mostly from variable annuities sold in the 90s and 2000s."),
            ("Will I lose my money to the insurance company if I die early?",
             "Depends on the payout option. \"Life only\" pays the highest income but stops at death. \"Life with X-year certain\" pays at least X years even if you die early. \"Joint life\" continues to a spouse. \"Cash refund\" returns any unpaid premium to your heirs. You choose the trade-off."),
            ("What's the difference between a 401(k) and an annuity?",
             "A 401(k) is an account that holds investments. An annuity is a contract with an insurance company. Both can be tax-deferred. The key difference: an annuity can guarantee income for life regardless of what the underlying investments do — a 401(k) cannot."),
            ("Should I roll my 401(k) into an annuity?",
             "Sometimes yes, sometimes absolutely not. The case for: you want guaranteed lifetime income and you've calculated the trade-off against the lost flexibility. The case against: you're under 60 with a long horizon, your existing 401(k) has low fees, and you don't need the guarantee. We'll help you do the math both ways."),
        ],
        "cta_headline": "Get an honest annuity comparison — across MYGA, FIA, and SPIA.",
        "cta_sub": "We'll quote multiple carriers and show you the actual contracts side-by-side. You'll see the surrender schedule, the cap, the rider fees — everything that's usually buried in the illustration footnotes.",
    },
    {
        "slug": "mortgage-protection",
        "name": "Mortgage Protection",
        "eyebrow": "Coverage 101 · 4-minute breakdown",
        "h1": "Mortgage protection — keep the family in the house, no matter what.",
        "sub": "A term life policy structured around your mortgage. If you pass during the term, the family pays off the home — or keeps the payment going.",
        "vsl_caption": "Why the mortgage company's MPI is almost always overpriced — and what to use instead.",
        "who": [
            ("New homeowners with a young family", "If your income covers the mortgage and your family can't, mortgage protection is the gap. Without it, the surviving spouse is choosing between selling the house and taking a second job."),
            ("Anyone who got an MPI letter from the bank", "The mortgage company's mailer is real coverage — but it's almost always 2–3× the price of equivalent term from an independent carrier. We'll show you the comparison."),
            ("Self-employed or commission-based earners", "Variable income makes traditional underwriting trickier, but most mortgage-protection policies allow simplified issue and underwrite around the loan amount rather than full lifestyle protection."),
            ("Anyone with a co-borrower on the loan", "Both borrowers should be covered. If only one passes, the surviving co-borrower is on the hook for the entire payment alone — that's the scenario this policy solves."),
        ],
        "how": [
            ("Match the policy to the mortgage", "Term length usually matches the remaining mortgage years (15, 20, 30). Face amount usually matches the current balance — or current balance + buffer for property tax and insurance."),
            ("Pick level or decreasing", "Level: face amount stays constant for the whole term — same as a regular term policy. Decreasing: face amount drops in line with the amortizing mortgage balance, premium is lower. Most modern policies are level (more flexibility for the family)."),
            ("Add living benefits if eligible", "Many mortgage-protection policies include riders for critical illness, chronic illness, and disability — letting you accelerate the death benefit if a major health event happens while you're still alive. Worth asking for; not always included by default."),
        ],
        "facts": [
            "It is regular term life insurance — just marketed around the mortgage need.",
            "The death benefit pays to your beneficiary, not the mortgage company. They decide how to use it — pay off, keep paying, invest.",
            "Almost always cheaper than the mortgage company's MPI program for the same coverage.",
            "Living-benefit riders (critical/chronic illness, disability) are commonly available and often free or low-cost.",
        ],
        "faqs": [
            ("Is mortgage protection insurance different from regular term life?",
             "Structurally, no — it's a term life policy. The difference is in how it's marketed and structured: face amount matched to mortgage balance, term matched to remaining loan years, and often bundled with living-benefit riders. You could buy regular term and use it the same way."),
            ("Should I buy from the mortgage company?",
             "Usually no. Their mailer is real coverage, but it's underwritten and priced for the broadest possible audience — meaning healthy applicants subsidize unhealthy ones. Independent underwriting through a brokerage almost always lands at a better rate for healthy applicants."),
            ("What's MPI versus PMI?",
             "PMI (Private Mortgage Insurance) protects the LENDER if you default — required when down payment is under 20%. MPI (Mortgage Protection Insurance) protects YOUR FAMILY by paying off the mortgage if you die. Two completely different products."),
            ("What happens if I sell the house or pay off the mortgage early?",
             "The policy doesn't end — it's life insurance, not a lender's product. You can keep it (still useful for income replacement) or surrender it. Most families keep it because the rate is locked at a younger age."),
        ],
        "cta_headline": "Compare mortgage-protection rates from real carriers.",
        "cta_sub": "Bring us the mortgage company's MPI letter and we'll quote the same coverage across our carriers — usually for substantially less.",
    },
]


def render_who(items):
    blocks = []
    for title, body in items:
        blocks.append(f"""      <article class="funnel-who-cell">
        <h3>{html.escape(title)}</h3>
        <p>{html.escape(body)}</p>
      </article>""")
    return "\n".join(blocks)


def render_how(steps):
    blocks = []
    for i, (title, body) in enumerate(steps, 1):
        blocks.append(f"""      <article class="funnel-step">
        <div class="funnel-step-num">{i:02d}</div>
        <h3>{html.escape(title)}</h3>
        <p>{html.escape(body)}</p>
      </article>""")
    return "\n".join(blocks)


def render_facts(facts):
    return "\n".join(f"      <li>{html.escape(f)}</li>" for f in facts)


def render_faqs(faqs):
    blocks = []
    for q, a in faqs:
        blocks.append(f"""      <details class="funnel-faq-item">
        <summary>{html.escape(q)}</summary>
        <p>{html.escape(a)}</p>
      </details>""")
    return "\n".join(blocks)


# Per-product qualifying fields injected into each funnel's CTA form.
# Field naming convention:
#   - Snake_case names that don't collide with the base fields (name,
#     email, phone, state, age, product, notes, health_*).
#   - app.js::buildLeadPayload sweeps any unknown field into
#     meta.qualifying, so adding a new field here doesn't require a
#     parallel edit on the JS side — just regenerate.
PRODUCT_FIELDS = {
    'term-life': """

      <label class="field">
        <span>Coverage amount you're considering</span>
        <select name="coverage_amount">
          <option value="">Help me decide</option>
          <option>$100K</option>
          <option>$250K</option>
          <option>$500K</option>
          <option>$1M</option>
          <option>$1.5M+</option>
        </select>
      </label>
      <label class="field">
        <span>Term length</span>
        <select name="term_length">
          <option value="">Help me decide</option>
          <option>10 years</option>
          <option>15 years</option>
          <option>20 years</option>
          <option>25 years</option>
          <option>30 years</option>
        </select>
      </label>""",

    'whole-life': """

      <label class="field">
        <span>Primary goal</span>
        <select name="whole_life_goal">
          <option value="">Help me decide</option>
          <option>Lifetime coverage</option>
          <option>Cash value growth</option>
          <option>Generational wealth transfer</option>
          <option>Infinite banking strategy</option>
          <option>Business / key-person</option>
        </select>
      </label>
      <label class="field">
        <span>Coverage amount</span>
        <select name="coverage_amount">
          <option value="">Help me decide</option>
          <option>$100K</option>
          <option>$250K</option>
          <option>$500K</option>
          <option>$1M+</option>
        </select>
      </label>
      <label class="field">
        <span>Existing permanent policy?</span>
        <select name="existing_permanent">
          <option value="">—</option>
          <option>No</option>
          <option>Yes — needs review</option>
          <option>Yes — happy with it</option>
        </select>
      </label>""",

    'iul': """

      <label class="field">
        <span>Desired monthly contribution</span>
        <input type="number" name="monthly_contribution" min="50" step="25" inputmode="numeric" placeholder="e.g. 300"/>
        <small class="field-hint">In dollars per month. We use this to pick the carriers whose IUL math actually works at your funding level.</small>
      </label>""",

    'final-expense': """

      <label class="field">
        <span>Coverage amount</span>
        <select name="coverage_amount">
          <option value="">Help me decide</option>
          <option>$5,000</option>
          <option>$10,000</option>
          <option>$15,000</option>
          <option>$25,000</option>
          <option>$35,000</option>
          <option>$50,000</option>
        </select>
      </label>
      <label class="field">
        <span>Who's the policy for?</span>
        <select name="policy_for">
          <option value="">—</option>
          <option>Myself</option>
          <option>Spouse</option>
          <option>Parent</option>
          <option>Other family</option>
        </select>
      </label>""",

    'annuities': """

      <label class="field">
        <span>Lump sum to deploy</span>
        <select name="lump_sum">
          <option value="">Help me decide</option>
          <option>Under $25K</option>
          <option>$25K – $50K</option>
          <option>$50K – $100K</option>
          <option>$100K – $250K</option>
          <option>$250K – $500K</option>
          <option>$500K+</option>
        </select>
      </label>
      <label class="field">
        <span>When do you need income?</span>
        <select name="time_horizon">
          <option value="">—</option>
          <option>Need it now</option>
          <option>1 – 5 years</option>
          <option>5 – 10 years</option>
          <option>10+ years</option>
        </select>
      </label>
      <label class="field">
        <span>Primary goal</span>
        <select name="annuity_goal">
          <option value="">Help me decide</option>
          <option>Guaranteed lifetime income</option>
          <option>Growth with principal protection</option>
          <option>Tax-deferred accumulation</option>
          <option>CD replacement</option>
        </select>
      </label>""",

    'mortgage-protection': """

      <label class="field">
        <span>Mortgage balance</span>
        <select name="mortgage_balance">
          <option value="">Help me decide</option>
          <option>Under $100K</option>
          <option>$100K – $250K</option>
          <option>$250K – $500K</option>
          <option>$500K – $750K</option>
          <option>$750K – $1M</option>
          <option>$1M+</option>
        </select>
      </label>
      <label class="field">
        <span>Years remaining on mortgage</span>
        <select name="mortgage_years_remaining">
          <option value="">—</option>
          <option>Under 10</option>
          <option>10 – 20</option>
          <option>20 – 30</option>
        </select>
      </label>
      <label class="field">
        <span>Is there a co-borrower?</span>
        <select name="co_borrower">
          <option value="">—</option>
          <option>No</option>
          <option>Yes — they need coverage too</option>
          <option>Yes — already covered</option>
        </select>
      </label>""",
}


def render_page(p):
    # Each product gets its own qualifying block, tailored to what the
    # advisor actually needs to know before the discovery call. The blocks
    # are defined in PRODUCT_FIELDS keyed by slug; missing → empty string
    # (i.e. nothing renders) so a new product can ship without forcing a
    # tailored block on day one.
    contribution_field = PRODUCT_FIELDS.get(p['slug'], '')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>{html.escape(p['name'])} — United Equity Partners</title>
<meta name="description" content="{html.escape(p['sub'])}">
<meta property="og:title" content="{html.escape(p['name'])} — United Equity Partners"/>
<meta property="og:description" content="{html.escape(p['sub'])}"/>
<meta property="og:type" content="website"/>
<meta name="theme-color" content="#2D1F18"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/styles.css"/>
<link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%232D1F18'/><text x='50' y='66' font-family='Fraunces,serif' font-size='52' font-weight='700' text-anchor='middle' fill='%23E8D5BC'>U</text></svg>"/>
</head>
<body>

{NAV}

<main>

<!-- FUNNEL HERO -->
<section class="funnel-hero">
  <div class="container">
    <p class="eyebrow">{html.escape(p['eyebrow'])}</p>
    <h1 class="display funnel-h1">{p['h1']}</h1>
    <p class="lede funnel-lede">{html.escape(p['sub'])}</p>

    <!-- VSL slot.
         To embed a video, replace the entire <div class="vsl-placeholder">
         block below with an iframe, e.g.:

           <iframe src="https://fast.wistia.net/embed/iframe/<id>"
                   title="{html.escape(p['name'])} VSL"
                   frameborder="0" scrolling="no" allowfullscreen
                   allow="autoplay; fullscreen"
                   class="vsl-iframe"></iframe>

         The .vsl-frame wrapper enforces a 16:9 aspect ratio so the
         iframe fills it correctly. -->
    <div class="vsl-frame" id="vsl">
      <div class="vsl-placeholder" role="img" aria-label="Video sales letter — coming soon">
        <div class="vsl-play" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="26,20 26,44 46,32" fill="currentColor"/></svg>
        </div>
        <div class="vsl-placeholder-meta">
          <strong>Video coming soon</strong>
          <span>{html.escape(p['vsl_caption'])}</span>
        </div>
      </div>
    </div>

    <div class="funnel-hero-cta">
      <a href="#talk" class="btn btn-primary">Talk to an advisor</a>
      <a href="#facts" class="btn btn-ghost">Skip to the facts ↓</a>
    </div>
  </div>
</section>

<!-- WHO IT'S FOR -->
<section class="section section-warm" id="who">
  <div class="container">
    <p class="eyebrow">Who it's for</p>
    <h2 class="display-2">Is {html.escape(p['name'].lower())} the right fit?</h2>
    <div class="funnel-who">
{render_who(p['who'])}
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="section" id="how">
  <div class="container">
    <p class="eyebrow">How it works</p>
    <h2 class="display-2">Three decisions, then you're done.</h2>
    <div class="funnel-how">
{render_how(p['how'])}
    </div>
  </div>
</section>

<!-- KEY FACTS -->
<section class="section section-warm" id="facts">
  <div class="container">
    <p class="eyebrow">Things to know</p>
    <h2 class="display-2">The facts that should drive the decision.</h2>
    <ul class="funnel-facts">
{render_facts(p['facts'])}
    </ul>
  </div>
</section>

{STRIP}

<!-- CTA -->
<section class="section section-deep" id="talk">
  <div class="container book-grid">
    <div>
      <p class="eyebrow eyebrow-light">Talk to a real advisor</p>
      <h2 class="display-2 light">{html.escape(p['cta_headline'])}</h2>
      <p class="body-lg light-soft">{html.escape(p['cta_sub'])}</p>
      <ul class="book-list">
        <li><span class="bullet"></span>No pressure — we teach, you decide</li>
        <li><span class="bullet"></span>We quote the top A-rated carriers in the nation, not just one</li>
        <li><span class="bullet"></span>Free review if you have existing coverage</li>
      </ul>
    </div>
    <form id="leadFormFunnel" class="card-form" data-product="{html.escape(p['name'])}">
      <h3>Request your call</h3>
      <label class="field">
        <span>Full name</span>
        <input type="text" name="name" required autocomplete="name"/>
      </label>
      <label class="field">
        <span>Email</span>
        <input type="email" name="email" required autocomplete="email"/>
      </label>
      <label class="field">
        <span>Phone</span>
        <input type="tel" name="phone" required autocomplete="tel"/>
      </label>
      <div class="row-2">
        <label class="field">
          <span>State</span>
          <input type="text" name="state" required maxlength="2" placeholder="TX" style="text-transform:uppercase"/>
        </label>
        <label class="field">
          <span>Age</span>
          <input type="number" name="age" min="18" max="99" placeholder="42"/>
        </label>
      </div>
      <input type="hidden" name="product" value="{html.escape(p['name'])}"/>

      <!-- Health snapshot — auto-disqualifiers for standard underwriting.
           A "yes" on any of these doesn't block the lead — it routes to
           a final-expense / graded-issue path inside Repflow so the
           advisor opens with the right carrier shortlist instead of
           pitching a standard term policy that will get declined. -->
      <fieldset class="field-health">
        <legend>Any of these apply? (so we line up the right carriers)</legend>
        <label class="check-row"><input type="checkbox" name="health_stroke" value="yes"/> <span>Stroke (any history)</span></label>
        <label class="check-row"><input type="checkbox" name="health_diabetes" value="yes"/> <span>Diabetes</span></label>
        <label class="check-row"><input type="checkbox" name="health_cancer" value="yes"/> <span>Cancer (any history)</span></label>
        <label class="check-row"><input type="checkbox" name="health_heart_attack" value="yes"/> <span>Heart attack</span></label>
        <label class="check-row"><input type="checkbox" name="health_tobacco" value="yes"/> <span>Tobacco use (current)</span></label>
      </fieldset>{contribution_field}

      <label class="field">
        <span>Anything else? (optional)</span>
        <textarea name="notes" rows="2" placeholder="e.g. existing policy details, timing"></textarea>
      </label>
      <button type="submit" class="btn btn-primary btn-block">Request my call</button>
      <p class="hc-fine">By submitting, you consent to be contacted by a UEP licensed agent at the number above.</p>
    </form>
  </div>
</section>

<!-- FAQ -->
<section class="section" id="faq">
  <div class="container funnel-faq-wrap">
    <p class="eyebrow">Frequently asked</p>
    <h2 class="display-2">Questions worth asking before you buy.</h2>
    <div class="funnel-faq">
{render_faqs(p['faqs'])}
    </div>
  </div>
</section>

</main>

{FOOTER}

<script src="/app.js" defer></script>
</body>
</html>
"""


def main():
    out_count = 0
    for p in PRODUCTS:
        path = ROOT / f"{p['slug']}.html"
        path.write_text(render_page(p))
        out_count += 1
        print(f"wrote {path.relative_to(ROOT)}")
    print(f"\n{out_count} coverage pages generated")


if __name__ == "__main__":
    main()
