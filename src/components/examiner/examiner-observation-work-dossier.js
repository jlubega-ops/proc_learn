"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { format, parseISO } from "date-fns";
import { BRAND_CARD_CLASS, BRAND_PAGE_LEAD_CLASS, BRAND_SECTION_TITLE_CLASS } from "@/lib/brand-ui";
import {
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";

/**
 * Read-only submitted work (budgets, plans, requisitions, procurements).
 * @param {{ work: any }} props
 */
export function ExaminerObservationWorkDossier({ work }) {
  if (!work) {
    return (
      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Submitted work</h2>
        <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>No organisation records yet.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
        <h2 className={BRAND_SECTION_TITLE_CLASS}>Submitted work</h2>
        <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>
          Open any record to inspect the form the student (or their organisation players) submitted.
          This view is read-only.
        </p>
      </section>

      <RecordGroup
        title="Financial years"
        empty="No financial years yet."
        count={work.financialYears?.length || 0}
      >
        {!work.financialYears?.length ? null : (
          <SimpleTable
            headers={["Label", "Start", "End", "Status"]}
            rows={work.financialYears.map((fy) => [
              fy.label,
              fmtDate(fy.startDate),
              fmtDate(fy.endDate),
              fy.isActive ? "Active" : "Inactive",
            ])}
          />
        )}
      </RecordGroup>

      <RecordGroup
        title="Departments / units"
        empty="No departments yet."
        count={work.departments?.length || 0}
      >
        {!work.departments?.length ? null : (
          <SimpleTable
            headers={["Name", "Code", "Type", "Status"]}
            rows={work.departments.map((d) => [
              d.name,
              d.code || "—",
              human(d.unitType),
              d.isActive ? "Active" : "Inactive",
            ])}
          />
        )}
      </RecordGroup>

      <RecordGroup title="Budgets" empty="No budgets yet." count={work.budgets?.length || 0}>
        {(work.budgets || []).map((b) => (
          <DetailAccordion
            key={b.id}
            title={b.title}
            status={b.status}
            subtitle={[
              b.budgetReference,
              b.financialYear?.label,
              b.department?.name,
              b.totals ? formatMoneyUGX(b.totals.approvedAmount) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <Dl
              items={[
                ["Description", b.description || "—"],
                ["Currency", b.currency || "UGX"],
                ["Created by", b.createdBy?.displayName || "—"],
                ["Submitted", fmtDate(b.submittedAt)],
                ["Approved by", b.approvedBy?.displayName || "—"],
                ["Approved", fmtDate(b.approvedAt)],
                ["Total approved", formatMoneyUGX(b.totals?.approvedAmount)],
                ["Committed", formatMoneyUGX(b.totals?.committedAmount)],
                ["Remaining", formatMoneyUGX(b.totals?.remainingAmount)],
              ]}
            />
            <h3 className={`${BRAND_SECTION_TITLE_CLASS} mt-3`}>Budget lines</h3>
            {!b.lines?.length ? (
              <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>No lines.</p>
            ) : (
              <SimpleTable
                headers={["Code", "Name", "Approved", "Committed", "Available"]}
                rows={b.lines.map((l) => [
                  l.code,
                  l.name,
                  formatMoneyUGX(l.approvedAmount),
                  formatMoneyUGX(l.committedAmount),
                  formatMoneyUGX(l.availableBalance),
                ])}
              />
            )}
          </DetailAccordion>
        ))}
      </RecordGroup>

      <RecordGroup
        title="Procurement plans"
        empty="No plans yet."
        count={work.plans?.length || 0}
      >
        {(work.plans || []).map((p) => (
          <DetailAccordion
            key={p.id}
            title={p.title}
            status={p.status}
            subtitle={[
              p.planReference,
              p.financialYear?.label,
              p.department?.name,
              p.totals ? formatMoneyUGX(p.totals.estimatedTotal) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <Dl
              items={[
                ["Created by", p.createdBy?.displayName || "—"],
                ["Submitted", fmtDate(p.submittedAt)],
                ["Approved by", p.approvedBy?.displayName || "—"],
                ["Approved", fmtDate(p.approvedAt)],
                ["Items", String(p.totals?.itemCount ?? 0)],
                ["Estimated total", formatMoneyUGX(p.totals?.estimatedTotal)],
              ]}
            />
            <h3 className={`${BRAND_SECTION_TITLE_CLASS} mt-3`}>Plan items</h3>
            {!p.items?.length ? (
              <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>No items.</p>
            ) : (
              <SimpleTable
                headers={["#", "Item", "Qty", "Unit price", "Total", "Justification"]}
                rows={p.items.map((it) => [
                  String(it.itemNumber ?? ""),
                  it.title,
                  `${it.quantity || "—"}${it.unitOfMeasure ? ` ${it.unitOfMeasure}` : ""}`,
                  formatMoneyUGX(it.estimatedUnitPrice),
                  formatMoneyUGX(it.estimatedTotal),
                  it.justification || "—",
                ])}
              />
            )}
          </DetailAccordion>
        ))}
      </RecordGroup>

      <RecordGroup
        title="Requisitions"
        empty="No requisitions yet."
        count={work.requisitions?.length || 0}
      >
        {(work.requisitions || []).map((r) => (
          <DetailAccordion
            key={r.id}
            title={r.title}
            status={r.status}
            subtitle={[
              r.requisitionReference,
              r.department?.name,
              formatMoneyUGX(r.estimatedTotalValue),
              r.procurementMethod,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <Dl
              items={[
                ["Need", r.needDescription || "—"],
                ["Justification", r.justification || "—"],
                ["Category", r.category || "—"],
                ["Delivery location", r.deliveryLocation || "—"],
                ["Required by", fmtDate(r.requiredByDate)],
                ["Remarks", r.remarks || "—"],
                ["Requester", r.requester?.displayName || "—"],
                ["Submitted", fmtDate(r.submittedAt)],
                ["Approved by", r.approvedBy?.displayName || "—"],
                ["Approved", fmtDate(r.approvedAt)],
                [
                  "Budget line",
                  r.budgetLine
                    ? `${r.budgetLine.code} — ${r.budgetLine.name} (avail. ${formatMoneyUGX(
                        r.budgetLine.availableBalance,
                      )})`
                    : "—",
                ],
                ["Plan", r.procurementPlan?.title || "—"],
                ["Plan item", r.procurementPlanItem?.title || "—"],
              ]}
            />
            <h3 className={`${BRAND_SECTION_TITLE_CLASS} mt-3`}>Line items</h3>
            {!r.items?.length ? (
              <p className={`mt-1 ${BRAND_PAGE_LEAD_CLASS}`}>No line items.</p>
            ) : (
              <SimpleTable
                headers={["#", "Item", "Qty", "Unit price", "Total"]}
                rows={r.items.map((it) => [
                  String(it.lineNumber ?? ""),
                  it.itemName,
                  `${it.quantity || "—"}${it.unitOfMeasure ? ` ${it.unitOfMeasure}` : ""}`,
                  formatMoneyUGX(it.estimatedUnitPrice),
                  formatMoneyUGX(it.estimatedTotal),
                ])}
              />
            )}
          </DetailAccordion>
        ))}
      </RecordGroup>

      <RecordGroup
        title="Procurements"
        empty="No procurements yet."
        count={work.procurements?.length || 0}
      >
        {(work.procurements || []).map((p) => (
          <DetailAccordion
            key={p.id}
            title={p.title || p.procurementNumber}
            status={p.status}
            subtitle={[p.procurementNumber, p.procurementMethod, p.department?.name]
              .filter(Boolean)
              .join(" · ")}
          >
            <Dl
              items={[
                ["Officer", p.officer?.displayName || "—"],
                ["Method selected", fmtDate(p.methodSelectedAt)],
                ["Requisition", p.requisition?.requisitionReference || p.requisition?.title || "—"],
                ["Closed", fmtDate(p.closedAt)],
                ["Closure remarks", p.closureRemarks || "—"],
              ]}
            />
            {p.purchaseInstructions?.length ? (
              <>
                <h3 className={`${BRAND_SECTION_TITLE_CLASS} mt-3`}>Purchase instructions</h3>
                <ul className={`mt-1 list-inside list-disc text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
                  {p.purchaseInstructions.map((pi) => (
                    <li key={pi.id || pi.instructionNumber}>
                      {pi.instructionNumber || "PI"} · {pi.status || ""} ·{" "}
                      {pi.supplier?.name || pi.providerName || "—"}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {p.solicitations?.length ? (
              <>
                <h3 className={`${BRAND_SECTION_TITLE_CLASS} mt-3`}>Solicitations</h3>
                <ul className={`mt-1 list-inside list-disc text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
                  {p.solicitations.map((s) => (
                    <li key={s.id}>
                      {s.reference || s.title || "Solicitation"} · {s.status || ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {p.awards?.length ? (
              <>
                <h3 className={`${BRAND_SECTION_TITLE_CLASS} mt-3`}>Awards</h3>
                <ul className={`mt-1 list-inside list-disc text-sm ${BRAND_PAGE_LEAD_CLASS}`}>
                  {p.awards.map((a) => (
                    <li key={a.id}>
                      {a.recommendedSupplier?.name || a.supplier?.name || "Award"} · {a.status || ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </DetailAccordion>
        ))}
      </RecordGroup>
    </div>
  );
}

function RecordGroup({ title, empty, count, children }) {
  return (
    <section className={`${BRAND_CARD_CLASS} p-4 sm:p-5`}>
      <h2 className={BRAND_SECTION_TITLE_CLASS}>
        {title} <span className="font-normal text-zinc-500">({count})</span>
      </h2>
      {count === 0 ? <p className={`mt-2 ${BRAND_PAGE_LEAD_CLASS}`}>{empty}</p> : children}
    </section>
  );
}

function DetailAccordion({ title, status, subtitle, children }) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      className="mt-2 border border-[color:var(--border-subtle)]"
      sx={{
        bgcolor: "var(--surface-elevated)",
        color: "var(--foreground)",
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRounded />}
        className="cursor-pointer"
        sx={{ "& .MuiAccordionSummary-content": { my: 1, alignItems: "center", gap: 1 } }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{title}</span>
            {status ? <StatusChip status={status} /> : null}
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
          ) : null}
        </div>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

function StatusChip({ status }) {
  const s = String(status || "").toUpperCase();
  const color =
    s === "APPROVED" || s === "CLOSED" || s === "ACTIVE"
      ? "success"
      : s.includes("REJECT") || s.includes("CANCEL")
        ? "error"
        : s.includes("DRAFT") || s.includes("RETURN") || s.includes("PENDING")
          ? "warning"
          : "info";
  return <Chip size="small" color={color} label={human(status)} />;
}

function Dl({ items }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="font-medium text-foreground">{k}</dt>
          <dd className={BRAND_PAGE_LEAD_CLASS}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <TableContainer component={Paper} sx={{ ...adminOutlinedTableContainerSx, mt: 1 }}>
      <Table size="small" sx={adminTableSx}>
        <TableHead>
          <TableRow>
            {headers.map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(/** @type {any} */ (value));
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function human(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
