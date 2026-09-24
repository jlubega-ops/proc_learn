# Proc Learn — Full procurement tryout scenario

**Purpose:** Walk the current app from organisation setup through budgeting, annual planning, **emergency planning**, requisitions, and three method branches (Micro, Quotation, Tender) to closure.

**Style:** Role-directed, with realistic figures. Built for **this** Proc Learn build (engine processes by `triggerKey`, Form 5 / Circular fill, emergency plans, officer-recorded offers). Do not treat this as a copy of any earlier paper manual.

**Shared org password for simulated users:** `password123`  
**Login emails:** auto-generated on **Org Admin → Users** (lowercase, includes project code, e.g. `amina.nalwoga.ab12c_org-xxxxxx@org.learn`). Copy from the user list after create — do not invent emails. Always **log out** of one org persona before logging in as the next.

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
| E | Emergency UPS replacement | Emergency plan → then Micro or Quotation | UGX 8,500,000 |

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

**Contracts Committee** (required — method approval gate before Micro / Quotation / Tender)

| Seat | Assign existing persona |
| --- | --- |
| Chairperson | Lydia Nakato (Accounting Officer) |
| Member | Patrick Mbabazi (Contracts Officer) |
| Secretary | Robert Ssekandi (Head User Department) — optional third seat |

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
   - Optional: Add seat → Robert → **Secretary**  
   Do **not** seat Michael (Head PDU) or Esther (Finance).

Confirm the Committees list shows those seats. You will not use separate committee logins; actors switch context later when a seat is required. Exclusive **committee mode** hides org-role tasks until you **Clear seat**.

### 1.8 Suppliers (registry — no bidder login yet)

**Suppliers** (as Head PDU or Procurement Officer after you switch — or create now if Admin can manage):

| Supplier | Notes |
| --- | --- |
| Lake Victoria Office Ltd | Micro / furniture |
| Pearl Notebooks Ltd | Quotation shortlist |
| Kampala SoftTech Ltd | Quotation shortlist |
| Nile Systems Group Ltd | Quotation + tender |
| Horizon Networks UG Ltd | Tender |
| Twin Lakes Power Solutions | Emergency UPS |

Mark 2–3 as active / “prequalified” mentally for teaching (use whatever flags the UI exposes).

**Log out** of Admin before operational work.

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

Circular: planned method = Micro or RFQ; justification = exam continuity / failed unit.  
Save → Submit.

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

**Exit committee mode** when done: banner → **Clear seat** (or switch back) so you see your normal org tasks again.

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

| Step | Login as | Task action |
| --- | --- | --- |
| 1 | Robert — Head User Department | Approve |
| 2 | Joan — Procurement Officer | Verify plan |
| 3 | Michael — Head PDU | Verify funding |
| 4 | Lydia — Accounting Officer | Approve |

**Checkpoint:** Requisition status shows AO-approved / ready for method recommendation. You should **not** see a procurement case yet.

### 6.3 Recommend method → Contracts Committee approve (starts Micro)

#### A — PDU recommends (Form 5 Part II)

**Login:** Joan Atim (Procurement Officer)  
Stay in org role (no committee mode).

1. Open **Tasks** → **Recommend Procurement Method (Form 5 Part II)** (or open the requisition detail).  
2. Set:

| Field | Value |
| --- | --- |
| Recommended procurement method | **MICRO** |
| Method justification | Value within micro threshold; standard goods available from local supplier; urgent classroom continuity |

3. Submit / Complete the task.  
4. Toast should indicate Form 5 Part II submitted and that **Contracts Committee must approve**.

**Checkpoint:** Still **no** Micro procurement case. Next task belongs to Contracts Committee.

#### B — Contracts Committee approves method

**Login:** Lydia Nakato (or Patrick if she is not seated)

1. Account menu → **Switch committee context** → **Contracts Committee** (Chairperson / Member as assigned).  
2. Confirm yellow **Committee mode** banner: only CC work is visible.  
3. Open **Tasks** → **Approve Procurement Method (Contracts Committee)**.  
4. Review recommended **MICRO** + justification.  
5. Decision: **Approve** (or Return / Reject if testing those paths).  
6. Banner → **Clear seat** when finished.

**Checkpoint:** Procurement case created (note the number / title). **Micro Procurement** workflow tasks appear for org roles. Method is locked from Form 5 + CC — do not expect a second “pick method” step.

### 6.4 Micro path (follow Tasks on the procurement)

Complete each pending task as the role named on the task. Clear any leftover committee mode first.

Typical teaching order:

1. Confirm / raise micro request details (UD / PO as assigned).  
2. Verify & budget confirmations (PO / Head PDU / Finance as tasks demand).  
3. Issue **purchase instruction** to **Lake Victoria Office Ltd** for UGX **4,800,000**.  
4. Record delivery.  
5. Inspection: **Login Robert** → **Switch to Inspection & Acceptance Committee (Chairperson)**; use Amina / Esther for Member / Secretary seats if tasks require them. Clear seat after.  
6. Invoice → payment (Finance / AO).  
7. Close when ready.

**Success:** Micro procurement **CLOSED** (or ready for closure then closed).

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
| 1 | Joan (org role) | Task **Recommend Procurement Method** → **QUOTATION** + short justification → Submit |
| 2 | Lydia (switch to **Contracts Committee**) | Task **Approve Procurement Method** → Approve → Clear seat |

**Checkpoint:** Quotation procurement case exists.

### 7.3 Solicitation & educational bid document

**Login:** Joan — Procurement Officer → open the procurement

1. **Fill bid / RFQ document** (teaching) — subject, specs, closing date; Save; optional download.  
2. Ensure solicitation exists; **invite** Pearl Notebooks, Kampala SoftTech, Nile Systems.  
3. Issue / open as tasks require.  
4. **Receive quotations** (officer-recorded — no supplier login):

| Supplier | Amount (UGX) | Note |
| --- | ---: | --- |
| Pearl Notebooks Ltd | 53,400,000 | Compliant |
| Kampala SoftTech Ltd | 54,900,000 | Compliant |
| Nile Systems Group Ltd | 52,800,000 | Compliant |

### 7.4 Evaluation committee (exclusive committee mode)

1. Nominate / approve evaluation committee if tasks ask.  
2. **Login Amina** → Switch to **Evaluation Committee (Secretary)** — record technical pass for all three → Clear seat.  
3. **Login Robert** → Switch to **Evaluation Committee (Chairperson)** — financial ranking; recommend **Nile Systems** at **52,800,000**. (Joan as Member if a member step appears.) Clear seat after.  
4. Submit / approve evaluation report per tasks.  
5. Run **Post-qualification** on Nile Systems if that process is active.

### 7.5 Award → LPO → delivery → pay → close

1. Award Nile Systems **52,800,000**.  
2. Draft / approve / issue **LPO**.  
3. Partial delivery (optional teaching): first **7** accepted, then remainder **5**.  
4. Invoice **52,800,000** → verify → pay (`PAY-NSI-2026-Q01`) → close.

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
| Joan recommends | **TENDER** |
| CC | Approve method |

### 8.2 Tender branch (follow Tasks)

1. Prepare / fill **bidding document** on the procurement.  
2. Invite or advertise **Horizon Networks** + **Nile Systems** (+ optional third).  
3. Record bids (officer-entered):

| Bidder | Amount (UGX) |
| --- | ---: |
| Horizon Networks UG Ltd | 93,500,000 |
| Nile Systems Group Ltd | 96,200,000 |

4. Evaluation: Amina / Robert → **Switch to Evaluation Committee** → recommend Horizon **93,500,000** → Clear seat.  
5. Post-qual → Award → **Contract** process (not LPO) → signature / issue.  
6. Delivery / inspection (Inspection committee mode) → invoice → payment → close.

**Success:** Tender path used **Contract** process; LPO not required for this branch.

---

## Phase 9 — Track E: Emergency UPS (after emergency plan approved)

**Login:** Amina — new requisition linked to **Emergency — Hall B UPS** plan / item (include Form 5 Part I).

| Field | Value |
| --- | --- |
| Title | Emergency replacement of Hall B UPS 10kVA |
| Plan | Emergency — Hall B UPS replacement |
| Value | **8,500,000** |
| Justification | Failed UPS; exams in Hall B within 10 days |

Approvals (6.2) → Joan recommends **MICRO** (or **QUOTATION**) → Lydia in **Contracts Committee** Approves method.

Supplier: **Twin Lakes Power Solutions** · Amount **8,500,000**. Run that method path to closure.

**Teaching point:** Emergency **plan** ≠ method. The emergency plan only documents the need outside annual consolidation; **method** is still recommended on Form 5 Part II and approved by Contracts Committee.

---

## Phase 10 — What “done” looks like

| Check | Expect |
| --- | --- |
| Processes | All listed processes show **activated** for the org |
| Budget | ICT budget APPROVED, 197M lines |
| Plans | 1 annual APPROVED + 1 emergency APPROVED |
| Procurements | ≥3 cases (Micro / Quotation / Tender), optionally + emergency |
| Form 5 | Part I on each requisition create; Part II by PO; CC approve before case start |
| Committees | Eval / inspection / Contracts done in **committee mode** (banner), then Clear seat |
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
| Budget finance review | Esther | Org role |
| Final approve budget / plans / requisitions / payments | Lydia (AO) | Org role |
| Form 5 Part II recommend method, RFQ, offers, LPO | Joan (PO) | Org role |
| **Approve procurement method** | Lydia or Patrick | **Contracts Committee** |
| Evaluation seats | Robert / Joan / Amina | **Evaluation Committee** |
| Inspection seats | Robert / Amina / Esther | **Inspection & Acceptance** |

---

## If something blocks you

| Symptom | Likely fix |
| --- | --- |
| Cannot create annual plan | Planning period not OPEN, or FY inactive |
| Emergency submit: process inactive | Activate **Emergency Planning Process** |
| No budget lines on plan | Budget not APPROVED |
| No “Recommend method” task | AO has not approved the requisition yet |
| Recommend submits but no procurement | Expected — wait for **Contracts Committee** Approve |
| No CC task / no assignees | Create Contracts Committee + seat Lydia/Patrick; actor must **Switch to Contracts Committee** |
| CC task missing while in org role | Switch into committee mode (exclusive filter) |
| Org tasks missing after CC work | Banner → **Clear seat** |
| Evaluation / inspection blocked | Wrong seat or still in another committee mode |
| Quotation invite rejected | Supplier missing or inactive in registry |

---

## Suggested session timing

| Block | Time |
| --- | --- |
| Phase 0–1 setup | 25–40 min |
| Budget + annual plan | 20–30 min |
| Emergency plan | 10–15 min |
| Micro (incl. Form 5 + CC) | 25–40 min |
| Quotation + eval | 35–50 min |
| Tender + contract | 35–50 min |
| Emergency requisition | 15–20 min |

Facilitators can split classes: Team A Micro, Team B Quotation, Team C Tender, after shared setup and approved budget/plan.
