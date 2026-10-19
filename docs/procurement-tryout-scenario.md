# Proc Learn — Full procurement tryout scenario

**Purpose:** Walk the current app from organisation setup through budgeting, annual planning, **emergency planning**, requisitions, and three method branches (Micro, Quotation, Tender) to closure. At the end: a **step-by-step workflow guide** and the **committee assignment rules**.

**Style:** Role-directed, with realistic figures. Built for **this** Proc Learn build:
- engine processes started by `triggerKey`;
- Form 5 / Circular fill and emergency plans;
- provider register with **Run validation**;
- provider portal, where providers accept orders, deliver and invoice;
- committee evaluation and post-qualification.

**Learning mode:** the system never marks students right or wrong and never blocks on compliance. Wherever providers are chosen or evaluated, the system runs **Run validation** and shows ticks / crosses. If a check fails, the button changes to **"… with warnings"** and asks you to confirm; the warning is recorded on the file.

### How the screens behave (read once)

- **My Tasks:** click anywhere on a task **row** to open its record (budget, plan, requisition or procurement). The eye icon on the right does the same.
- **Department scoping:** *User Department Officer* and *Head User Department* tasks only go to users in the **requisition's department** (or a sub-unit under it). An Estates head never gets ICT approvals.
- **Run validation dialog:**
  1. After picking provider(s), click **Run validation**. Every check spins ("Verifying …") for about 3 seconds, then the results appear (green ✓ passed, yellow ⚠ expiring soon, red ✗ failed).
  2. The dialog then shows **Cancel**, **Run again** and the **stage button** — e.g. **Select supplier**, **Shortlist**, **Issue purchase instruction to supplier**, **Issue RFQs to suppliers**, **Confirm eligibility results**, **Submit post-qualification**.
  3. If any check failed, the stage button reads **"… with warnings"**. A second screen lists the issues, with **"… anyway"** or **Go back**.
  4. On **Issue purchase instruction** and **Issue RFQs**, the stage button also **completes the task**.
- **One acting mode at a time:** while you are in a committee seat (banner at the top), you can only act on that committee's work. Organisation-role tasks are hidden until you click **Switch back to organisation role**. Committee work only works after switching into that committee. If a task is waiting for you in the other mode, the page shows a yellow **"Task waiting in another role"** note.
- **Procurements menu (sidebar dropdown):**
  - The menu has **All Procurements**, **RFQs & Bids**, **Evaluations**, **Awards**, **Purchase Instructions**, **Contracts / LPO**, **Deliveries & Inspections**, **Invoices**, **Payments** and **Closures**.
  - You only see the stage pages your role (or current committee seat) works on.
  - Every row shows the current step, who it is pending on, and a chip: **Your turn**, **Yours — switch role**, **Waiting on others** or **Workflow complete**.
- **Procurement page:**
  - A **Workflow progress** card shows every step (✓ done, ⏳ current, ○ not started) and who the current step waits on.
  - **Decision names say what the step does** (e.g. *Receive delivered items and forward*). **Return for correction** and **Reject** are always the other two choices.
  - Oversight roles and committee seats see some sections marked **View only**.
- **Provider portal:**
  - The sidebar has **Assignments, Opportunities, Invoices, Payments**, plus **Notifications** and **Profile**. On a phone, open it with the ☰ button.
  - **Assignments** is where a provider **accepts** a purchase instruction, award, LPO or contract, **makes deliveries** (delivery note) and **submits invoices**.
  - **Opportunities** is where it submits, edits or withdraws quotations and bids.

**Shared password for org users and providers:** `password123`

**Org user logins** are auto-generated on **Org Admin → Users** as `firstname.lastname@<orgcode>.proclearn`. No two users in one organisation may share the same first + last name. Renaming a user changes their login.

**Provider portal logins** are auto-generated as `sales@<providername>.<orgcode>.proclearn.test` ("Ltd", "Limited" etc. dropped). Copy them from the provider's detail page. Providers sign in on the same `/login` page.

Always **log out** of one persona before logging in as the next.

---

## Story (one PDE, one FY)

You are configuring a teaching organisation for **Nakawa Skills Institute (NSI)** — Financial Year **2026/2027**.

The ICT Department must:

1. Fund and plan its annual ICT buys.
2. Run an **emergency** purchase when a lecture-hall UPS fails mid-semester.
3. Complete **three** concurrent procurements under different methods.

| Track | What | Method | Approx. value |
| --- | --- | --- | ---: |
| A | Whiteboards + markers kit | Micro | UGX 4,800,000 |
| B | Staff notebooks (laptops) | Quotation | UGX 54,000,000 |
| C | Campus Wi‑Fi refresh (lot) | Tender | UGX 95,000,000 |
| E | Emergency UPS replacement | Emergency plan → then Micro (single provider) | UGX 8,500,000 |

### Where "emergency" fits (read once)

In this build, emergency is a **planning path**, not a separate procurement method.

| Stage | What is emergency-specific | What is the same as normal |
| --- | --- | --- |
| Planning | **Emergency / unplanned plan** type, `…-EP-…` reference, no planning period needed, shorter approval (no Contracts Officer step) | Budget line must be approved |
| Requisition | Linked to the emergency plan item; justification explains the urgency | Form 5 Part I, same approval chain |
| Method | Nothing special — the Procurement Officer recommends on Form 5 Part II and the Contracts Committee approves | Methods available: **Micro, Quotation, Tender** |
| Providers | Usually **one** provider picked directly (Micro → purchase instruction). RFQ shortlist may drop to **2** for emergencies | Run validation, provider acceptance, delivery, invoice and payment are identical |

**PPDA note for facilitators (Guideline 1/2025):** thresholds depend on category (e.g. Supplies Micro ≤ **10M**, Works Micro ≤ **20M**; Quotation and Tender bands above that). Open/Restricted bidding are **Tender subtypes** (same Tender process). Emergency / sole-source **Direct** uses the **Micro** path with Direct justification (no separate Direct engine).

---

## Cast (create these org users)

### Departments

| Department | Code |
| --- | --- |
| ICT Department | ICT |
| Finance Department | FIN |
| Procurement & Disposal Unit | PDU |
| Estates & Administration | EST |

### Operational personas

Create by **name + department + role** only. Login email is auto-generated.

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

Grace exists to chair the **Contracts Committee**. Because user-department roles are department-scoped, she never receives ICT approval tasks.

### Committee seats (assign existing users — no separate committee logins)

Do **not** create committee users. Create the cast under **Users** first, then seat those same people under **Org Admin → Committees**. Each person keeps their org role and uses **Switch committee context** in the account menu when a committee action is needed.

**Contracts Committee** (required — approves the method for every case; for Quotation / Tender also the solicitation documents, evaluation report, post-qualification and award)

| Seat | Persona |
| --- | --- |
| Chairperson | Grace Auma (Head User Department, Estates) |
| Member | Patrick Mbabazi (Contracts Officer) |

**Evaluation Committee**

| Seat | Persona |
| --- | --- |
| Chairperson | Robert Ssekandi (Head User Department, ICT) |
| Member | Joan Atim (Procurement Officer — the PDU member) |
| Secretary | Amina Nalwoga (User Department Officer) |

**Inspection / Acceptance Committee**

| Seat | Persona |
| --- | --- |
| Chairperson | Robert Ssekandi (Head User Department) |
| Member | Amina Nalwoga (User Department Officer) |
| Secretary | Esther Namukasa (Finance/Budget Officer) |

See **Committee assignment rules** at the end for why these seats are allowed and which ones the app refuses.

---

## Phase 0 — Enter the organisation

1. Sign in as the **student** who owns / is enrolled in the project.
2. Open the project workspace. You land as **Organization Administrator** (configuration only — no approval authority).
3. Note the org code shown in the UI — it is embedded in each login email.

---

## Phase 1 — Organization Administrator setup

**Login:** Organization Administrator

### 1.1 Structure & departments

1. **Organisation Structure** — set PDE display name to **Nakawa Skills Institute**.
2. **Departments/Units** — create the four departments above (codes exact).

### 1.2 Roles

**Roles & Permissions** — confirm the core roles exist: User Department Officer, Head User Department, Procurement Officer, Head PDU, Contracts Officer, Finance/Budget Officer, Accounting Officer.

*Contracts Committee*, *Evaluation Committee* and *Inspection/Acceptance Committee* also appear. They are **workflow routing roles only** — never assign them as a user's login role.

### 1.3 Users

**Users** — create all eight personas (name, department, role). Copy each **Login email**.

### 1.4 Financial year

**Financial Years**

| Field | Value |
| --- | --- |
| Label | 2026/2027 |
| Start | 2026-07-01 |
| End | 2027-06-30 |
| Active | Yes |

### 1.5 Planning period (annual only)

**Planning Periods**

| Field | Value |
| --- | --- |
| FY | 2026/2027 |
| Label | Annual planning 2026/2027 |
| Start / End | 2026-07-01 → 2027-06-30 |
| Status | **OPEN** |

### 1.6 Activate processes

**Process Workflows** — activate **all** of these (activation ≠ starting a case):

Budgeting · Procurement Planning · **Emergency Planning** · Procurement Requisition · Micro Procurement · Quotation · Tender · Evaluation · Post-Qualification · LPO · Contract · Invoice · Payment.

### 1.7 Committees

**Committees** — users from §1.3 must already exist.

1. **Create committee** → type **Contracts**, then use **Add seat**: Grace → Chairperson; Patrick → Member.
2. Create committee **Evaluation**, then Add seat: Robert → Chairperson; Joan → Member; Amina → Secretary.
3. Create committee **Inspection/Acceptance**, then Add seat: Robert → Chairperson; Amina → Member; Esther → Secretary.

The organisation-user picker already hides ineligible roles; cross-committee conflicts are refused with a message.

### 1.8 Provider register

The register is maintained by the **Procurement Officer** or **Head PDU** (sidebar → **Providers**). The Organisation Administrator only has a read-only view.

**Log out**, sign in as **Joan**, and **Add provider** for each row. Tick the registrations and compliance documents with expiry dates; **Tick all (fully compliant)** fills every document with a valid one-year expiry.

| Provider | Category | Compliance to set | Used for |
| --- | --- | --- | --- |
| Lake Victoria Office Ltd | Goods | Tick all | Micro (Track A) |
| Pearl Notebooks Ltd | Goods | Tick all | Quotation shortlist |
| Kampala SoftTech Ltd | Goods | Tick all, but tax clearance expiry in the past | Quotation shortlist ("Doesn't qualify" case) |
| Nile Systems Group Ltd | Goods | Tick all | Quotation + tender winner |
| Horizon Networks UG Ltd | Goods | Tick all except NSSF | Tender (fails eligibility) |
| Twin Lakes Power Solutions | Goods | Tick all | Emergency UPS |

Optional: **Generate providers** (e.g. 8, **Mixed (realistic market)**) for a busier market. Generated providers are **auto-response providers**: on the *Receive quotations / bids* step the officer clicks **Generate for all** (or for one provider) and each answers in character. They may quote high or low, arrive late, or not respond. Everything after the offer — accepting, delivering, invoicing — is done through their **portal login**, like any other provider.

**Copy these portal logins now** (provider detail → Portal login): Lake Victoria, Pearl, Nile, Twin Lakes.

---

## Phase 2 — Budget (must be approved before planning)

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
| Network & connectivity | 110,000,000 |
| Power & continuity (UPS) | 15,000,000 |

Submit. **Approval chain (Budgeting Process):**

| Step | Login as | Task |
| --- | --- | --- |
| 1 | Amina — UDO | Prepare Department Budget Requirement (the submit) |
| 2 | Robert — Head User Department | Review Department Budget |
| 3 | Esther — Finance/Budget Officer | Review and Consolidate Budgets (total **197,000,000**) |
| 4 | Lydia — Accounting Officer | Approve Budget |

**Checkpoint:** Budget **APPROVED**; lines available for plans.

---

## Phase 3 — Annual procurement plan (Circular sheet)

**Login:** Amina → **Procurement Plans → Create**

| Field | Value |
| --- | --- |
| Plan type | **Annual procurement plan** |
| Title | ICT Annual Procurement Plan 2026/2027 |
| FY / Planning period | 2026/2027 / Annual planning 2026/2027 (OPEN) |
| Circular sheet | Goods, works and non-consultancy |

| # | Title | Qty | Unit price (UGX) | Line total | Budget line | Planned method |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | Interactive whiteboard kit | 4 | 1,200,000 | 4,800,000 | Teaching aids… | Micro procurement |
| 2 | Staff notebooks (14") | 12 | 4,500,000 | 54,000,000 | Computing devices | Request for quotations |
| 3 | Campus Wi‑Fi refresh (lot) | 1 | 95,000,000 | 95,000,000 | Network… | Open domestic bidding |
| 4 | Spare UPS units (stock) | 2 | 4,000,000 | 8,000,000 | Power… | Request for quotations |

Set each item's **category = Goods** (it carries to the requisition and decides which providers may bid on a tender). Save → Submit.

**Approval chain (Procurement Planning Process):**

| Step | Login as | Task |
| --- | --- | --- |
| 1 | Amina | Preparation of Procurement Plan (the submit) |
| 2 | Robert — HOD | Review and Approval of Procurement Plan |
| 3 | Michael — Head PDU | Consolidation of Procurement Plans |
| 4 | Patrick — Contracts Officer | Review Consolidated Procurement Plan |
| 5 | Lydia — AO | Approve Consolidated Procurement Plan |

**Checkpoint:** Plan **APPROVED**.

---

## Phase 4 — Emergency planning

**Story:** Hall B UPS fails; exams in 10 days.

**Login:** Amina → **Procurement Plans → Create**

| Field | Value |
| --- | --- |
| Plan type | **Emergency / unplanned plan** |
| Title | Emergency — Hall B UPS replacement |
| FY | 2026/2027 |
| Planning period | None (allowed) |
| Item | Online UPS 10kVA for Hall B · 1 × 8,500,000 · Power & continuity (UPS) · Goods |
| Circular | Planned method *Direct procurement* (executed as Micro); justification = exam continuity |

**Budget note:** the Power line (15,000,000) also carries annual item 4 (8,000,000). Do **not** raise a requisition for the spare UPS, or the emergency requisition will hit *Insufficient funds*.

**Approval chain (Emergency Planning Process — no Contracts Officer step):**

| Step | Login as | Task |
| --- | --- | --- |
| 1 | Amina | Prepare Emergency Procurement Plan (the submit) |
| 2 | Robert — HOD | Review Emergency Procurement Plan |
| 3 | Michael — Head PDU | Verify Emergency Plan and Funding Context |
| 4 | Lydia — AO | Approve Emergency Procurement Plan |

---

## Phase 5 — Requisition and method selection (every track)

Each track starts with the same **Procurement Requisition Process** (7 steps). The procurement case only exists **after step 7**.

| Step | Login as | Mode | Task | Decision |
| --- | --- | --- | --- | --- |
| 1 | Amina — UDO | Org | Create Procurement Requisition (+ **Form 5 Part I** on the same form) | Submit |
| 2 | Robert — HOD | Org | Review Requisition | **Endorse requisition and forward** |
| 3 | Joan — PO | Org | Verify Procurement Plan Availability | **Confirm item is in plan and forward** |
| 4 | Lydia — AO | Org | Verify Funding Availability and Approve Requisition (commits funds on the budget line) | **Confirm funds and approve requisition** |
| 6 | Joan — PO | Org | Recommend Procurement Method (**Form 5 Part II**) | **Recommend method** |
| 7 | Grace or Patrick | **Contracts Committee** | Approve Procurement Method (Contracts Committee) | **Approve procurement method** |

**Form 5 Part I** fields: market price, multi-year contracting, vote / head no. (e.g. 221001), programme, sub-programme, funding item, balance remaining, member name and title.

**Form 5 Part II** (step 6):
- **Recommended method:**
  - **MICRO** is only allowed up to **UGX 10,000,000**. Above that, the system refuses MICRO, and step 7 re-checks it.
  - QUOTATION and TENDER have no ceiling.
- **Micro:** optionally tick **one** supplier → **Run validation** → **Select supplier**. This prefills the purchase instruction later.
- **Quotation:**
  - Shortlist providers → **Run validation** → **Shortlist**.
  - At least **3** providers are needed (**2** for emergency); fewer requires a recorded justification.
  - **Recommend method** stays disabled until the shortlist is confirmed.
- **Tender:** no provider selection; the tender is advertised openly.

**Step 7:**
1. In the account menu, choose **Switch committee context → Contracts Committee**. The yellow banner appears.
2. Open the task and **Approve**.
3. Click **Switch back to organisation role**.

**Result:** a procurement case (e.g. **PROC-2026-0001**) is created and the Micro / Quotation / Tender process starts.

---

## Phase 6 — Track A: Micro (whiteboards)

### 6.1 Requisition

**Login:** Amina → **Requisitions → New**

| Field | Value |
| --- | --- |
| Title | Procurement of interactive whiteboard kits for ICT labs |
| Plan / item | ICT Annual Procurement Plan 2026/2027 / Interactive whiteboard kit |
| Budget line | Teaching aids & classroom kit |
| Qty / unit price | 4 × 1,200,000 = **4,800,000** |
| Required by | 2026-09-30 |
| Justification | Replace failing boards in Labs 1–2 |
| Delivery location | ICT Labs, NSI main campus |
| Form 5 Part I | Market price 4,800,000; funding item Teaching aids; balance 12,000,000; member Amina Nalwoga, User Department Officer |

Run **Phase 5** steps 2–7, with these values:
- Joan recommends **MICRO**, with justification *within the 10M micro ceiling; standard goods*.
- Joan selects **Lake Victoria Office Ltd** → **Run validation** → **Select supplier**, then **Recommend method**.
- The Contracts Committee approves.

### 6.2 Micro Procurement Process (7 steps) — no committees

Everyone works in their **organisation role**. Open the case from **My Tasks** (or **Procurements → All Procurements**).

| Step | Who | Task | What to do |
| --- | --- | --- | --- |
| 1 | Joan — PO | Issue Purchase Instruction | Lake Victoria is prefilled → **Run validation** → **Issue purchase instruction to supplier** (completes the task). The PI shows UGX 4,800,000 and *Deliver to: ICT Labs, NSI main campus* |
| — | **Lake Victoria (portal)** | — | **Assignments** → open PROC → **Accept** the purchase instruction (full name) → **Make delivery**: sending now = 4, delivered by, dispatch date → submit the delivery note |
| 2 | Amina — UDO | Record Delivery/Receipt | **Delivery & inspection** card shows the provider's note → enter **Received = 4** → **Record delivery** → decision **Receive delivered items and forward** |
| 3 | Robert — HOD | Verify/Accept Delivery | Inspection notes → **Accept all received** → **Accept delivery and forward**. Micro has no inspection committee |
| — | **Lake Victoria (portal)** | — | **Assignments** (or **Invoices**) → **Submit invoice**: own ref `LVO-INV-0912`, amount 4,800,000. System numbers it `INV-PROC-…-001` |
| 4 | Patrick — Contracts Officer | Process Invoice | Choose Lake Victoria's invoice → **Process invoice and forward** (certifies + verifies in one step) |
| 5 | Lydia — AO | Approve Payment | **Approve payment and forward** (payment raised from the verified invoice) |
| 6 | Esther — Finance | Record Payment | **Record payment and forward** → status **READY_FOR_CLOSURE** |
| 7 | Patrick | Close Procurement | Comment → **Close procurement** → **CLOSED** |

Org users **cannot** create invoices — they always come from the provider portal. If the provider has not accepted the PI or dispatched goods, step 2 says so ("Waiting for the provider to accept the purchase instruction." / "The provider has not delivered yet.").

---

## Phase 7 — Track B: Quotation (notebooks) — run in parallel

### 7.1 Requisition → method

| Field | Value |
| --- | --- |
| Title | Supply of 12 staff notebooks for ICT trainers |
| Plan item / budget line | Staff notebooks (14") / Computing devices |
| Lines | 12 × 4,500,000 = **54,000,000** |
| Delivery location | ICT staff room, NSI main campus |

Run **Phase 5**:
- Joan recommends **QUOTATION** and shortlists Pearl, Kampala SoftTech and Nile.
- **Run validation** flags Kampala ✗ (tax clearance). Click **Shortlist with warnings → Shortlist anyway**, then **Recommend method**.
- The Contracts Committee approves.

### 7.2 Quotation Process — step by step

| # | Who | Mode | Task | Notes |
| --- | --- | --- | --- | --- |
| 1 | Joan | Org | Prepare RFQ Documents | Fill the RFQ (subject, specs) → submit |
| 2 | Michael — Head PDU | Org | Review RFQ Documents | Approve |
| 3 | Grace / Patrick | **CC** | Approve RFQ Documents | Approve |
| 4 | Joan | Org | Issue RFQs to Suppliers | Shortlist prefilled from Form 5 → set **closing date** (20–30 min ahead in class) → **Run validation** → **Issue RFQs to suppliers with warnings → anyway** |
| 5–7 | Joan | Org | Receive Quotations → Close/Lock Quotation Submission → Open Quotations | **One screen:** record offers and click **Generate for all** for auto-response providers (any that stay silent show **No response**). Click **Close quotations** to lock early, or wait for the closing date. Completing the step then also closes and opens the quotations (Close and Open complete automatically) |
| 10 | Robert (chair) | **Evaluation** | Technical Evaluation | Complete |
| 11 | Robert | **Evaluation** | Financial Evaluation | Complete, then on the **Evaluation** panel: **Run validation** → Kampala ✗ → **Confirm eligibility results with warnings → anyway**. Recommended bidder defaults to lowest eligible: **Nile, 52,800,000** → **Submit evaluation report** (Amina as Secretary may edit the draft) |
| 12 | Robert | **Evaluation** | Prepare Evaluation Report | Complete (refused until the report is submitted) |
| 13 | Michael | Org | Review Evaluation Report | Approve |
| 14 | Grace / Patrick | **CC** | Approve Evaluation Report | Approve — marks the report APPROVED |
| 15 | Michael | Org | Prepare Award Recommendation | Complete |
| 16 | Patrick | Org | Review Award Recommendation | Approve |
| 17 | Grace / Patrick | **CC** | Approve Award | Creates the award to Nile (52,800,000) |
| 18 | Joan | Org | Communicate Award Decision | Complete |
| — | **Nile (portal)** | — | — | **Assignments** → **Accept award** |
| 19 | Patrick | Org | Prepare LPO/Contract | Creates the LPO (refused until the award is accepted). Delivery address from the requisition; editable while DRAFT / APPROVED |
| 20 | Lydia — AO | Org | Approve/Sign LPO/Contract | Approve |
| 21 | Joan | Org | Issue LPO/Contract | Complete |
| — | **Nile (portal)** | — | — | **Accept LPO** |
| 22 | Joan | Org | Confirm Supplier Acceptance | Complete (refused until the LPO is accepted) |
| — | **Nile (portal)** | — | — | **Make delivery** (optional: 7 now, 5 later) |
| 23 | Amina | Org | Record Delivery | Enter received quantities against the delivery note |
| 24 | Amina | Org | Verify Delivery | Mark each line accepted / rejected |
| 25 | Robert | Org | Certify Delivery | Approve |
| — | **Nile (portal)** | — | — | **Submit invoice** `NSG-2026-0457`, 52,800,000 |
| 26 | Esther — Finance | Org | Receive/Record Invoice | Choose Nile's invoice |
| 27 | Patrick | Org | Verify Invoice | Verify |
| 28 | Lydia | Org | Approve Payment | Approve |
| 29 | Esther | Org | Record Payment | Complete |
| 30 | Patrick | Org | Close Procurement | **CLOSED** |

Quotations: Pearl submits **53,400,000** in the portal (**Opportunities → Submit quotation**), and Joan records Kampala (**54,900,000**) and Nile (**52,800,000**). Post-qualification is **not** part of the quotation path unless the procurement is flagged for it.

---

## Phase 8 — Track C: Tender (Wi‑Fi lot)

### 8.1 Requisition → method

Value **95,000,000**, budget *Network & connectivity*, category **Goods**. Joan recommends **TENDER** (no provider selection); the Contracts Committee approves.

### 8.2 Tender Process — step by step

| # | Who | Mode | Task | Notes |
| --- | --- | --- | --- | --- |
| 1 | Joan | Org | Prepare Tender Documents | Fill the bidding document |
| 2 | Michael | Org | Review Tender Documents | Approve |
| 3 | Grace / Patrick | **CC** | Approve Tender Documents | Approve |
| 4 | Joan | Org | Advertise Tender | Set closing date. Open to every active **Goods** provider |
| 5–7 | Joan | Org | Receive Bids → Close Tender Submission → Open Bids | Same one-screen window as quotations. Horizon **93,500,000** (officer-recorded). Nile submits **95,400,000** in the portal, then **edits** it to **94,600,000** before closing |
| 8 | Michael | Org | Forward Bids for Evaluation | Complete |
| 11 | Robert | **Evaluation** | Technical Evaluation | Complete |
| 12 | Robert | **Evaluation** | Financial Evaluation | **Run validation** → Horizon ✗ (no NSSF) → confirm with warnings → recommend **Nile 94,600,000** → **Submit evaluation report** |
| 13 | Robert | **Evaluation** | Prepare Evaluation Report | Complete |
| 14 | Michael | Org | Review Evaluation Report | Approve |
| 15 | Robert | **Evaluation** | Post-Qualification where applicable | Evaluation panel → Post-qualification → **Run validation** on Nile → **Submit post-qualification** → complete |
| 16 | Grace / Patrick | **CC** | Approve Evaluation/Recommendation | Approves report **and** post-qualification together |
| 17 | Michael | Org | Prepare Award Recommendation | Complete |
| 18 | Grace / Patrick | **CC** | Approve Award | Creates the award |
| 19 | Joan | Org | Communicate Award | Complete |
| — | **Nile (portal)** | — | — | **Accept award** |
| 20 | Patrick | Org | Prepare Contract | Contract (not LPO) |
| 21 | Lydia | Org | Sign/Approve Contract | Approve |
| 22 | Patrick | Org | Issue Contract | Complete |
| — | **Nile (portal)** | — | — | **Accept contract** |
| 23 | Joan | Org | Supplier Acceptance | Complete |
| — | **Nile (portal)** | — | — | **Make delivery** |
| 24 | Amina | Org | Delivery | Record received quantities |
| 25 | Robert / Amina / Esther | **Inspection/Acceptance** | Inspection/Acceptance | Record accepted quantities → Approve |
| — | **Nile (portal)** | — | — | **Submit invoice** 94,600,000 |
| 26 | Esther | Org | Invoice | Choose Nile's invoice |
| 27 | Patrick | Org | Invoice Verification | Verify |
| 28 | Lydia | Org | Payment Approval | Approve |
| 29 | Esther | Org | Payment Recording | Complete |
| 30 | Patrick | Org | Procurement Closure | **CLOSED** |

**Teaching point:** the cheapest bid (Horizon) lost on eligibility. Choosing it is possible only **with warnings**, which stay on the record.

---

## Phase 9 — Track E: Emergency UPS

**Login:** Amina → new requisition linked to the **Emergency — Hall B UPS** plan item.

| Field | Value |
| --- | --- |
| Title | Emergency replacement of Hall B UPS 10kVA |
| Budget line | Power & continuity (UPS) |
| Value | **8,500,000** |
| Required by | 7 days from today |
| Delivery location | Lecture Hall B, NSI main campus |

Run **Phase 5**: Joan recommends **MICRO**, selects **Twin Lakes Power Solutions** and validates it, and the Contracts Committee approves. Then follow **Phase 6.2**, with Twin Lakes accepting, delivering and invoicing (`TLP-0031`, 8,500,000) in the portal.

**Teaching point:** emergency **plan** ≠ method. Urgency changes the *planning* path and justifies one provider. It does **not** skip validation, acceptance, delivery, inspection, invoice or payment.

---

## Phase 10 — What "done" looks like

| Check | Expect |
| --- | --- |
| Budget | ICT budget APPROVED, 197M |
| Plans | 1 annual + 1 emergency APPROVED |
| Procurements | Micro, Quotation, Tender + emergency Micro, all CLOSED |
| Providers | Kampala and Horizon show **Doesn't qualify** |
| Portal | Each winning provider accepted its PI / award / order, sent delivery notes and invoices |
| Run validation | Used on PI, RFQ invites, evaluation, post-qualification; "with warnings" choices in the activity log |
| Delivery address | Same from requisition → PI / LPO / contract → delivery → invoice |
| Committees | CC / Evaluation / Inspection work done in committee mode |
| Audit / notifications | Activity Logs and the bell show every approval |

---

## Quick role cheat-sheet

| When you need… | Log in as | Mode |
| --- | --- | --- |
| Structure, FY, processes, users, committees | Organization Administrator | — |
| Budget / plan / requisition create (+ Form 5 Part I), record delivery | Amina (UDO) | Org |
| Department endorse, accept Micro delivery, certify Quotation delivery | Robert (HOD) | Org |
| Plan consolidation, review documents & evaluation report, award recommendation | Michael (Head PDU) | Org |
| Form 5 Part II, PI, RFQ / tender, offers, communicate award, issue LPO, confirm supplier acceptance | Joan (PO) | Org |
| Review consolidated plan / award recommendation, prepare LPO / contract, verify invoices, close | Patrick (Contracts Officer) | Org |
| Budget consolidation, receive invoices (Quotation / Tender), record payments | Esther (Finance) | Org |
| Final approval of budget / plans / requisitions, sign LPO / contract, approve payments | Lydia (AO) | Org |
| Add / generate / suspend providers | Joan or Michael | Org |
| Approve method, documents, evaluation report, post-qualification, award | Grace or Patrick | **Contracts Committee** |
| Technical / financial evaluation, report, post-qualification | Robert / Joan / Amina | **Evaluation Committee** |
| Tender inspection & acceptance | Robert / Amina / Esther | **Inspection/Acceptance** |
| Offers, accept PI / award / LPO / contract, delivery notes, invoices | Provider | **Provider portal** |

---

## If something blocks you

| Symptom | Likely fix |
| --- | --- |
| Cannot create annual plan | Planning period not OPEN, or FY inactive |
| Emergency submit: process inactive | Activate **Emergency Planning Process** |
| No budget lines on plan | Budget not APPROVED |
| No "Recommend method" task | AO has not approved the requisition |
| Recommend submits but no procurement | Expected — wait for **Contracts Committee** approval |
| MICRO refused | Requisition above UGX 10,000,000 |
| Committee step has no assignees | Committee missing, inactive or has no seats |
| Committee task missing / org tasks missing | Switch into the committee / **Switch back to organisation role** |
| HOD never receives a requisition | The HOD is in a different department from the requisition |
| "Close quotations first" | Click **Close quotations** (or wait for the closing date) before completing the receive step |
| "… awaiting — record every answer" | Record or **Generate** an answer for every invited provider (non-responders are marked **No response**), or wait for the closing date |
| "The award must be accepted by the supplier…" | Provider must **Accept award** in the portal |
| "Waiting for the supplier to accept the LPO / contract" | Provider must **Accept LPO / contract** in the portal |
| "Waiting for the provider to accept the purchase instruction" | Provider must accept the PI in the portal |
| "The provider has not delivered yet." | Provider must **Make delivery** in the portal |
| "The provider has not sent an invoice yet." | Provider must **Submit invoice** in the portal (only after accepted delivery) |
| "Prepare Evaluation Report" refused | Submit the report on the Evaluation panel first |
| "Approve Evaluation/Recommendation" refused | Report (and tender post-qualification) not yet submitted |
| No *Create award* button | Expected outside the Contracts Committee seat |
| Portal "Invalid username or password" | Use the `sales@…proclearn.test` login, password `password123` |
| Provider cannot submit / edit / withdraw | Closing date passed, or (RFQ) not invited |

---

## Suggested session timing

| Block | Time |
| --- | --- |
| Phase 0–1 setup (incl. providers) | 30–45 min |
| Budget + annual plan | 20–30 min |
| Emergency plan | 10–15 min |
| Micro (incl. Form 5 + CC) | 25–40 min |
| Quotation + evaluation | 40–55 min |
| Tender + contract | 40–55 min |
| Emergency requisition → closure | 20–30 min |

Facilitators can split classes (Team A Micro, Team B Quotation, Team C Tender) after shared setup and the approved budget / plan.

---

# Workflow guide — how the system flows, step by step

One continuous chain from an empty organisation to a closed procurement. Each arrow is a hand-off; the next person sees it in **My Tasks** and the bell.

### Stage 1 — Set up the organisation (Organization Administrator)

1. Create **departments/units** (user departments such as ICT, plus Finance and PDU).
2. Create **users** — each user has one department and one org role.
3. Create the **financial year** and an **OPEN planning period**.
4. **Activate** all process workflows.
5. Create the **Contracts**, **Evaluation** and **Inspection/Acceptance** committees and **seat** existing users (see rules below).
6. Procurement Officer / Head PDU builds the **provider register**.

### Stage 2 — Budget

1. User Department Officer **prepares the department budget** →
2. Head User Department **reviews** →
3. Finance/Budget Officer **reviews and consolidates** →
4. Accounting Officer **approves**. The budget lines are now available.

### Stage 3 — Procurement plan

**Annual plan:**
1. User Department Officer **prepares** →
2. Head User Department **approves** →
3. Head PDU **consolidates** →
4. Contracts Officer **reviews** →
5. Accounting Officer **approves**.

**Emergency plan:** the same chain **without** the Contracts Officer step. Head PDU verifies the funding context.

### Stage 4 — Requisition and method

1. User Department **creates the requisition** (+ Form 5 Part I) →
2. Head User Department **endorses** →
3. Procurement Officer **confirms the item is in the plan** →
4. Accounting Officer **confirms funds and approves** (funds committed) →
5. Procurement Officer **recommends the method** (Form 5 Part II; supplier for Micro, shortlist for Quotation) →
6. **Contracts Committee approves the method** → the procurement case is created.

### Stage 5a — Micro

1. Procurement Officer **issues the purchase instruction** → provider **accepts** and **delivers** (portal) →
2. User Department **records receipt** →
3. Head User Department **accepts the goods** → provider **invoices** (portal) →
4. Contracts Officer **processes the invoice** →
5. Accounting Officer **approves payment** →
6. Finance **records payment** →
7. Contracts Officer **closes**.

### Stage 5b — Quotation (RFQ)

1. **Documents:** Procurement Officer prepares the RFQ → Head PDU reviews → **Contracts Committee approves**.
2. **Solicitation:** Procurement Officer issues RFQs to the shortlist → providers quote (portal / recorded / generated) → Procurement Officer closes and opens the quotations.
3. **Evaluation:** **Evaluation Committee** does the technical and financial evaluation and the report → Head PDU reviews → **Contracts Committee approves the report**.
4. **Award:** Head PDU prepares the award recommendation → Contracts Officer reviews → **Contracts Committee approves the award** → Procurement Officer communicates it → provider **accepts the award**.
5. **LPO:** Contracts Officer prepares the LPO → Accounting Officer signs → Procurement Officer issues → provider **accepts** → Procurement Officer confirms acceptance.
6. **Delivery:** provider **delivers** → User Department records and verifies → Head User Department **certifies**.
7. **Invoice:** provider **invoices** → Finance receives → Contracts Officer verifies.
8. **Payment and closure:** Accounting Officer approves payment → Finance records it → Contracts Officer **closes**.

### Stage 5c — Tender

1. **Documents:** Procurement Officer prepares the bidding document → Head PDU reviews → **Contracts Committee approves**.
2. **Solicitation:** Procurement Officer advertises → providers bid → Procurement Officer closes and opens the bids → Head PDU forwards them for evaluation.
3. **Evaluation:** **Evaluation Committee** does the technical and financial evaluation and the report → Head PDU reviews → **Evaluation Committee post-qualifies** the best bidder → **Contracts Committee approves the evaluation and recommendation**.
4. **Award:** Head PDU prepares the award recommendation → **Contracts Committee approves the award** → Procurement Officer communicates it → provider **accepts the award**.
5. **Contract:** Contracts Officer prepares the contract → Accounting Officer signs → Contracts Officer issues → provider **accepts** → Procurement Officer confirms acceptance.
6. **Delivery:** provider **delivers** → User Department records it → **Inspection/Acceptance Committee inspects and accepts**.
7. **Invoice:** provider **invoices** → Finance records → Contracts Officer verifies.
8. **Payment and closure:** Accounting Officer approves payment → Finance records it → Contracts Officer **closes**.

### Who approves what (summary)

| Decision | Made by |
| --- | --- |
| Budget, plans, requisition, LPO / contract signature, payment | **Accounting Officer** |
| Procurement method, solicitation documents, evaluation report, post-qualification, award | **Contracts Committee** |
| Bid / quotation evaluation, evaluation report, post-qualification | **Evaluation Committee** |
| Acceptance of tender deliveries | **Inspection/Acceptance Committee** |
| Acceptance of Micro / Quotation deliveries | **Head User Department** |
| Accepting the order (PI / award / LPO / contract) | **Provider** in the portal |

---

# Committee assignment rules — who may (and may not) sit where

Committee seats are given to **existing org users**. A person keeps their org role and switches into a committee seat when needed. The app **refuses** the seats marked *Blocked* (based on the PPDA Act Cap. 205 and the Evaluation Regulations); rows marked *Recommended* are good practice that the app does not enforce.

### Contracts Committee

| Who | Allowed? | Why |
| --- | --- | --- |
| Head PDU | **Blocked** | PPDA s.29(3): the head of the procurement unit cannot sit on the Contracts Committee |
| Finance/Budget Officer (head of finance) | **Blocked** | PPDA s.29(3) |
| Anyone with a seat on the Evaluation Committee | **Blocked** | The body that evaluates cannot also approve its own recommendation |
| Head of a user department, Contracts Officer, other senior officers | Allowed | Grace (Estates) and Patrick in this scenario |
| Accounting Officer | Allowed by the app — *not recommended* | The AO appoints the committee and signs contracts / approves payments; keep the AO off it |
| Procurement Officer | Allowed by the app — *not recommended* | Runs the solicitation the committee approves |

### Evaluation Committee (and Negotiation Committee)

| Who | Allowed? | Why |
| --- | --- | --- |
| Anyone with a seat on the Contracts Committee | **Blocked** | Evaluation Regulations: Contracts Committee members cannot evaluate |
| Procurement Officer or Contracts Officer as **Chairperson** | **Blocked** | They may sit as the PDU member, but not chair |
| Procurement Officer / Contracts Officer as Member | Allowed | Provides the required PDU member (Joan) |
| User Department Officer / Head User Department | Allowed (Chair or Member) | Provides the required user-department member (Robert chairs, Amina is secretary) |
| Composition | *Recommended* | At least one **user-department** member and one **PDU** member; an odd number (3) |

### Inspection / Acceptance Committee

| Who | Allowed? | Why |
| --- | --- | --- |
| Procurement Officer as **Chairperson** | **Blocked** | Independence from the officer who ran the procurement |
| Head PDU as **Chairperson** | **Blocked** | Chair should come from the user department |
| Head User Department / User Department Officer | Allowed (Chair preferred) | The department that will use the goods |
| Finance/Budget Officer, other officers | Allowed as Member / Secretary | Esther as Secretary in this scenario |

### General rules

- **Seats, not logins:** never give a user the *Contracts Committee*, *Evaluation Committee* or *Inspection/Acceptance Committee* role. Those are routing roles; seat the user on the committee instead.
- **One person, several committees:** allowed (Robert chairs Evaluation **and** Inspection), **except** Contracts ↔ Evaluation in either direction.
- **Committee roles:** Chairperson, Member, Secretary.
- **Seats needed:** a committee step creates tasks only if the committee **exists, is active and has seated members**.
- **Acting mode:** committee work requires **Switch committee context**; organisation-role work requires **Switch back to organisation role**.
- **Approvals vs committees:** the **Accounting Officer** approves through the org role (budgets, plans, requisitions, signatures, payments) — never through a committee seat.
