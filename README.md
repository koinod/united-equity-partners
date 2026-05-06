# United Equity Partners — Marketing Site

Static marketing + lead-capture site for UEP. No build step. Deploys directly to Vercel.

## Pages
- `index.html` — home: hero, approach, products, trust, book-a-call form, careers tease
- `careers.html` — careers: roles, comp, application form

## Lead capture
All forms POST to `https://repflow.koino.capital/api/leads/inbound`. Source tags:
- `uep_website:hero` — hero quick-quote
- `uep_website:book` — main book-a-call form
- `uep_website:careers` — application form

`AGENCY_ID` defaults to the demo agency until UEP's real agency is created on Repflow. Override via `window.UEP_AGENCY_ID`.

## Local dev
```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy
```bash
vercel --prod
```
