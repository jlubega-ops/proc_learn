# Proc Learn — Full procurement tryout scenario

**Purpose:** Walk the current app from organisation setup through budget, annual plan, emergency plan, requisitions, and **all seven procurement methods** to payment and closure. Ends with a **method-difference matrix** (method selection → payment / closure) and **committee assignment rules**.

**This build (accurate as of the seven-method engines):**

| Area | How it works now |
| --- | --- |
| Methods | **Seven independent engines** — Open Domestic, Open International, Restricted Domestic, Restricted International, Quotation Method, Micro Procurement, Direct Procurement. There is **no** single “Tender” process. |
| Emergency | A **plan type** only (`EMERGENCY_PLANNING`). Not a method. After the emergency plan is approved, you still pick one of the seven methods on Form 5 Part II. |
| Triggers | Operational workflows start by `triggerKey` (e.g. `MICRO_PROCUREMENT_STARTED`), never by process display name. |
| Thresholds | PPDA **Guideline 1/2025** bands by category (Goods / Works / Consultancy). See § Thresholds below. |
| Orders | **Micro / Direct** → Purchase Instruction. **Quotation** → LPO. **Bidding methods** → Contract. |
| Acceptance | Micro / Direct / Quotation → Head User Department. Bidding → **Inspection/Acceptance Committee**. |

**Learning mode:** the system never marks students right or wrong and never hard-blocks on compliance. **Run validation** shows ticks / crosses; failed checks change the button to **“… with warnings”** and the choice is recorded.

### How the screens behave (read once)

- **My Tasks:** click the task **row** (or the eye icon) to open the record.
- **Department scoping:** User Department Officer and Head User Department tasks only go to users in the **requisition’s department**.
- **Run validation:** pick provider(s) → **Run validation** → each check spins ~3s → ✓ / ⚠ / ✗ → stage button (e.g. **Select supplier**, **Shortlist**, **Issue purchase instruction**, **Issue RFQs**, **Confirm eligibility**, **Submit post-qualification**). Failures → **“… with warnings”** → confirm **“… anyway”** or go back.
- **One acting mode:** committee banner on → only that committee’s work. Use **Switch back to organisation role** for org tasks. Yellow note if a task waits in the other mode.
- **Procurements menu:** All Procurements, RFQs & Bids, Evaluations, Awards, Purchase Instructions, Contracts / LPO, Deliveries & Inspections, Invoices, Payments, Closures — stage pages match role / seat.
- **Provider portal:** Assignments (accept PI / award / LPO / contract, delivery notes, invoices), Opportunities (quotations / bids). Same `/login` page.
- **Study shortcuts (optional):** On the officer procurement record, quiet **… on behalf** actions appear only while waiting on the provider (quotes/bids, clarifications, award/PI/LPO/contract accept, delivery note, invoice). Same status as the portal; marked **Generated** (not Provider portal). Decline / edit / withdraw stay portal-only.

**Shared password** (org users + providers): `password123`

**Org logins:** auto-generated on Org Admin → Users as `firstname.lastname@<orgcode>.proclearn`.

**Provider portal logins:** `sales@<providername>.<orgcode>.proclearn.test` — copy from the provider detail page.

Always **log out** before switching persona.

---

## Story — one PDE, one FY

Configure **Jinja Skills Polytechnic (JSP)** — Financial Year **2026/2027**.

The ICT Department will fund and plan annual buys, raise an **emergency** UPS case, and run **five classroom tracks** that exercise every method family. Open International and Restricted International use the **same step list** as their domestic twins (only advert geography / minimum working days differ) — run one of each domestically in class; note the international twins in the comparison table.

| Track | What | Method | Approx. value (UGX) | Why this band (Goods / Supplies) |
| --- | --- | --- | ---: | --- |
| A | Whiteboards + markers | **Micro Procurement** | 4,800,000 | ≤ 10M micro |
| B | Staff notebooks | **Quotation Method** | 54,000,000 | Above micro, ≤ 200M quotation |
| C | Server room UPS upgrade (lot) | **Restricted Domestic Bidding** | 280,000,000 | Above quotation, ≤ 400M restricted |
| D | Campus Wi‑Fi refresh | **Open Domestic Bidding** | 450,000,000 | Above restricted → open |
| E | Hall B UPS (emergency plan) | **Direct Procurement** | 8,500,000 | Documented grounds (urgency / continuity); not a separate “emergency method” |

Optional demo (same steps as D / C): **Open International** or **Restricted International** with a foreign-capable provider on the register — only change Form 5 method + advert/invite wording and minimum working days (20 / 15).

### Where “emergency” fits

| Stage | Emergency-specific | Same as normal |
| --- | --- | --- |
| Planning | Plan type **Emergency / unplanned**, shorter approval (no Contracts Officer), no planning period required | Needs an approved budget line |
| Requisition | Linked to the emergency plan item; justification states urgency | Form 5 Part I + same requisition chain |
| Method | Still one of the **seven** methods | CC still approves the method |
| Providers | Often **Direct** or **Micro** with one provider; RFQ shortlist may be **2** on emergency | Validation, portal accept, delivery, invoice, payment unchanged |

---

## Thresholds (Guideline 1/2025 — app bands)

| Category | Micro max | Quotation max | Restricted max | Open |
| --- | ---: | ---: | ---: | --- |
| Supplies / Goods | 10,000,000 | 200,000,000 | 400,000,000 | Above restricted (no ceiling) |
| Works | 20,000,000 | 400,000,000 | 800,000,000 | Above restricted |
| Consultancy (firm) | 10,000,000 | 200,000,000 | 400,000,000 | Above restricted |
| Consultancy (individual) | 10,000,000 | 100,000,000 | 200,000,000 | Above restricted |

**Direct** has **no** value ceiling but **requires documented legal grounds** on Form 5 Part II.

**Minimum bidding working days** (solicitation window): Quotation 5 · Restricted Domestic 10 · Restricted International / Open Domestic 15 · Open International 20 · Micro / Direct 0.

---

## Cast

### Departments

| Department | Code |
| --- | --- |
| ICT Department | ICT |
| Finance Department | FIN |
| Procurement & Disposal Unit | PDU |
| Estates & Administration | EST |

### Operational personas

Create by **name + department + role**. Login email is auto-generated.

| Display name | Department | Org role |
| --- | --- | --- |
| Amina Nalwoga | ICT | User Department Officer |
| Robert Ssekandi | ICT | Head User Department |
| Joan Atim | PDU | Procurement Officer |
| Michael Okello | PDU | Head PDU |
| Patrick Mbabazi | PDU | Contracts Officer |
| Esther Namukasa | FIN | Finance/Budget Officer |
| Lydia Nakato | FIN | Accounting Officer |
| Grace Auma | EST | Head User Department |

Grace chairs the **Contracts Committee**. She never receives ICT user-department tasks (department scoping).

### Committee seats (no separate committee logins)

Create users first → **Org Admin → Committees** → seat the same people. Switch with **Switch committee context**.

**Contracts Committee**

| Seat | Persona |
| --- | --- |
| Chairperson | Grace Auma (HOD Estates) |
| Member | Patrick Mbabazi (Contracts Officer) |

**Evaluation Committee**

| Seat | Persona |
| --- | --- |
| Chairperson | Robert Ssekandi (HOD ICT) |
| Member | Joan Atim (Procurement Officer — PDU member) |
| Secretary | Amina Nalwoga (UDO) |

**Inspection / Acceptance Committee** (bidding tracks only)

| Seat | Persona |
| --- | --- |
| Chairperson | Robert Ssekandi |
| Member | Amina Nalwoga |
| Secretary | Esther Namukasa |

---

## Phase 0 — Enter the organisation

1. Sign in as the **student** who owns / is enrolled in the project.
2. Open the project workspace → **Organization Administrator**.
3. Note the **org code** (embedded in login emails).

---

## Phase 1 — Organization Administrator setup

### 1.1 Structure & departments

1. **Organisation Structure** — display name **Jinja Skills Polytechnic**.
2. **Departments/Units** — create the four departments (codes exact).

### 1.2 Roles

Confirm: User Department Officer, Head User Department, Procurement Officer, Head PDU, Contracts Officer, Finance/Budget Officer, Accounting Officer.

Committee names also appear — they are **routing roles only**. Never assign them as a user’s login role.

### 1.3 Users

Create all eight personas. Copy each **Login email**.

### 1.4 Financial year

| Field | Value |
| --- | --- |
| Label | 2026/2027 |
| Start / End | 2026-07-01 → 2027-06-30 |
| Active | Yes |

### 1.5 Planning period (annual only)

| Field | Value |
| --- | --- |
| FY | 2026/2027 |
| Label | Annual planning 2026/2027 |
| Start / End | 2026-07-01 → 2027-06-30 |
| Status | **OPEN** |

### 1.6 Activate processes

**Process Workflows** — activate **all** of these:

Budgeting · Procurement Planning · Emergency Planning · Procurement Requisition · **Open Domestic Bidding** · **Open International Bidding** · **Restricted Domestic Bidding** · **Restricted International Bidding** · **Quotation Method** · **Micro Procurement** · **Direct Procurement** · Evaluation · Post-Qualification · LPO · Contract · Invoice · Payment.

### 1.7 Committees

Seat Contracts, Evaluation, and Inspection/Acceptance as in the cast table. Ineligible seats are refused with a message.

### 1.8 Provider register

**Log out** → sign in as **Joan** → **Providers → Add provider**. Use **Tick all (fully compliant)** unless noted.

| Provider | Category | Compliance | Used for |
| --- | --- | --- | --- |
| Lake Victoria Office Ltd | Goods | Tick all | Micro (A) |
| Pearl Notebooks Ltd | Goods | Tick all | Quotation (B) |
| Kampala SoftTech Ltd | Goods | Tax clearance **expired** | Quotation shortlist (fails validation) |
| Nile Systems Group Ltd | Goods | Tick all | Quotation + Restricted + Open winner |
| Horizon Networks UG Ltd | Goods | Missing NSSF | Restricted / Open (fails eligibility) |
| Twin Lakes Power Solutions | Goods | Tick all | Direct / emergency (E) |
| Apex Data Racks Ltd | Goods | Tick all | Restricted shortlist |
| Crestline IT Supplies Ltd | Goods | Tick all | Restricted shortlist |

Optional: **Generate providers** (Mixed) for auto-response bids on receive steps.

Copy portal logins for Lake Victoria, Pearl, Nile, Twin Lakes, Apex, Crestline.

---

## Phase 2 — Budget

**Login:** Amina → **Budgets → New**

| Field | Value |
| --- | --- |
| Title | ICT Department Budget 2026/2027 |
| FY | 2026/2027 |
| Department | ICT |

| Budget line | Amount (UGX) |
| --- | ---: |
| Teaching aids & classroom kit | 12,000,000 |
| Computing devices | 60,000,000 |
| Server & power continuity | 300,000,000 |
| Network & connectivity | 500,000,000 |
| Contingency / emergency power | 20,000,000 |

**Total 892,000,000.** Submit → approval:

| Step | Login as | Task |
| --- | --- | --- |
| 1 | Amina | Prepare Department Budget Requirement |
| 2 | Robert | Review Department Budget |
| 3 | Esther | Review and Consolidate Budgets |
| 4 | Lydia | Approve Budget |

**Checkpoint:** Budget **APPROVED**.

---

## Phase 3 — Annual procurement plan

**Login:** Amina → **Procurement Plans → Create**

| Field | Value |
| --- | --- |
| Plan type | **Annual procurement plan** |
| Title | ICT Annual Procurement Plan 2026/2027 |
| FY / Planning period | 2026/2027 / Annual planning 2026/2027 (OPEN) |
| Category per item | **Goods** (+ source of funding, e.g. Government of Uganda) |

| # | Title | Qty × unit | Line total | Budget line | Planned method |
| --- | --- | ---: | ---: | --- | --- |
| 1 | Interactive whiteboard kit | 4 × 1,200,000 | 4,800,000 | Teaching aids… | Micro Procurement |
| 2 | Staff notebooks (14") | 12 × 4,500,000 | 54,000,000 | Computing devices | Quotation Method |
| 3 | Server room UPS upgrade (lot) | 1 × 280,000,000 | 280,000,000 | Server & power… | Restricted Domestic Bidding |
| 4 | Campus Wi‑Fi refresh (lot) | 1 × 450,000,000 | 450,000,000 | Network… | Open Domestic Bidding |

Save → Submit → approval:

| Step | Login as | Task |
| --- | --- | --- |
| 1 | Amina | Preparation of Procurement Plan |
| 2 | Robert | Review and Approval of Procurement Plan |
| 3 | Michael | Consolidation of Procurement Plans |
| 4 | Patrick | Review Consolidated Procurement Plan |
| 5 | Lydia | Approve Consolidated Procurement Plan |

**Checkpoint:** Plan **APPROVED**.

---

## Phase 4 — Emergency planning

**Story:** Hall B UPS fails; exams in 10 days.

| Field | Value |
| --- | --- |
| Plan type | **Emergency / unplanned plan** |
| Title | Emergency — Hall B UPS replacement |
| FY | 2026/2027 |
| Planning period | None |
| Item | Online UPS 10kVA · 1 × 8,500,000 · Contingency / emergency power · **Goods** |
| Planned method on item | Direct Procurement (grounds: exam continuity / sole timely source) |

**Approval (no Contracts Officer step):**

| Step | Login as | Task |
| --- | --- | --- |
| 1 | Amina | Prepare Emergency Procurement Plan |
| 2 | Robert | Review Emergency Procurement Plan |
| 3 | Michael | Verify Emergency Plan and Funding Context |
| 4 | Lydia | Approve Emergency Procurement Plan |

---

## Phase 5 — Requisition + method selection (every track)

Same **Procurement Requisition Process** for every track. The procurement case is created **only after step 7**.

| Step | Login as | Mode | Task | Decision |
| --- | --- | --- | --- | --- |
| 1 | Amina | Org | Create Procurement Requisition (+ **PP Form 5 Part I**) | Submit |
| 2 | Robert | Org | Review Requisition | Endorse requisition and forward |
| 3 | Joan | Org | Verify Procurement Plan Availability | Confirm item is in plan and forward |
| 4 | Lydia | Org | Verify Funding Availability and Approve Requisition | Confirm funds and approve requisition |
| 6 | Joan | Org | Recommend Procurement Method (**Form 5 Part II**) | Recommend method |
| 7 | Grace or Patrick | **Contracts Committee** | Approve Procurement Method | Approve procurement method |

*(Step 5 is retired — funding + AO approval are combined in step 4.)*

**Form 5 Part II — method-specific duties before Recommend:**

| Method | On Form 5 Part II |
| --- | --- |
| **Micro** | Optionally pick **one** supplier → Run validation → Select supplier. Value must be ≤ category micro max. |
| **Direct** | Pick **one** provider + **Direct procurement basis** (legal grounds). No value ceiling. |
| **Quotation** | Shortlist ≥ **3** (≥ **2** if emergency) → Run validation → Shortlist. Fewer needs recorded justification. |
| **Restricted Domestic / International** | Shortlist eligible providers → Run validation → Shortlist (invite list for later). |
| **Open Domestic / International** | **No** provider shortlist — open advertisement. |

**Step 7:** account menu → **Switch committee context → Contracts Committee** → Approve → **Switch back to organisation role**.

**Result:** procurement case created; the matching method process starts (`MICRO_PROCUREMENT_STARTED`, `QUOTATION_STARTED`, `OPEN_DOMESTIC_BIDDING_STARTED`, etc.).

---

## Phase 6 — Track A: Micro Procurement (whiteboards)

### 6.1 Requisition

| Field | Value |
| --- | --- |
| Title | Procurement of interactive whiteboard kits for ICT labs |
| Plan item | Interactive whiteboard kit |
| Qty / value | 4 × 1,200,000 = **4,800,000** |
| Delivery | ICT Labs, JSP main campus |

Phase 5: Joan recommends **Micro Procurement**, selects **Lake Victoria Office Ltd**, CC approves.

### 6.2 Micro process (7 steps — no Evaluation / LPO / Contract / Inspection committee)

| Step | Who | Task | What to do |
| --- | --- | --- | --- |
| 1 | Joan | Issue Purchase Instruction | Prefill Lake Victoria → Run validation → **Issue purchase instruction to supplier** |
| — | **Lake Victoria (portal)** | — | Accept PI → Make delivery (qty 4) |
| 2 | Amina | Record Delivery/Receipt | Received = 4 → Receive delivered items and forward |
| 3 | Robert | Verify/Accept Delivery | Accept all received → Accept delivery and forward |
| — | **Lake Victoria (portal)** | — | Submit invoice (e.g. `LVO-INV-0912`, 4,800,000) |
| 4 | Patrick | Process Invoice | Process invoice and forward |
| 5 | Lydia | Approve Payment | Approve payment and forward |
| 6 | Esther | Record Payment | Record payment and forward |
| 7 | Patrick | Close Procurement | Close → **CLOSED** |

---

## Phase 7 — Track B: Quotation Method (notebooks)

### 7.1 Requisition → method

Value **54,000,000**. Joan recommends **Quotation Method**, shortlists Pearl, Kampala SoftTech, Nile. Validation flags Kampala ✗ → **Shortlist with warnings → anyway** → Recommend → CC approves.

### 7.2 Quotation process

| # | Who | Mode | Task | Notes |
| --- | --- | --- | --- | --- |
| 1 | Joan | Org | Prepare RFQ Documents | Fill RFQ → submit |
| 2 | Michael | Org | Review RFQ Documents | Approve |
| 3 | Grace / Patrick | **CC** | Approve RFQ Documents | Approve |
| 4 | Joan | Org | Issue RFQs to Suppliers | Shortlist prefilled → closing date → Run validation → Issue RFQs |
| 5–7 | Joan | Org | Receive / Close / Open Quotations | One screen: record or **Generate for all**; Close quotations; complete opens them |
| 10 | Robert | **Evaluation** | Technical Evaluation | Complete |
| 11 | Robert | **Evaluation** | Financial Evaluation | Run validation → recommend **Nile 52,800,000** → Submit evaluation report |
| 12 | Robert | **Evaluation** | Prepare Evaluation Report | Complete after report submitted |
| 13 | Michael | Org | Review Evaluation Report | Approve |
| 14 | Grace / Patrick | **CC** | Approve Evaluation Report | Approve |
| 15 | Michael | Org | Prepare Award Recommendation | Complete |
| 16 | Patrick | Org | Review Award Recommendation | Approve |
| 17 | Grace / Patrick | **CC** | Approve Award | Award to Nile |
| 18 | Joan | Org | Communicate Award Decision | Complete |
| — | **Nile (portal)** | — | Accept award | |
| 19 | Patrick | Org | Prepare LPO/Contract | Creates **LPO** (not contract) |
| 20 | Lydia | Org | Approve/Sign LPO/Contract | Approve |
| 21 | Joan | Org | Issue LPO/Contract | Complete |
| — | **Nile (portal)** | — | Accept LPO | |
| 22 | Joan | Org | Confirm Supplier Acceptance | Complete |
| — | **Nile (portal)** | — | Make delivery | |
| 23 | Amina | Org | Record Delivery | Against delivery note |
| 24 | Amina | Org | Verify Delivery | Accept / reject lines |
| 25 | Robert | Org | Certify Delivery | Approve (HOD — **no** inspection committee) |
| — | **Nile (portal)** | — | Submit invoice | |
| 26 | Esther | Org | Receive/Record Invoice | Choose invoice |
| 27 | Patrick | Org | Verify Invoice | Verify |
| 28 | Lydia | Org | Approve Payment | Approve |
| 29 | Esther | Org | Record Payment | Complete |
| 30 | Patrick | Org | Close Procurement | **CLOSED** |

Post-qualification is **not** required on Quotation unless the case is flagged for it.

---

## Phase 8 — Track C: Restricted Domestic Bidding (server UPS lot)

### 8.1 Requisition → method

Value **280,000,000**. Joan recommends **Restricted Domestic Bidding**, shortlists Nile, Apex, Crestline, Horizon → Run validation → Shortlist (Horizon may warn) → CC approves.

### 8.2 Restricted Domestic process

Same skeleton as Open Domestic **except step 4**:

| # | Who | Mode | Task | Notes |
| --- | --- | --- | --- | --- |
| 1–3 | Joan → Michael → CC | Org / CC | Prepare / Review / Approve **Bidding Documents** | |
| 4 | Joan | Org | **Invite Shortlisted Providers** | No public advert; invites go to Form 5 shortlist; min **10** working days |
| 5–7 | Joan | Org | Receive / Close / Open Bids | Same one-screen pattern as quotations |
| 8 | Michael | Org | Forward Bids for Evaluation | Complete |
| 11–13 | Robert | **Evaluation** | Technical → Financial → Prepare Evaluation Report | Run validation; recommend eligible lowest (e.g. Nile) |
| 14 | Michael | Org | Review Evaluation Report | Approve |
| 15 | Robert | **Evaluation** | **Post-Qualification where applicable** | Run validation → Submit post-qualification |
| 16 | Grace / Patrick | **CC** | Approve Evaluation/Recommendation | Report + post-qualification |
| 17 | Michael | Org | Prepare Award Recommendation | Complete |
| 18 | Grace / Patrick | **CC** | Approve Award | Creates award |
| 19 | Joan | Org | Communicate Award | Complete |
| — | Winner (portal) | — | Accept award | |
| 20–23 | Patrick → Lydia → Patrick → Joan | Org | Prepare / Sign / Issue **Contract** → Supplier Acceptance | **Contract**, not LPO. Portal must accept contract before Joan confirms |
| — | Winner (portal) | — | Make delivery | |
| 24 | Amina | Org | Delivery | Record received |
| 25 | Robert / Amina / Esther | **Inspection/Acceptance** | Inspection/Acceptance | Committee mode |
| — | Winner (portal) | — | Submit invoice | |
| 26–30 | Esther → Patrick → Lydia → Esther → Patrick | Org | Invoice → Verify → Payment Approval → Payment Recording → Closure | **CLOSED** |

**Restricted International** = same steps; Form 5 method = Restricted International; shortlist may include foreign providers; min **15** working days.

---

## Phase 9 — Track D: Open Domestic Bidding (Wi‑Fi)

### 9.1 Requisition → method

Value **450,000,000**. Joan recommends **Open Domestic Bidding** — **no** shortlist. CC approves.

### 9.2 Open Domestic process

Identical to Phase 8 **except step 4**:

| # | Task difference |
| --- | --- |
| 4 | **Advertise Tender** — open to every active **Goods** provider; min **15** working days |

Receive bids (Horizon cheap but fails NSSF; Nile eligible). Post-qualification on best evaluated bidder. Contract + Inspection/Acceptance Committee through payment and closure as in Phase 8.

**Open International** = same steps; advert is international; min **20** working days.

---

## Phase 10 — Track E: Direct Procurement (emergency UPS)

Emergency **plan** already approved (Phase 4).

| Field | Value |
| --- | --- |
| Title | Emergency replacement of Hall B UPS 10kVA |
| Plan | Emergency — Hall B UPS |
| Value | **8,500,000** |
| Delivery | Lecture Hall B, JSP |

Phase 5: Joan recommends **Direct Procurement**, selects **Twin Lakes Power Solutions**, fills **Direct procurement basis** (e.g. urgent continuity / sole timely source), Run validation → Select supplier → CC approves.

Then follow **Phase 6.2** (same Micro-style 7 steps: PI → delivery → HOD accept → invoice → payment → close). Portal: Twin Lakes accept PI, deliver, invoice.

**Teaching point:** emergency plan ≠ method. Urgency justified **Direct** (or Micro if within ceiling). Validation, acceptance, invoice and payment are **not** skipped.

---

## Phase 11 — Done checklist

| Check | Expect |
| --- | --- |
| Budget | APPROVED |
| Plans | 1 annual + 1 emergency APPROVED |
| Procurements | Micro, Quotation, Restricted Domestic, Open Domestic, Direct — all **CLOSED** |
| Orders | PI on Micro/Direct; LPO on Quotation; Contract on bidding |
| Acceptance | HOD on Micro/Direct/Quotation; Inspection committee on bidding |
| Run validation | Used on PI / RFQ / invites / evaluation / post-qualification where applicable |
| Committees | Work done in committee mode |
| Audit / bell | Activity logs and notifications for each decision |

---

## Quick role cheat-sheet

| When you need… | Log in as | Mode |
| --- | --- | --- |
| Structure, FY, processes, users, committees | Organization Administrator | — |
| Budget / plan / requisition (+ Form 5 Part I), record delivery | Amina | Org |
| Department endorse; Micro/Direct accept; Quotation certify delivery | Robert | Org |
| Plan consolidation; review docs & evaluation; award recommendation | Michael | Org |
| Form 5 Part II; PI; RFQ / bidding docs; solicit; communicate award; issue LPO; confirm acceptance | Joan | Org |
| Consolidated plan / award review; prepare LPO or contract; verify invoices; close | Patrick | Org |
| Budget consolidate; receive invoices (Quotation/bidding); record payments | Esther | Org |
| Final budget / plans / requisitions; sign LPO/contract; approve payments | Lydia | Org |
| Method, solicitation docs, evaluation, post-qualification, award | Grace or Patrick | **Contracts Committee** |
| Technical / financial eval, report, post-qualification | Robert / Joan / Amina | **Evaluation** |
| Bidding delivery acceptance | Robert / Amina / Esther | **Inspection/Acceptance** |
| Accept order, deliver, invoice | Provider | **Portal** |

---

## If something blocks you

| Symptom | Likely fix |
| --- | --- |
| Cannot create annual plan | Planning period not OPEN / FY inactive |
| Emergency submit: process inactive | Activate **Emergency Planning** |
| No budget lines on plan | Budget not APPROVED |
| No Recommend method task | AO has not approved the requisition (step 4) |
| Recommend OK but no procurement | Wait for **Contracts Committee** (step 7) |
| Micro refused | Value above category micro max — use Quotation / bidding / Direct |
| Direct refused | Missing Direct procurement basis text |
| Method process inactive | Activate that method’s process (+ Evaluation / LPO or Contract / Invoice / Payment as required) |
| Committee task missing | Switch into the committee / seat missing |
| HOD never gets requisition | Wrong department |
| Close quotations / bids first | Close (or wait for closing date) before completing receive |
| Award / LPO / contract / PI blocked | Provider must **Accept** in the portal |
| No delivery / invoice | Provider must Make delivery then Submit invoice after acceptance |
| Prepare Evaluation Report refused | Submit report on Evaluation panel first |
| Portal login fails | Use `sales@…proclearn.test`, password `password123` |

---

## Suggested session timing

| Block | Time |
| --- | --- |
| Phase 0–1 setup (incl. providers) | 35–50 min |
| Budget + annual plan | 20–30 min |
| Emergency plan | 10–15 min |
| Micro + Direct (PI paths) | 35–50 min |
| Quotation + evaluation + LPO | 40–55 min |
| Restricted Domestic + contract | 45–60 min |
| Open Domestic + contract | 45–60 min |

Split classes after shared setup: Team A Micro+Direct, Team B Quotation, Team C Restricted, Team D Open.

---

# How the methods differ — method selection through payment & closure

Use this after the tryout. **Everything after the order is accepted converges** (delivery → acceptance → invoice → AO payment → Finance records → Contracts Officer closes). The real differences are **how you get to that order**.

## 1. At a glance

| | Micro | Direct | Quotation | Restricted Domestic / International | Open Domestic / International |
| --- | --- | --- | --- | --- | --- |
| **Engine after CC method approval** | `MICRO_PROCUREMENT` | `DIRECT_PROCUREMENT` | `QUOTATION_PROCESS` | `RESTRICTED_*_BIDDING` | `OPEN_*_BIDDING` |
| **Value band (Goods)** | ≤ 10M | Any (grounds required) | ≤ 200M | ≤ 400M | Above restricted (typical) |
| **Form 5 providers** | Optional 1 supplier | **Required** 1 + legal grounds | Shortlist ≥ 3 (2 if emergency) | Shortlist (invite list) | None (open advert) |
| **Solicitation** | None (go to PI) | None (go to PI) | RFQ to shortlist | **Invite** shortlist | **Advertise** publicly |
| **Min working days** | 0 | 0 | 5 | 10 / 15 | 15 / 20 |
| **Evaluation committee** | No | No | Yes | Yes | Yes |
| **Post-qualification** | No | No | Only if flagged | Yes (default) | Yes (default) |
| **Award / CC award step** | No | No | Yes | Yes | Yes |
| **Order document** | **Purchase Instruction** | **Purchase Instruction** | **LPO** | **Contract** | **Contract** |
| **Who accepts goods** | Head User Department | Head User Department | Head User Department (certify) | **Inspection/Acceptance Committee** | **Inspection/Acceptance Committee** |
| **Invoice path** | Contracts Officer processes (combined) | Same as Micro | Finance receives → Contracts verifies | Finance → Contracts verifies | Same as Restricted |
| **Payment → close** | AO approve → Finance record → CO close | Same | Same | Same | Same |

## 2. Method selection (Form 5 Part II + CC)

Shared for all seven:

1. Requisition approved (funds committed).
2. Procurement Officer recommends a method on Form 5 Part II.
3. Contracts Committee approves → case opens on that method’s engine.

**Where they diverge at selection:**

- **Micro** — value ceiling enforced; optional single supplier prefills the PI.
- **Direct** — grounds text required; single provider; ceiling not applied.
- **Quotation / Restricted** — competitive shortlist + Run validation before recommend.
- **Open** — no shortlist; competition happens at advertisement.

Domestic vs International (open or restricted) does **not** change the step names after method approval — only market reach and minimum working days.

## 3. Solicitation & competition

| Family | What happens |
| --- | --- |
| **Micro / Direct** | No RFQ/bid stage. Officer issues a **Purchase Instruction** to the selected provider. |
| **Quotation** | Prepare RFQ → Head PDU → CC → Issue RFQs → receive/close/open quotations → Evaluation Committee. |
| **Restricted bidding** | Prepare **bidding documents** → Head PDU → CC → **Invite Shortlisted Providers** → receive/close/open bids → Head PDU forwards → Evaluation → **post-qualification** → CC. |
| **Open bidding** | Same as restricted, but step 4 is **Advertise Tender** (any eligible provider in category may bid). |

## 4. Award and legal instrument

| Family | Award | Instrument | Provider must accept |
| --- | --- | --- | --- |
| Micro / Direct | Implicit in PI issue | Purchase Instruction | PI |
| Quotation | CC **Approve Award** after eval report | **LPO** (prepare → AO sign → PO issue) | Award, then LPO |
| Bidding | CC **Approve Award** after eval + post-qual | **Contract** (prepare → AO sign → CO issue) | Award, then contract |

Micro/Direct never open LPO or Contract processes. Quotation never opens Contract. Bidding never opens LPO.

## 5. Delivery and acceptance

| Family | Record delivery | Accept / certify |
| --- | --- | --- |
| Micro / Direct | UDO | **HOD** (Verify/Accept Delivery) |
| Quotation | UDO record + verify | **HOD** Certify Delivery |
| Bidding | UDO Delivery | **Inspection/Acceptance Committee** |

Until acceptance (or partial acceptance), the provider cannot usefully invoice.

## 6. Invoice, payment, closure — what is the same

From a verified / processed invoice onward, **all methods share the same business outcome**:

1. Accounting Officer **approves payment**.
2. Finance/Budget Officer **records payment**.
3. Contracts Officer **closes** the procurement.

Micro/Direct compress invoice handling into one **Process Invoice** task for the Contracts Officer; Quotation and bidding keep **Receive/Record Invoice** (Finance) then **Verify Invoice** (Contracts Officer). Payment approval, recording, and closure roles are the same.

**Nothing after payment differs by method** — closure criteria are: order active and accepted, delivery accepted, invoice verified, payment recorded.

## 7. One diagram of divergence

```text
                    Form 5 Part II + Contracts Committee
                                   |
         +------------+------------+------------+------------+
         |            |            |            |            |
      MICRO        DIRECT     QUOTATION    RESTRICTED      OPEN
         |            |            |         (dom/int)    (dom/int)
         v            v            v            v            v
        PI           PI          RFQs      Invite list    Advertise
         |            |            |            |            |
         |            |       Evaluation   Evaluation+PQ  Evaluation+PQ
         |            |            |            |            |
         |            |          Award        Award        Award
         |            |            |            |            |
         |            |          LPO        Contract     Contract
         +------+-----+------+------+------+------+------+
                       |
              Provider accepts order
                       |
              Delivery + acceptance*
                       |
              Invoice → Payment → Close

* HOD (Micro/Direct/Quotation) vs Inspection Committee (bidding)
```

## 8. Teaching one-liners

- **Micro** — low value, fast PI path, no competition stage.
- **Direct** — same PI path as Micro, but **only** with written legal grounds (any value).
- **Quotation** — compare quotations from a shortlist; ends in an **LPO**; HOD certifies delivery.
- **Restricted** — invite a shortlist to bid; **contract** + post-qualification + inspection committee.
- **Open** — public advert; same post-award spine as Restricted.
- **International** variants — same spine as domestic; longer minimum days and wider market.
- **Emergency** — changes **planning**, not the method catalogue; pick Micro/Direct/Quotation/… as usual.

---

# Workflow guide — end-to-end chain

### Stage 1 — Organisation setup (Org Admin)

Departments → users → FY → OPEN planning period → activate all processes → seat committees → (PO/Head PDU) provider register.

### Stage 2 — Budget

UDO prepare → HOD review → Finance consolidate → AO approve.

### Stage 3 — Plan

**Annual:** UDO → HOD → Head PDU → Contracts Officer → AO.  
**Emergency:** UDO → HOD → Head PDU → AO (no Contracts Officer).

### Stage 4 — Requisition & method

UDO (+ Form 5 Part I) → HOD endorse → PO plan check → AO funds+approve → PO Form 5 Part II → **CC approve method** → case opens.

### Stage 5a — Micro / Direct

PO issues PI → provider accepts & delivers → UDO records → HOD accepts → provider invoices → CO processes invoice → AO payment → Finance records → CO closes.

### Stage 5b — Quotation

RFQ docs (PO → Head PDU → CC) → Issue RFQs → receive/open → Evaluation → Head PDU → CC report → award chain → **LPO** → provider accept → delivery → HOD certify → invoice → payment → close.

### Stage 5c — Bidding (Open or Restricted)

Bidding docs (PO → Head PDU → CC) → **Advertise** or **Invite** → receive/open → Head PDU forward → Evaluation → post-qualification → CC → award → **Contract** → provider accept → delivery → **Inspection Committee** → invoice → payment → close.

### Who approves what

| Decision | Made by |
| --- | --- |
| Budget, plans, requisition, LPO/contract signature, payment | **Accounting Officer** |
| Method, solicitation docs, evaluation report, post-qualification, award | **Contracts Committee** |
| Bid/quotation evaluation, report, post-qualification | **Evaluation Committee** |
| Acceptance of **bidding** deliveries | **Inspection/Acceptance Committee** |
| Acceptance of Micro / Direct / Quotation deliveries | **Head User Department** |
| Accepting PI / award / LPO / contract | **Provider** (portal) |

---

# Committee assignment rules

Seats go to **existing org users**. The app **refuses** blocked seats.

### Contracts Committee

| Who | Allowed? |
| --- | --- |
| Head PDU | **Blocked** (PPDA s.29(3)) |
| Finance/Budget Officer (head of finance) | **Blocked** |
| Anyone on Evaluation Committee | **Blocked** |
| HOD (other dept), Contracts Officer | Allowed |
| Accounting Officer / Procurement Officer | Allowed by app — *not recommended* |

### Evaluation Committee

| Who | Allowed? |
| --- | --- |
| Anyone on Contracts Committee | **Blocked** |
| PO or Contracts Officer as **Chairperson** | **Blocked** |
| PO / Contracts Officer as Member | Allowed (PDU member) |
| UDO / HOD | Allowed (chair or member) |

### Inspection / Acceptance Committee

| Who | Allowed? |
| --- | --- |
| PO or Head PDU as **Chairperson** | **Blocked** |
| HOD / UDO | Allowed (chair preferred) |
| Finance as Member / Secretary | Allowed |

### General

- Never assign *Contracts Committee* / *Evaluation Committee* / *Inspection/Acceptance Committee* as a user’s **login** role — seat them instead.
- Contracts ↔ Evaluation seats cannot overlap.
- Committee work needs **Switch committee context**; AO approvals stay on the org role.
