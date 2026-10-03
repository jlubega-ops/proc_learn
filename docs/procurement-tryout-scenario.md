# Proc Learn — Full procurement tryout scenario

**Purpose:** Walk the current app from organisation setup through budgeting, annual planning, **emergency planning**, requisitions, and three method branches (Micro, Quotation, Tender) to closure.

**Style:** Role-directed, with realistic figures. Built for **this** Proc Learn build (engine processes by `triggerKey`, Form 5 / Circular fill, emergency plans, provider register with **Run validation**, provider portal, simulated provider responses, delivery address carried to orders, committee evaluation and post-qualification). Do not treat this as a copy of any earlier paper manual.

**Learning mode:** the system never marks students right or wrong and never blocks on compliance. Wherever providers are chosen or evaluated, the system runs **Run validation** and shows ticks / crosses. If a check fails, the button changes to **"… with warnings"** and asks you to confirm; the warning is recorded on the file.

### How the screens behave (read once)

- **Tasks list:** click anywhere on a task **row** to open its record (requisition, plan, budget or procurement). The eye icon on the right does the same.
- **Run validation dialog:** after picking provider(s), click **Run validation**. A dialog opens and every check for each provider spins ("Verifying …") for about 3 seconds while the system "contacts the registers". Then all results appear at once (green ✓ passed, yellow ⚠ expiring soon, red ✗ failed) together with the action buttons.  
  When it finishes the dialog shows a summary and three buttons: **Cancel**, **Run again**, and the **stage button** — e.g. **Select supplier**, **Shortlist**, **Issue purchase instruction to supplier**, **Issue RFQs to suppliers**, **Confirm eligibility results**, **Submit post-qualification**.  
  If any check failed the stage button reads **"… with warnings"** → a second screen in the same dialog lists the issues → **"… anyway"** (or **Go back**). Clicking the stage button applies the choice and **closes the dialog**; the page then shows each provider with a *Qualifies / Doesn't qualify* chip.  
  On **Issue purchase instruction** and **Issue RFQs** the stage button also **completes the task** — there is no separate Submit.
- **One acting mode at a time:** while you are in a committee seat (banner at the top) you can only act on that committee's work; organisation-role tasks (e.g. Joan's *Issue Purchase Instruction*) are hidden and refused by the server until you click **Switch back to organisation role**. The reverse also holds: committee work (e.g. *Approve Procurement Method*) only works after switching into that committee. If a task is waiting for you in the other mode, the page shows a yellow **"Task waiting in another role"** note instead of the task card.
- **Procurements menu (sidebar dropdown):** **All procurements**, **Review tasks**, **Awards**, **Contracts / LPO**, **Delivery & inspections**, **Invoices**, **Payments**, **Closures**. You only see the stage pages your role (or current committee seat) works on — e.g. Amina sees Review tasks, Delivery & inspections and Invoices; Esther sees Payments and Invoices; Lydia (Accounting Officer) sees all of them. **Review tasks** opens on *Waiting for me* — the quickest way to find your next step. Every row shows the current workflow step, who it is pending (e.g. *Pending Head User Department (Robert Ssekandi)*) and a chip: **Your turn**, **Yours — switch role**, **Waiting on others** or **Workflow complete**. Click a row to open the procurement.
- **Procurement page:** a **Workflow progress** card shows every step (✓ done, ⏳ current, ○ not started) and who the current step is waiting on, e.g. *"Pending Head User Department: Verify/Accept Delivery (Robert Ssekandi)"*. The **Lifecycle timeline** at the bottom is collapsed — click it to expand. **Decision names say what the step does** (e.g. *Receive delivered items and forward*, *Approve payment and forward*); **Return for correction** and **Reject** are always the other two choices. Sections (Award, Contract/LPO, Delivery & inspection, Invoice, Payment, Closure) only appear for roles that work on them; oversight roles (Head PDU, Accounting Officer, Org Administrator) and committee seats see some sections marked **View only** with the buttons disabled.
- **Provider portal:** same layout as the organisation side — **sidebar** on the left with **Opportunities, Orders, Invoices, Payments** and **Sign out** at the bottom (on a phone, open it with the ☰ menu button).

**Shared password for simulated users and providers:** `password123`  
**Org user logins:** auto-generated on **Org Admin → Users** (lowercase, includes project code, e.g. `amina.nalwoga.ab12c_org-xxxxxx@org.learn`). Copy from the user list after create — do not invent emails.  
**Provider portal logins:** auto-generated when a provider is added (e.g. `pearl-notebooks-ltd.ab12_org-xxxxxx@provider.learn`). Copy from the provider's detail page (or Org Admin → **Providers (read-only)**). Providers sign in on the same `/login` page and land on the **Provider portal**.  
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

Emergency is **not forgotten** — it runs through Phases 4 and 9 — but in this build it is a **planning path**, not a separate procurement method.

| Stage | What is emergency-specific | What is the same as normal |
| --- | --- | --- |
| Planning | **Emergency / unplanned plan** type, `…-EP-…` reference, no planning period needed, shorter approval (no Contracts Officer step) | Budget line must be approved |
| Requisition | Linked to the emergency plan item; justification explains the urgency | Form 5 Part I, same approval chain |
| Method | Nothing special — Joan still recommends on Form 5 Part II and the Contracts Committee approves | Methods available: **Micro, Quotation, Tender** |
| Providers | Usually **one** provider picked directly (Micro → purchase instruction) to save time | Run validation still applies; delivery address, invoice and payment flow are identical |

**PPDA note for facilitators:** in real practice an emergency is usually handled by **Direct procurement** (single source, justified by urgency). The Circular sheet lets you write *Direct procurement* as the planned method for teaching, but the build has **no separate Direct procurement execution flow** yet. Use **Micro** with the one chosen provider (value 8.5M is treated here as a small single-source buy) — or Quotation if you want students to compare quotes even under urgency.

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
| Esther Namukasa | FIN | Finance/Budget Officer |
| Patrick Mbabazi | PDU | Contracts Officer |
| Lydia Nakato | FIN | Accounting Officer |

### Committee seats (assign existing users — no separate committee logins)

Do **not** create Eva/Insp users. Create the operational cast under **Users** first, then assign those same people to committee seats under **Org Admin → Committees**. Each person keeps their org role; when a committee action is needed they use **Switch committee context** in the account menu.

**How to assign a seat (UI flow)**

1. **Org Admin → Users** — create the operational personas (Amina, Robert, Joan, …). Copy each **Login email** from the list after create.
2. **Org Admin → Committees** → **Create committee** — select **type** only (that becomes the name, e.g. Evaluation Committee) → Create.
3. On the same page, **Add seat**:
   - **Committee** — pick the committee you just created  
   - **Organisation user** — pick an existing user (ineligible roles are filtered out, e.g. Head PDU / Finance cannot sit on Contracts)  
   - **Committee role** — Chairperson / Member / Secretary  
   - **Add seat**
4. Repeat Add seat for every row in the tables below. One person may hold seats on more than one committee (e.g. Robert chairs Evaluation and Inspection).
5. Later, when acting: **Login as that persona** → account menu → **Switch committee context** → **Switch to {committee} — {seat}**.

**Evaluation Committee**

| Seat | Assign existing persona |
| --- | --- |
| Chairperson | Robert Ssekandi (Head User Department) |
| Member | Joan Atim (Procurement Officer) |
| Secretary | Amina Nalwoga (User Department Officer) |

**Inspection / Acceptance Committee**

| Seat | Assign existing persona |
| --- | --- |
| Chairperson | Robert Ssekandi (Head User Department) |
| Member | Amina Nalwoga (User Department Officer) |
| Secretary | Esther Namukasa (Finance/Budget Officer) |

**Contracts Committee** (required — approves the method for every case, and for Quotation / Tender also the solicitation documents, the evaluation committee, the evaluation report, post-qualification and the award)

| Seat | Assign existing persona |
| --- | --- |
| Chairperson | Lydia Nakato (Accounting Officer) |
| Member | Patrick Mbabazi (Contracts Officer) |

Do not seat Robert, Joan or Amina here: a Contracts Committee member cannot also sit on the Evaluation Committee (PPDA), and the app refuses the seat.

**Who does what (PPDA)** — the workflow assigns each step to whoever holds that duty:

| Duty | Done by | Mode |
| --- | --- | --- |
| Prepare documents, issue RFQs / advertise, receive & open offers, nominate evaluators | PDU (Joan, Michael) | Org role |
| Approve method, solicitation documents, evaluation committee, evaluation report / recommendation, post-qualification, award | **Contracts Committee** (Lydia or Patrick) | Committee seat |
| Technical & financial evaluation, evaluation report, post-qualification | **Evaluation Committee** (Robert, Joan, Amina) | Committee seat |
| Inspection & acceptance of tender deliveries | **Inspection / Acceptance Committee** (Robert, Amina, Esther) | Committee seat |
| Sign contract / LPO, approve payment | Accounting Officer (Lydia) | Org role |

A committee step only creates tasks if that committee exists, is active and has seated members. If a committee step shows no assignees, seat members and the task appears for them.

Still no new logins. Do **not** seat Michael (Head PDU) or Esther (Finance) on Contracts Committee (PPDA Cap. 205 s.29(3)). Joan may sit on Evaluation as Member, but must **not** be Chairperson of Evaluation.

---

## Phase 0 — Enter the organisation

1. Sign in as the **student** (or staff in student view) who owns / is enrolled in the project.
2. Open the project workspace.
3. You should land as **Organization Administrator** for config work (or log in as the org Admin account if your project already has one).
4. Note the project code shown in the UI — it is embedded in each login email.

---

## Phase 1 — Organisation Administrator setup

**Login:** Organization Administrator

### 1.1 Organisation structure & departments

1. **Org Admin → Organisation structure** — set PDE display name to **Nakawa Skills Institute**.
2. **Org Admin → Departments** — create the four departments above (codes exact).

### 1.2 Roles

Confirm core roles exist (User Department Officer, Head User Department, Procurement Officer, Head PDU, Contracts Officer, Finance/Budget Officer, Accounting Officer). Do not invent a “Contracts Committee” org role.

### 1.3 Users

**Org Admin → Users** — create every **operational** persona in the cast (name, department, role — no email to type). After each create, copy the **Login email** into a notepad.

### 1.4 Financial year

**Org Admin → Financial years**

| Field | Value |
| --- | --- |
| Label | 2026/2027 |
| Start | 2026-07-01 |
| End | 2027-06-30 |
| Active | Yes |

### 1.5 Planning period (annual only)

**Org Admin → Planning period**

| Field | Value |
| --- | --- |
| FY | 2026/2027 |
| Label | Annual planning 2026/2027 |
| Start | 2026-07-01 |
| End | 2027-06-30 |
| Status | Must be **OPEN** |

### 1.6 Activate processes

**Org Admin → Process workflow** — activate **all** of these (activation ≠ starting a case):

- Budgeting Process  
- Procurement Planning Process  
- **Emergency Planning Process** ← required for Track E  
- Procurement Requisition Process  
- Micro Procurement Process  
- Quotation Process  
- Tender Process  
- Evaluation Process  
- Post-Qualification Process  
- LPO Process  
- Contract Process  
- Invoice Process  
- Payment Process  

### 1.7 Committees

**Org Admin → Committees** (users from §1.3 must already exist)

For each committee: select **type** under **Create committee** (name is automatic) → then use **Add seat** three times (Committee + Organisation user + Committee role).

1. Create type **Evaluation**.  
   - Add seat → Robert → **Chairperson**  
   - Add seat → Joan → **Member**  
   - Add seat → Amina → **Secretary**  
2. Create type **Inspection/Acceptance**.  
   - Add seat → Robert → **Chairperson**  
   - Add seat → Amina → **Member**  
   - Add seat → Esther → **Secretary**  
3. Create type **Contracts** (**required** — method approval before Micro / Quotation / Tender).  
   - Add seat → Lydia → **Chairperson**  
   - Add seat → Patrick → **Member**  
   Do **not** seat Michael (Head PDU) or Esther (Finance), nor Robert / Joan / Amina (they sit on Evaluation).

Confirm the Committees list shows those seats. You will not use separate committee logins; actors switch context later when a seat is required. Exclusive **committee mode** hides org-role tasks until you click **Switch back to organisation role** in the banner.

### 1.8 Provider register

The provider register is maintained by the **Procurement Officer** or **Head PDU** (sidebar → **Providers**). No committee approval is needed to add a provider. The Organisation Administrator only has a read-only view (**Providers (read-only)**), including each provider's portal login.

**Log out** of Admin, sign in as **Joan (Procurement Officer)** and either:

- **Add provider** for each row below. Choose the category, tick the registrations and compliance documents the provider holds (URSB, TIN, tax clearance, NSSF, PPDA register, trading licence) with expiry dates, and pick a behaviour. **Tick all (fully compliant)** fills every document with a valid one-year expiry.
- Or click **Generate providers**, enter a number (e.g. 8) and keep **Mixed (realistic market)**. You get fictional providers with different behaviours, some with expired or missing documents.

| Provider | Category | Compliance to set | Used for |
| --- | --- | --- | --- |
| Lake Victoria Office Ltd | Goods | Tick all | Micro / furniture |
| Pearl Notebooks Ltd | Goods | Tick all | Quotation shortlist |
| Kampala SoftTech Ltd | Goods | Tick all, but set tax clearance expiry to a past date | Quotation shortlist (shows a "Doesn't qualify" case) |
| Nile Systems Group Ltd | Goods | Tick all | Quotation + tender |
| Horizon Networks UG Ltd | Goods | Tick all except NSSF | Tender (fails eligibility) |
| Twin Lakes Power Solutions | Goods | Tick all | Emergency UPS |

Check the register: the **All / Qualifies / Doesn't qualify** filter should split them, and opening a provider shows each check with a tick or cross and the reason.

> The six named providers above are added **manually** (behaviour: **Compliant, competitive prices**, or leave it blank — behaviour only matters for generated providers). Their quotations / bids / invoices come from the officer or from the **provider portal**, never automatically.  
> **Generated** providers (optional, via **Generate providers**) are simulated companies: when an RFQ or tender is issued they **answer automatically** according to their behaviour (competitive, expensive, late, non-responsive, poor delivery…), and after inspection they **send their invoice automatically**. Use them when you want a busier market; the named providers below still drive the main story.

**Provider portal logins (copy now):** open each provider → **Portal login**. You will use these three later:

| Provider | Used in portal for |
| --- | --- |
| Pearl Notebooks Ltd | Submits its quotation itself (Track B) |
| Nile Systems Group Ltd | Submits and edits its bid (Track C), submits invoices (Tracks B and C) |
| Twin Lakes Power Solutions | Submits its invoice (Track E) |

**Log out** of the Procurement Officer before continuing.

---

## Phase 2 — Budget (must be approved before planning)

**Login:** Amina — User Department Officer → **Budgets → New**

| Field | Value |
| --- | --- |
| Title | ICT Department Budget 2026/2027 |
| FY | 2026/2027 |
| Department | ICT |

**Budget lines**

| Code / name | Amount (UGX) |
| --- | ---: |
| Teaching aids & classroom kit | 12,000,000 |
| Computing devices | 60,000,000 |
| Network & connectivity | 110,000,000 |
| Power & continuity (UPS) | 15,000,000 |

Submit.

### Approval chain (Tasks)

| Step | Login as | Action |
| --- | --- | --- |
| 1 | Robert — Head User Department | Approve |
| 2 | Esther — Finance/Budget Officer | Approve (check totals = **197,000,000**) |
| 3 | Lydia — Accounting Officer | Approve |

**Checkpoint:** Budget status **APPROVED**. Lines available for plans.

---

## Phase 3 — Annual procurement plan (Circular sheet)

**Login:** Amina → **Procurement plans → Create**

| Field | Value |
| --- | --- |
| Plan type | **Annual procurement plan** |
| Title | ICT Annual Procurement Plan 2026/2027 |
| FY | 2026/2027 |
| Planning period | Annual planning 2026/2027 (OPEN) |
| Circular sheet | Goods, works and non-consultancy |

**Plan items** (fill Circular fields lightly: method, funding, key dates)

| # | Title | Qty | Unit price (UGX) | Line total | Budget line | Planned method (teaching) |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | Interactive whiteboard kit | 4 | 1,200,000 | 4,800,000 | Teaching aids… | Micro procurement |
| 2 | Staff notebooks (14") | 12 | 4,500,000 | 54,000,000 | Computing devices | Request for quotations |
| 3 | Campus Wi‑Fi refresh (lot) | 1 | 95,000,000 | 95,000,000 | Network… | Open domestic bidding |
| 4 | Spare UPS units (stock) | 2 | 4,000,000 | 8,000,000 | Power… | Request for quotations |

Optional: **Download item reference** HTML for one line (teaching only).  
Save draft → Submit.

### Annual plan approval

| Step | Login as | Action |
| --- | --- | --- |
| 1 | Robert — HOD | Approve |
| 2 | Michael — Head PDU | Complete / consolidate review |
| 3 | Patrick — Contracts Officer | Approve |
| 4 | Lydia — AO | Approve |

**Checkpoint:** Plan **APPROVED**.

---

## Phase 4 — Emergency planning (new process)

**Story:** Mid-semester, Hall B UPS fails; exams in 10 days. Not on the “urgent buy now” path of the annual consolidation cycle — use **Emergency Planning Process**.

**Login:** Amina → **Procurement plans → Create**

| Field | Value |
| --- | --- |
| Plan type | **Emergency / unplanned plan** |
| Title | Emergency — Hall B UPS replacement |
| FY | 2026/2027 |
| Planning period | None (allowed) |
| Reference | Should look like `ICT-EP-…` |

**One plan item**

| Title | Qty | Unit price | Total | Budget line |
| --- | ---: | ---: | ---: | --- |
| Online UPS 10kVA for Hall B | 1 | 8,500,000 | 8,500,000 | Power & continuity (UPS) |

Circular: planned method = **Direct procurement** (teaching label — executed later as Micro, see "Where emergency fits"); justification = exam continuity / failed unit.  
Save → Submit.

**Budget note:** the Power & continuity line (15,000,000) also carries annual item 4 *Spare UPS units* (8,000,000). Plan items only reserve, so both plans pass. Do **not** raise a requisition for the spare UPS in this tryout, or the emergency requisition (8,500,000) will hit *Insufficient funds*. That shortfall is itself a good discussion point if a facilitator wants to show it.

### Emergency plan approval (shorter — **no** Contracts Officer step)

| Step | Login as | Action |
| --- | --- | --- |
| 1 | Robert — HOD | Approve |
| 2 | Michael — Head PDU | Verify / Complete |
| 3 | Lydia — AO | Approve |

**Checkpoint:** Emergency plan **APPROVED**. If submit fails with “process inactive”, return to Phase 1.6 and activate **Emergency Planning Process**.

---

## Phase 5 — How method selection works now (read before Phase 6)

Form 5 is **not** a free popup anymore. The live path is:

1. **Part I** — filled by the User Department Officer **on the requisition create form** (extra PPDA fields).  
2. Requisition approval chain (HOD → PO → Head PDU → AO).  
3. **Part II** — **Joan (Procurement Officer)** opens task **Recommend Procurement Method (Form 5 Part II)**, enters justification + recommended **MICRO / QUOTATION / TENDER**, then **Submit**.  
   - This only **recommends**. It does **not** start Micro / Quotation / Tender.  
4. **Contracts Committee** — a seated member (e.g. Lydia) uses account menu → **Switch committee context** → **Contracts Committee**.  
   - Yellow **Committee mode** banner appears: only CC tasks show; org-role tasks are hidden.  
   - Open task **Approve Procurement Method (Contracts Committee)** → **Approve**.  
5. **Then** the procurement case is created and the Micro / Quotation / Tender workflow starts.

**Exit committee mode** when done: banner → **Switch back to organisation role** so you see your normal org tasks again.

**Checkpoint before Phase 6:** Contracts Committee exists with at least one seat (Lydia and/or Patrick). If missing, return to Org Admin → Committees and add seats now.

---

## Phase 6 — Track A: Micro (whiteboards)

### 6.0 Where you might be already

| If you already… | Continue at |
| --- | --- |
| Have an APPROVED annual plan but no whiteboard requisition | **6.1** |
| Submitted the requisition; approvals still pending | **6.2** |
| AO has approved; waiting for method | **6.3** (Joan Part II → CC Approve) |
| Procurement case already exists (Micro tasks showing) | **6.4** |

### 6.1 Create requisition (includes Form 5 Part I)

**Login:** Amina Nalwoga → **Requisitions → New**  
Stay in **org role** (no committee mode).

| Field | Value |
| --- | --- |
| Title | Procurement of interactive whiteboard kits for ICT labs |
| Plan | ICT Annual Procurement Plan 2026/2027 |
| Plan item | Interactive whiteboard kit |
| Budget line | Teaching aids & classroom kit |
| Qty / unit price | 4 × 1,200,000 = **4,800,000** |
| Required by | 2026-09-30 |
| Justification | Replace failing boards in Labs 1–2 for continuous teaching |
| Delivery location | ICT Labs, NSI main campus |

**Form 5 Part I** (same create form — fill before Submit):

| Field | Suggested value |
| --- | --- |
| Market price | 4,800,000 |
| Multi-year contracting | No |
| Vote / head no. | 221001 |
| Programme | Skills development |
| Sub-programme | ICT teaching |
| Funding item | Teaching aids & classroom kit |
| Balance remaining | 12,000,000 |
| Member name | Amina Nalwoga |
| Member title | User Department Officer |

Submit.

### 6.2 Requisition approval chain

Complete each **Tasks** item as the named role (logout / login between personas). Stay **out** of committee mode.

| Step | Login as | Task | Decision / button |
| --- | --- | --- | --- |
| 1 | Robert — Head User Department | Review Requisition | **Endorse requisition and forward** |
| 2 | Joan — Procurement Officer | Verify Procurement Plan Availability | **Confirm item is in plan and forward** |
| 3 | Michael — Head PDU | Verify Funding Availability | **Confirm funds available and forward** |
| 4 | Lydia — Accounting Officer | Approve Requisition | **Approve requisition and forward** (commits the funds on the budget line) |

**Checkpoint:** Requisition status shows AO-approved / ready for method recommendation. You should **not** see a procurement case yet.

### 6.3 Recommend method → Contracts Committee approve (starts Micro)

#### A — PDU recommends (Form 5 Part II)

**Login:** Joan Atim (Procurement Officer)  
Stay in org role (no committee mode).

1. Open **Tasks** → click the row **Recommend Procurement Method (Form 5 Part II)** — it opens the requisition with the Form 5 Part II form.  
2. Set:

| Field | Value |
| --- | --- |
| Recommended procurement method | **MICRO** |
| Method justification | Value (4,800,000) within the micro ceiling of UGX 10,000,000; standard goods available from a local supplier; urgent classroom continuity |
| PDU officer name | Joan Atim |
| Select supplier (optional for Micro — one only) | Tick **Lake Victoria Office Ltd** → **Run validation** → dialog ticks all ✓ → **Select supplier** (dialog closes; page shows *Supplier selected*) |

   Selecting here is recommended: the provider is saved on Form 5 Part II, the Contracts Committee sees it, and the later **Issue purchase instruction** step is **prefilled** with it (still changeable). If you skip it, you simply pick the provider at the purchase instruction.

3. Click **Recommend method** at the bottom of the task. **Select supplier** in the dialog only confirms the provider — it does **not** submit the form. The submit button stays disabled (with a note) while a provider is ticked but not yet confirmed through Run validation; for Quotation it also stays disabled until a shortlist is confirmed.  
4. Toast should indicate Form 5 Part II submitted and that **Contracts Committee must approve**. The task disappears from Joan's list.  
   - **Value rule:** MICRO is only allowed up to **UGX 10,000,000**. Above that the system refuses MICRO and asks for QUOTATION or TENDER (the Contracts Committee approval re-checks it).

**Checkpoint:** Still **no** Micro procurement case. Next task belongs to Contracts Committee.

#### B — Contracts Committee approves method

**Login:** Lydia Nakato (or Patrick if she is not seated)

1. Account menu → **Switch committee context** → **Contracts Committee** (Chairperson / Member as assigned).  
2. Confirm yellow **Committee mode** banner: only CC work is visible.  
3. Open **Tasks** → click the row **Approve Procurement Method (Contracts Committee)**.  
4. Review recommended **MICRO** + justification (the card also shows the value, budget line and whether MICRO fits the 10M ceiling).  
5. Decision: **Approve procurement method** (or Return / Reject if testing those paths).  
6. Banner → **Switch back to organisation role** when finished.

**Checkpoint:** Procurement case created (e.g. **PROC-2026-0001**). Lydia's **Committee tasks** list is now empty — that is correct, the committee is done. The requisition stays **APPROVED**. The first Micro task belongs to **Joan** (Issue Purchase Instruction) → continue at **6.4 Step 1**. Method is locked from Form 5 + CC — do not expect a second “pick method” step, and do not expect the need / budget / AO approval to be repeated: they were settled on the requisition in 6.2.

### 6.4 Micro procurement — step by step (on the procurement page)

**What changed after 6.3:** the Contracts Committee's approval created a **procurement case**, e.g. **PROC-2026-0001 · Procurement of interactive whiteboard kits for ICT labs**. From now on you work on that **procurement page**, not the requisition. Open it by clicking the task row in **Tasks** (or sidebar → **Procurements** → the PROC row).

**No committee mode in Micro.** The Contracts Committee's work ended at 6.3B. Everyone below works in their **normal organisation role** — if you see the yellow committee banner, click **Switch back to organisation role** first. Amina sits on the Evaluation Committee, but Micro has no evaluation, so here she acts as **User Department Officer**.

**How every step works:** at the top of the procurement page, the person whose turn it is sees a task card titled with the step name, a **Decision** dropdown (already set to the step's action, e.g. *Process invoice and forward*) and a button with the same name. Some steps first need work in a card further down the page (**Delivery & inspection**, **Invoice**). A step only appears in that person's **Tasks** list once the previous step is done. The **Workflow progress** card shows every step, whose turn it is, and (under *Earlier stage: Requisition*) who approved the requisition and the method.

**Who does what (PPDA, Micro):**

| Stage | Role | Done where |
| --- | --- | --- |
| Need, plan, funding, approval | UDO → HOD → PO → Head PDU → AO | Requisition (6.1–6.2) |
| Method (Form 5 Part II) | Procurement Officer recommends → **Contracts Committee** approves | Requisition (6.3) |
| Order to one provider (eligibility checked; issuing it confirms the supplier) | Procurement Officer | Procurement, step 1 |
| Supply | Provider (Lake Victoria) | Off-system / portal |
| Receive and accept goods | UDO records → **HOD accepts** (no inspection committee for Micro) | Procurement, steps 2–3 |
| Invoice | Provider submits → Contracts Officer verifies | Procurement, step 4 |
| Payment | AO approves → Finance records | Procurement, steps 5–6 |
| Close the file | Contracts Officer (PDU) | Procurement, step 7 |

| Step | Who logs in | Task name in Tasks |
| --- | --- | --- |
| 1 | Joan — Procurement Officer | Issue Purchase Instruction |
| 2 | Amina — User Department Officer | Record Delivery/Receipt |
| 3 | Robert — Head User Department | Verify/Accept Delivery |
| 4 | Patrick — Contracts Officer | Process Invoice |
| 5 | Lydia — Accounting Officer | Approve Payment |
| 6 | Esther — Finance/Budget Officer | Record Payment |
| 7 | Patrick | Close Procurement |

#### Step 1 — Joan issues the purchase instruction

**Login:** Joan Atim

1. **Tasks** → click **Issue Purchase Instruction: PROC-2026-0001 …**. Check the header first: method **MICRO**, estimated value **UGX 4,800,000**, the linked requisition, budget line *Teaching aids & classroom kit*.  
2. In the task card, Decision = **Issue purchase instruction**. Under **Select supplier**, **Lake Victoria Office Ltd** is already ticked (you selected it on Form 5 Part II); if not, tick it. The PI value will be the requisition total, **UGX 4,800,000**.  
3. Click **Run validation**. The dialog opens and every check spins for a few seconds, then the results appear: active in the register, URSB, TIN, trading licence, not on the PPDA suspended list — all green.  
4. Click **Issue purchase instruction**. The dialog closes.

**Expect:** toast *Purchase instruction issued.* A **Purchase instruction** card appears: PI number, **Lake Victoria Office Ltd**, **UGX 4,800,000**, **Delivery address: ICT Labs, NSI main campus** (from the requisition). That one action issues the PI, confirms the supplier and completes the task. Log out.

#### Step 2 — Amina records the delivery

**Login:** Amina Nalwoga

1. **Tasks** → click **Record Delivery/Receipt: PROC-2026-0001 …**.  
2. Scroll down to the **Delivery & inspection** card → **Record (partial) delivery**. Next to *Interactive whiteboard kit — ordered 4*, enter **Received qty = 4** → click **Record delivery**.  
3. **Expect:** toast *Lifecycle action recorded.* The delivery appears in the card with *Delivered to: ICT Labs, NSI main campus*.  
4. Scroll back up to the task card: Decision = **Receive delivered items and forward** → click it.

**Expect:** *Decision recorded.* If you click it before recording the delivery, a red toast tells you to record it first. Log out.

#### Step 3 — Robert inspects and accepts the delivery

**Login:** Robert Ssekandi — normal role (Head User Department). No committee switch: in Micro the Head of User Department accepts the goods himself, so the card shows no committee selector.

1. **Tasks** → click **Verify/Accept Delivery: PROC-2026-0001 …**.  
2. In **Delivery & inspection**, on the delivery row:  
   - **Inspection notes** → *4 kits installed and tested in Labs 1–2*  
   - Click **Accept all received** (or set Accepted / Rejected per line → **Record inspection**).  
3. **Expect:** the delivery row shows *Inspection: ACCEPTED · Robert Ssekandi*.  
4. Back in the task card: Decision = **Accept delivery and forward** → click it.

**Expect:** *Decision recorded.* Lake Victoria was added manually, so it does **not** send an invoice automatically. Log out.

#### Step 4 — Patrick receives and processes the invoice

**Login:** Patrick Mbabazi (Contracts Officer)

1. **Tasks** → click **Process Invoice: PROC-2026-0001 …**.  
2. Scroll to the **Invoice** card → **Receive invoice from supplier** form:

| Field | Value |
| --- | --- |
| Invoice number | read-only — generated automatically, e.g. `INV-PROC-2026-0001-001` |
| Supplier reference (optional) | `LVO-INV-0912` |
| Amount | **4,800,000** (prefilled with the balance not yet invoiced) |
| Invoice date | today |
| Notes | *4 interactive whiteboard kits delivered to ICT Labs* |

   Click **Receive invoice from supplier**. **Expect:** toast *Invoice received.* The invoice shows with status **RECEIVED**.  
   *(Portal alternative: sign in with Lake Victoria's portal login → sidebar **Orders** → **Submit invoice** on the PI, then come back as Patrick.)*  
3. Back in the task card: **Invoice received** → choose `INV-PROC-2026-0001-001`.  
4. Decision = **Process invoice and forward** → click it.

**Expect:** *Decision recorded.* The invoice becomes **VERIFIED** — in Micro, processing the invoice certifies and verifies it in one step, so you do not need the Certify / Verify buttons on the invoice row. Log out.

#### Step 5 — Lydia approves the payment

**Login:** Lydia Nakato (normal role)

1. **Tasks** → click **Approve Payment: PROC-2026-0001 …**.  
2. Decision = **Approve payment and forward** → click it.

**Expect:** *Decision recorded.* The **Payment** card shows **UGX 4,800,000 · APPROVED** — the system raised the payment from the verified invoice and approved it. Log out.

#### Step 6 — Esther records the payment

**Login:** Esther Namukasa (Finance/Budget Officer)

1. **Tasks** → click **Record Payment: PROC-2026-0001 …** (Finance/Budget Officer can open procurements; only the Invoice and Payment cards are actionable).  
2. Decision = **Record payment and forward** → click it.

**Expect:** *Decision recorded.* The Payment card shows **PAID** and the procurement status moves to **READY_FOR_CLOSURE**. Log out.

#### Step 7 — Patrick closes the procurement

**Login:** Patrick Mbabazi

1. **Tasks** → click **Close Procurement: PROC-2026-0001 …**.  
2. Comment: *Delivered, inspected, invoiced and paid in full.*  
3. Decision = **Close procurement** → click it.

**Expect:** *Decision recorded.* The **Closure** card shows *Closed on … by Patrick Mbabazi* and the header status is **CLOSED**. The **Lifecycle timeline** at the bottom (collapsed — click to expand) lists every step.

**Success:** Micro procurement **CLOSED**.

---

## Phase 7 — Track B: Quotation (notebooks) — run in parallel

Do **not** wait for Micro to finish. Same Form 5 → CC gate as Phase 6.

### 7.1 Requisition + Part I

**Login:** Amina → **Requisitions → New**

| Field | Value |
| --- | --- |
| Title | Supply of 12 staff notebooks for ICT trainers |
| Plan | ICT Annual Procurement Plan 2026/2027 |
| Plan item | Staff notebooks (14") |
| Budget line | Computing devices |
| Lines | 12 × 4,500,000 = **54,000,000** |
| Justification | Equip ICT trainers with standard notebooks for labs |
| Delivery location | ICT staff room / Labs, NSI main campus |
| Form 5 Part I | Same pattern as 6.1 (member = Amina; funding item = Computing devices; market price ≈ 54M) |

Submit → run **6.2** approval chain (Robert → Joan → Michael → Lydia).

### 7.2 Method: recommend QUOTATION → CC approve

| Step | Who | Action |
| --- | --- | --- |
| 1 | Joan (org role) | Task **Recommend Procurement Method** → **QUOTATION** + short justification → **Shortlist providers (required)**: Pearl Notebooks, Kampala SoftTech, Nile Systems → **Run validation** (dialog: Kampala ✗ tax clearance) → **Shortlist with warnings** → **Shortlist anyway** (dialog closes; page shows *3 shortlisted*) → Submit |
| 2 | Lydia (switch to **Contracts Committee**) | Task **Approve Procurement Method** → Approve → Switch back to organisation role |

**Checkpoint:** Quotation procurement case exists.

### 7.3 Solicitation & educational bid document

**Login:** Joan — Procurement Officer → open the procurement

1. **Fill bid / RFQ document** (teaching) — subject, specs; Save; optional download. Complete task **Prepare RFQ Documents**.  
   - **Michael (Head PDU, org role)** → task **Review RFQ Documents** → Approve.  
   - **Lydia or Patrick → Switch to Contracts Committee** → task **Approve RFQ Documents** → Approve → Switch back to organisation role.  
2. Task **Issue RFQs to suppliers**: the provider picker is **prefilled from the Form 5 Part II shortlist** (Pearl Notebooks, Kampala SoftTech, Nile Systems) — keep it, set the **closing date**.  
   - **Run validation** → the dialog checks all three. Kampala SoftTech fails (*tax clearance expired*), so the button reads **Issue RFQs to suppliers with warnings** → **Issue RFQs to suppliers anyway**. The RFQs are issued and the task completes; the warning is recorded and Kampala is still invited (learning mode).  
   - **Closing date tip:** quotations can only be submitted **before** the closing date and only opened **after** it. In class, set it 20–30 minutes ahead.  
   - If you generated providers, invited **generated** ones answer immediately (the toast says how many simulated responses arrived).  
3. **Receive quotations** — three ways, use two of them here:

| Provider | Amount (UGX) | Delivery (days) | How it arrives |
| --- | ---: | ---: | --- |
| Pearl Notebooks Ltd | 53,400,000 | 14 | **Provider portal** — log in as Pearl → sidebar **Opportunities** → send icon *Submit quotation* |
| Kampala SoftTech Ltd | 54,900,000 | 21 | Officer-recorded (Joan) — task **Receive quotations** → **Record offer (keep step open)** |
| Nile Systems Group Ltd | 52,800,000 | 10 | Officer-recorded (Joan) — same, then complete the step |

   The **Offers** card on the procurement shows each offer with a source chip (**Officer / Portal / Automatic**) and marks the **Lowest price**. While the RFQ is open Pearl can **edit** or **withdraw** its quotation in the portal.  
4. After the closing date: **Open quotations** as the task requires.

### 7.4 Evaluation (Evaluation Committee — system-run eligibility)

1. **Joan (org role)** → task **Nominate Evaluation Committee** → complete. **Lydia or Patrick → Contracts Committee seat** → task **Approve Evaluation Committee** → Approve.  
2. **Login Robert** → Switch to **Evaluation Committee (Chairperson)**. My Tasks now shows **Technical Evaluation** and **Financial Evaluation** — complete them, then open the procurement → **Evaluation** panel:  
   - **Run validation** → the dialog checks all three bidders → Pearl ✓, Nile ✓, **Kampala ✗** (tax clearance expired) → **Confirm eligibility results with warnings** → **Confirm eligibility results anyway** (dialog closes; panel shows *Eligibility results confirmed* and the recommendation form appears).  
   - **Recommended bidder:** defaults to the lowest-priced eligible — **Nile Systems, 52,800,000**. Write the recommendation (e.g. *Lowest evaluated eligible quotation; delivery 10 days*).  
   - **Save draft** (Amina as Secretary may also log in, switch seat, and edit the draft) → **Submit evaluation report**.  
   - (Try it) pick Kampala instead → the system warns *not eligible* and asks **Continue anyway?** — cancel; that is the recorded-warning path, not the story.  
   - Still in the Evaluation Committee seat → task **Prepare Evaluation Report** → complete (refused until the report is submitted) → Banner → Switch back to organisation role.  
3. **Michael (Head PDU, org role)** → task **Review Evaluation Report** → Approve.  
4. **Lydia or Patrick → Contracts Committee seat** → task **Approve Evaluation Report** → Approve. This marks the report APPROVED (the committee, not an officer, approves it).  
5. Post-qualification is **optional** for quotations (only if the procurement requires it). If shown, follow 8.2 step 6.

### 7.5 Award → LPO → delivery → invoice → pay → close

1. **Michael** → **Prepare Award Recommendation**; **Patrick (org role)** → **Review Award Recommendation**; then **Lydia or Patrick → Contracts Committee seat** → task **Approve Award** → Approve. This creates the award to Nile Systems **52,800,000**. (The *Create award* button on the procurement page only appears in the Contracts Committee seat.)  
2. **Joan** → **Communicate Award Decision**.  
3. **LPO:** **Patrick** → **Prepare LPO/Contract** → **Lydia (org role)** → **Approve/Sign LPO/Contract** → **Joan** → **Issue LPO/Contract** → **Joan** → **Confirm Supplier Acceptance**. The **delivery address** comes from the requisition (*ICT staff room / Labs, NSI main campus*); while the LPO is **DRAFT or APPROVED**, Joan / Patrick / Michael can edit it with the pin icon — the change carries to delivery and invoice.  
4. **Delivery:** **Amina** → **Record Delivery** → **Amina** → **Verify Delivery** → **Robert (org role)** → **Certify Delivery**. Partial delivery (optional teaching): first **7** accepted, then remainder **5**.  
5. **Invoice from the portal:** log in as **Nile Systems** → sidebar **Orders** → LPO card → green receipt icon *Submit invoice*: your invoice no. `NSG-2026-0457`, amount **52,800,000**, date. The system gives it its own number (`INV-PROC-…-001`).  
6. **Amina** → **Receive/Record Invoice** → choose Nile's invoice → **Patrick** → **Verify Invoice** → **Lydia** → **Approve Payment** → **Esther** → **Record Payment** → **Patrick** → **Close Procurement**.  
7. Nile can follow the invoice status and the payment under sidebar **Invoices** / **Payments** in the portal.

**Success:** Quotation case closed; Micro may still be open or also closed.

---

## Phase 8 — Track C: Tender (Wi‑Fi lot)

Same Form 5 → CC gate.

### 8.1 Requisition + Part I → approvals → recommend TENDER → CC approve

| Field | Value |
| --- | --- |
| Title | Supply and installation — campus Wi‑Fi refresh |
| Plan item | Campus Wi‑Fi refresh (lot) |
| Budget | Network & connectivity |
| Value | **95,000,000** |
| Joan recommends | **TENDER** (no provider selection — tenders are advertised openly) |
| CC | Approve method |

### 8.2 Tender branch (follow Tasks)

1. Joan prepares / fills the **bidding document** → **Prepare Tender Documents**. Michael → **Review Tender Documents**. **Lydia or Patrick → Contracts Committee seat** → **Approve Tender Documents**.  
2. Task **Advertise tender**: set the closing date (same tip as 7.3). A tender is open to **every active provider** — no invite list. Generated Goods providers (if any) bid automatically.  
3. Receive bids:

| Bidder | Amount (UGX) | How it arrives |
| --- | ---: | --- |
| Horizon Networks UG Ltd | 93,500,000 | Officer-recorded (Joan) — task **Receive bids** → **Record offer (keep step open)** |
| Nile Systems Group Ltd | 94,600,000 | **Provider portal** — Nile submits **95,400,000**, then **edits** it to **94,600,000** before closing |

4. Open bids after the closing date (tasks). Michael → **Forward Bids for Evaluation**. Joan → **Nominate Evaluation Committee**. **Contracts Committee seat** → **Approve Evaluation Committee**.  
5. **Evaluation:** Robert → **Switch to Evaluation Committee** → complete **Technical Evaluation** and **Financial Evaluation** → Evaluation panel → **Run validation** (dialog) → **Confirm eligibility results with warnings** → **… anyway**:  
   - **Horizon ✗** — no NSSF clearance → not eligible, even though it is the cheapest.  
   - **Nile ✓** → the system suggests **Nile Systems, 94,600,000** as lowest eligible.  
   - Recommend Nile → **Submit evaluation report** → task **Prepare Evaluation Report** → complete.  
   - **Teaching point:** the cheapest bid is not automatically the winner — eligibility comes first. Choosing Horizon is possible but only **with warnings**, which stay on the record.  
6. Michael (org role) → **Review Evaluation Report** → Approve.  
7. **Post-qualification (required for tenders):** Robert (still/again in the Evaluation Committee seat) → Evaluation panel → Post-qualification → **Run validation** on Nile (dialog, all ✓) → **Submit post-qualification** → task **Post-Qualification where applicable** → complete. Switch back to organisation role.  
8. **Lydia or Patrick → Contracts Committee seat** → task **Approve Evaluation/Recommendation** → Approve. This approves both the evaluation report and the post-qualification. (To reject post-qualification instead, use **Reject** on the Evaluation panel with a comment while in the Contracts Committee seat.)  
9. Michael → **Prepare Award Recommendation** → **Contracts Committee seat** → **Approve Award** (creates the award).  
10. **Contract** process (not LPO): Joan → **Communicate Award**; Patrick → **Prepare Contract**; Lydia (org role) → **Sign/Approve Contract**; Patrick → **Issue Contract**; Joan → **Supplier Acceptance**. The contract carries the delivery address from the requisition.  
11. Amina → **Delivery**. **Robert or Amina → Switch to Inspection / Acceptance Committee** → task **Inspection/Acceptance** → record accepted quantities → Approve → switch back. Then **Nile submits the invoice in the portal** (94,600,000) → **Amina** → **Invoice** (choose Nile's invoice) → **Patrick** → **Invoice Verification** → **Lydia** → **Payment Approval** → **Esther** → **Payment Recording** → **Patrick** → **Procurement Closure**.

**Success:** Tender path used **Contract** process; LPO not required for this branch. The cheapest non-compliant bidder lost on eligibility.

---

## Phase 9 — Track E: Emergency UPS (after emergency plan approved)

**Login:** Amina — new requisition linked to **Emergency — Hall B UPS** plan / item (include Form 5 Part I).

| Field | Value |
| --- | --- |
| Title | Emergency replacement of Hall B UPS 10kVA |
| Plan | Emergency — Hall B UPS replacement |
| Plan item | Online UPS 10kVA for Hall B |
| Budget line | Power & continuity (UPS) |
| Value | **8,500,000** |
| Required by | 7 days from today |
| Justification | Failed UPS; exams in Hall B within 10 days |
| Delivery location | Lecture Hall B, NSI main campus |

Approvals (6.2) → Joan recommends **MICRO** with justification *Emergency — single known provider, exam continuity (Direct procurement in practice)* and selects **Twin Lakes Power Solutions** → **Run validation** → **Select supplier** → Lydia in **Contracts Committee** Approves method.

**Provider steps (same as Track A, one provider):**

1. **Issue purchase instruction** → **Twin Lakes Power Solutions** is prefilled from Form 5 → **Run validation** (dialog, all ✓) → **Issue purchase instruction to supplier** (8,500,000). Delivery address: *Lecture Hall B, NSI main campus*.  
2. Amina records the delivery → Robert (Head User Department, org role) accepts it — Micro needs no inspection committee.  
3. **Twin Lakes logs in to the portal** → sidebar **Orders** → *Submit invoice* (`TLP-0031`, 8,500,000).  
4. **Patrick** → **Process Invoice** → choose Twin Lakes' invoice → **Process invoice and forward** → **Lydia** → **Approve payment and forward** → **Esther** → **Record payment and forward** → **Patrick** → **Close procurement** (same as Track A steps 4–7).

**Teaching point:** Emergency **plan** ≠ method. The emergency plan only documents the need outside annual consolidation; **method** is still recommended on Form 5 Part II and approved by Contracts Committee. Urgency changes the *planning* path and justifies going to one provider — it does **not** skip provider validation, delivery, inspection, invoice or payment.

---

## Phase 10 — What “done” looks like

| Check | Expect |
| --- | --- |
| Processes | All listed processes show **activated** for the org |
| Budget | ICT budget APPROVED, 197M lines |
| Plans | 1 annual APPROVED + 1 emergency APPROVED |
| Procurements | ≥3 cases (Micro / Quotation / Tender) + emergency (Micro) |
| Providers | 6 named providers in the register; Kampala and Horizon show **Doesn't qualify** |
| Run validation | Used on purchase instruction, RFQ invites, evaluation and post-qualification; any "with warnings" choice appears in the activity log |
| Offers | Offers card shows Officer + Portal (+ Automatic if generated providers were used); Pearl / Nile edited or submitted in the portal |
| Delivery address | Same address on requisition → PI / LPO / contract → delivery → invoice |
| Invoices | Officer-received (Lake Victoria) and portal-submitted (Nile, Twin Lakes), each with an auto-generated `INV-PROC-…` number; selected on **Process Invoice** (Micro) or **Receive/Record Invoice** / **Invoice** (Quotation / Tender) |
| Evaluation | Reports carry recorded eligibility results; tender has an approved post-qualification |
| Form 5 | Part I on each requisition create; Part II by PO; CC approve before case start |
| Committees | Eval / inspection / Contracts done in **committee mode** (banner), then **Switch back to organisation role** |
| Parallelism | Laptop quotation progressed while whiteboard micro still open |
| Audit / notifications | Org activity log and bell show approvals (spot-check) |

---

## Quick role cheat-sheet

| When you need… | Log in as | Mode |
| --- | --- | --- |
| Structure, FY, processes, users, committees | Organization Administrator | — |
| Budget / plans / requisition create (+ Form 5 Part I) | Amina (UD Officer) | Org role |
| Department endorse | Robert (HOD) | Org role |
| Plan consolidate / funding verify | Michael (Head PDU) | Org role |
| Annual plan Contracts Officer review | Patrick | Org role |
| Budget finance review, record payments | Esther | Org role |
| Final approve budget / plans / requisitions, sign LPO / contract, approve payments | Lydia (AO) | Org role |
| Form 5 Part II recommend method, purchase instruction, RFQ / tender, offers, issue LPO | Joan (PO) | Org role |
| Prepare LPO / contract, process / verify invoices, close procurement | Patrick (Contracts Officer) | Org role |
| Record delivery; receive invoice (Quotation / Tender) | Amina (UD Officer) | Org role |
| Add / generate / suspend providers | Joan (PO) or Michael (Head PDU) | Org role |
| **Approve method, RFQ/tender documents, evaluation committee, evaluation report, post-qualification, award** | Lydia or Patrick | **Contracts Committee** |
| Technical/financial evaluation, evaluation report, post-qualification | Robert / Joan / Amina | **Evaluation Committee** |
| Tender inspection & acceptance | Robert / Amina / Esther | **Inspection & Acceptance** |
| Micro / Quotation delivery verification | Amina / Robert | Org role |
| Submit / edit / withdraw quotation or bid, submit invoice, view payments | Provider (Pearl, Nile, Twin Lakes) | **Provider portal** |

---

## If something blocks you

| Symptom | Likely fix |
| --- | --- |
| Cannot create annual plan | Planning period not OPEN, or FY inactive |
| Emergency submit: process inactive | Activate **Emergency Planning Process** |
| No budget lines on plan | Budget not APPROVED |
| No “Recommend method” task | AO has not approved the requisition yet |
| Contracts Committee task list empty after Form 5 | Form 5 Part II was not submitted — Joan must click **Recommend method** after **Select supplier**; the task should leave Joan's list |
| Micro picker shows nobody under "Doesn't qualify" | Expected — Micro only requires URSB, TIN and trading licence, so Kampala SoftTech (expired tax clearance) and Horizon (no NSSF) still qualify for Micro |
| Recommend submits but no procurement | Expected — wait for **Contracts Committee** Approve |
| No CC task / no assignees | Create Contracts Committee + seat Lydia/Patrick; actor must **Switch to Contracts Committee** |
| CC task missing while in org role | Switch into committee mode (exclusive filter) |
| Org tasks missing after CC work | Banner → **Switch back to organisation role** |
| "Issue Purchase Instruction" not in Joan's tasks | It is step 1 of the Micro procurement and only appears after the Contracts Committee approves the method. Work is on the **procurement** page (PROC-…), not the requisition |
| MICRO refused on Form 5 Part II | The requisition is above UGX 10,000,000 — recommend QUOTATION or TENDER |
| Evaluation / inspection blocked | Wrong seat or still in another committee mode |
| Quotation invite rejected | Provider missing or inactive / suspended in the register |
| Portal: "Invalid username or password" | Use the **portal login** from the provider detail page (ends `@provider.learn`), password `password123` |
| Portal: account suspended or inactive | Joan / Michael reactivates the provider in the register |
| Provider cannot submit / edit / withdraw | Closing date passed, or (RFQ) the provider was not invited |
| "Open quotations / bids" refused | Closing date not reached yet — wait or set a shorter closing date next time |
| No Evaluation panel actions | Not seated on the Evaluation Committee, or not switched into that seat |
| Award blocked on a quotation / tender | Evaluation report not APPROVED yet (or tender post-qualification not approved) — the Contracts Committee approves both |
| "Prepare Evaluation Report" refused | Submit the evaluation report on the Evaluation panel first (Evaluation Committee seat) |
| "Approve Evaluation Report / Recommendation" refused | The Evaluation Committee has not submitted the report (tender: or the post-qualification) yet |
| Committee step has no assignees | That committee is missing, inactive, or has no seated members — Org Admin → Committees |
| No *Create award* button | Expected outside the Contracts Committee seat — the committee makes the award decision |
| "Process Invoice" / "Receive/Record Invoice" has nothing to choose | Receive the invoice first (officer form) or let the provider submit it in the portal |
| Portal "Submit invoice" disabled | No delivery has passed inspection yet, or the order is fully invoiced |
| Generated providers did not respond | Their behaviour is *non-responsive* or *late*, or they were not invited (RFQ) / not in the category (tender) |

---

## Suggested session timing

| Block | Time |
| --- | --- |
| Phase 0–1 setup (incl. provider register) | 30–45 min |
| Budget + annual plan | 20–30 min |
| Emergency plan | 10–15 min |
| Micro (incl. Form 5 + CC) | 25–40 min |
| Quotation + eval | 35–50 min |
| Tender + contract | 35–50 min |
| Emergency requisition → closure | 20–30 min |

Facilitators can split classes: Team A Micro, Team B Quotation, Team C Tender, after shared setup and approved budget/plan.
