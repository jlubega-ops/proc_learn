"use client";

import { useImperativeHandle, useState } from "react";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { useToast } from "@/components/providers/toast-provider";
import { discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { formatPrintDate } from "@/components/print/print-document";
import { adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { formatMoneyAmount, formatMoneyUGX } from "@/lib/money";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";
import { buildBidDocument } from "@/lib/projects/ppda-forms";
import {
  APPROVE_BID_DOCS_STEP_RE,
  REVIEW_BID_DOCS_STEP_RE,
  biddingPeriodDays,
  latestStepSignOff,
} from "@/lib/projects/invoice-match";
import { calendarDateInputConstraints, validateStartEndDateRange } from "@/lib/validation/date-range";

/** @param {any} procurement */
function savedBidDocument(procurement) {
  const sol = Array.isArray(procurement?.solicitations) ? procurement.solicitations[0] : null;
  return sol?.bidDocument ? { doc: sol.bidDocument, at: sol.bidDocumentAt || null } : null;
}

/**
 * @param {any} procurement
 * @returns {Record<string, string>}
 */
function initialForm(procurement) {
  if (!procurement) return {};
  const snap = savedBidDocument(procurement)?.doc || buildBidDocument(procurement, {});
  return {
    documentTitle: snap.documentTitle || "",
    procurementReference: snap.procurementReference || "",
    subject: snap.subject || "",
    specifications: snap.specifications || "",
    issueDate: snap.issueDate || "",
    closingDate: snap.closingDate || "",
    submissionInstructions: snap.submissionInstructions || "",
    evaluationCriteria: snap.evaluationCriteria || "",
  };
}

/**
 * @param {{ label: string; value?: string | null; full?: boolean; multiline?: boolean }} p
 */
function ReadField({ label, value, full, multiline }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 500, whiteSpace: multiline ? "pre-line" : undefined, wordBreak: "break-word" }}
      >
        {value ? value : "—"}
      </Typography>
    </div>
  );
}

/** Schedule of requirements — the requisition lines providers price against. @param {{ items: any[] }} p */
function RequirementsList({ items }) {
  if (!items.length) return null;
  return (
    <div className="sm:col-span-2">
      <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 0.5 }}>
        Schedule of requirements
      </Typography>
      <ol className="m-0 list-none space-y-1.5 p-0">
        {items.map((it, idx) => (
          <li key={it.id || idx} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="min-w-0 font-medium">
              {it.lineNumber || idx + 1}. {it.itemName}
              {it.description ? (
                <Typography component="span" variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                  {it.description}
                </Typography>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatMoneyAmount(it.quantity)}
              {it.unitOfMeasure ? ` ${it.unitOfMeasure}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * RFQ / tender document: inline form while preparing, read-only view afterwards.
 * The editable form exposes `validate()` and `save()` through `ref` so the task
 * card's submit button can save the document and submit the step in one go.
 *
 * @param {{
 *   projectId: string;
 *   procurement: any;
 *   organisation?: { name?: string | null } | null;
 *   issuer?: { name?: string | null; role?: string | null } | null;
 *   editable?: boolean;
 *   ref?: import("react").Ref<{ validate: () => boolean; save: () => Promise<boolean> }>;
 * }} p
 */
export function OrgBidDocumentSection({ projectId, procurement, organisation, issuer, editable = false, ref }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isTender = procurement?.procurementMethod === "TENDER";
  const heading = isTender ? "Tender document" : "Request for Quotations (RFQ) document";
  const saved = savedBidDocument(procurement);
  const reqItems = Array.isArray(procurement?.requisition?.items) ? procurement.requisition.items : [];
  const deliveryLocation = procurement?.requisition?.deliveryLocation || "";
  const approvedCost = isTender ? procurement?.requisition?.biddingDocumentCost || "" : "";
  const systemFields = {
    pdeName: organisation?.name || "",
    issuedByName: issuer?.name || "",
    issuedByPosition: issuer?.role || "",
  };
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [form, setForm] = useState(() => initialForm(procurement));
  const formKey = editable && procurement?.id ? `bid-document:${String(procurement.id)}` : "";

  const { serverSyncState, clearDraft } = usePersistedFormDraft({
    formKey,
    values: form,
    projectId,
    enabled: Boolean(editable && formKey),
    onHydrated: (payload) => {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        setForm((prev) => ({ ...prev, .../** @type {Record<string, string>} */ (payload) }));
      }
    },
  });

  /** @param {string} key @param {string} value */
  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => {
      if (!fe[key]) return fe;
      const n = { ...fe };
      delete n[key];
      return n;
    });
  }

  function collectErrors() {
    /** @type {Record<string, string>} */
    const errors = {};
    if (!String(form.subject || "").trim()) errors.subject = "Enter the subject of procurement.";
    if (!String(form.specifications || "").trim()) errors.specifications = "Enter specifications or scope.";
    if (!String(form.closingDate || "").trim()) errors.closingDate = "Enter the closing date.";
    const range = validateStartEndDateRange(form.issueDate, form.closingDate, { requireBoth: false });
    if (range.errors.endDate) errors.closingDate = "Closing date cannot be before the issue date.";
    return errors;
  }

  function validate() {
    const errors = collectErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return false;
    }
    return true;
  }

  async function save() {
    if (!validate()) return false;
    const res = await fetch(`/api/projects/${projectId}/procurements/${procurement.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_bid_document",
        bidDocument: { ...form, ...systemFields },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.fieldErrors && typeof data.fieldErrors === "object") setFieldErrors(data.fieldErrors);
      showToast({
        message: typeof data.error === "string" ? data.error : `Could not save the ${isTender ? "tender" : "RFQ"} document.`,
        severity: "error",
      });
      return false;
    }
    await clearDraft();
    return true;
  }

  useImperativeHandle(ref, () => ({ validate, save }));

  const hasEntry = editable && JSON.stringify(form) !== JSON.stringify(initialForm(procurement));

  async function discardChanges() {
    if (!(await confirm(discardConfirmOptions()))) return;
    await clearDraft();
    setForm(initialForm(procurement));
    setFieldErrors({});
  }

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <DescriptionRounded color="primary" fontSize="small" aria-hidden />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {heading}
        </Typography>
        {editable ? (
          <Typography variant="caption" sx={adminMutedTextSx}>
            {serverSyncState === "saving"
              ? "Saving draft…"
              : serverSyncState === "saved"
                ? "Draft saved"
                : serverSyncState === "error"
                  ? "Draft will retry"
                  : "Draft autosave on"}
          </Typography>
        ) : (
          <Chip
            size="small"
            color={saved ? "success" : "warning"}
            label={saved ? `Filled ${formatPrintDate(saved.at)}` : "Not filled"}
          />
        )}
      </div>
      {hasEntry ? (
        <Tooltip title="Discard changes">
          <IconButton size="small" color="error" aria-label="Discard changes" onClick={() => void discardChanges()}>
            <RestartAltRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </div>
  );

  if (!editable) {
    const doc = saved?.doc;
    const period = doc ? biddingPeriodDays(doc.issueDate, doc.closingDate) : null;
    const cleared = latestStepSignOff(procurement?.timeline, REVIEW_BID_DOCS_STEP_RE);
    const approved = latestStepSignOff(procurement?.timeline, APPROVE_BID_DOCS_STEP_RE);
    /** @param {{ by: string | null; at: string } | null} s */
    const signOff = (s) => (s ? `${s.by || "—"} · ${formatPrintDate(s.at)}` : null);
    return (
      <div className="rounded-lg border border-[color:var(--border-subtle)] p-3">
        {header}
        {doc ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadField label="Document title" value={doc.documentTitle} full />
            <ReadField label="Procuring and Disposing Entity (PDE)" value={doc.pdeName} />
            <ReadField label="Procurement reference" value={doc.procurementReference} />
            <ReadField label="Subject" value={doc.subject} full />
            <ReadField label="Specifications / scope" value={doc.specifications} full multiline />
            <RequirementsList items={reqItems} />
            <ReadField label="Delivery location" value={deliveryLocation} full />
            <ReadField label="Issue date" value={doc.issueDate ? formatPrintDate(doc.issueDate) : null} />
            <ReadField label="Closing date" value={doc.closingDate ? formatPrintDate(doc.closingDate) : null} />
            {period != null ? (
              <ReadField label="Bidding period" value={`${period} day${period === 1 ? "" : "s"}`} full />
            ) : null}
            {isTender && (doc.biddingDocumentCost || approvedCost) ? (
              <ReadField
                label="Bidding document fee"
                value={formatMoneyUGX(doc.biddingDocumentCost || approvedCost)}
                full
              />
            ) : null}
            <ReadField label="Submission instructions" value={doc.submissionInstructions} full multiline />
            <ReadField label="Evaluation criteria" value={doc.evaluationCriteria} full multiline />
            <ReadField
              label="Prepared by"
              value={[doc.issuedByName, doc.issuedByPosition].filter(Boolean).join(" · ") || null}
            />
            <ReadField label="Document filled" value={saved?.at ? formatPrintDate(saved.at) : null} />
            {cleared ? <ReadField label="Cleared by (Head PDU)" value={signOff(cleared)} /> : null}
            {approved ? <ReadField label="Approved by (Contracts Committee)" value={signOff(approved)} /> : null}
          </div>
        ) : null}
      </div>
    );
  }

  const dateBounds = calendarDateInputConstraints(form.issueDate, form.closingDate);

  return (
    <div className="rounded-lg border border-[color:var(--border-subtle)] p-3">
      {header}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Document title"
          value={form.documentTitle || ""}
          onChange={(e) => patch("documentTitle", e.target.value)}
          fullWidth
          className="sm:col-span-2"
          sx={themedTextFieldSx}
        />
        <TextField
          label="Procuring and Disposing Entity (PDE)"
          value={systemFields.pdeName}
          helperText="Auto-filled"
          slotProps={{ input: { readOnly: true } }}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Procurement reference"
          value={form.procurementReference || ""}
          onChange={(e) => patch("procurementReference", e.target.value)}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Subject"
          value={form.subject || ""}
          onChange={(e) => patch("subject", e.target.value)}
          fullWidth
          className="sm:col-span-2"
          error={Boolean(fieldErrors.subject)}
          helperText={fieldErrors.subject}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Specifications / scope"
          value={form.specifications || ""}
          onChange={(e) => patch("specifications", e.target.value)}
          fullWidth
          multiline
          minRows={4}
          className="sm:col-span-2"
          error={Boolean(fieldErrors.specifications)}
          helperText={fieldErrors.specifications}
          sx={themedTextFieldSx}
        />
        <RequirementsList items={reqItems} />
        <ReadField label="Delivery location" value={deliveryLocation} full />
        <TextField
          label="Issue date"
          type="date"
          value={form.issueDate || ""}
          onChange={(e) => patch("issueDate", e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dateBounds.startMax } }}
          sx={themedTextFieldSx}
        />
        <TextField
          label="Closing date"
          type="date"
          value={form.closingDate || ""}
          onChange={(e) => patch("closingDate", e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateBounds.endMin } }}
          error={Boolean(fieldErrors.closingDate)}
          helperText={fieldErrors.closingDate}
          sx={themedTextFieldSx}
        />
        {isTender ? (
          <TextField
            label="Bidding document fee"
            value={approvedCost ? formatMoneyUGX(approvedCost) : "None"}
            helperText="From Form 5 Part II"
            slotProps={{ input: { readOnly: true } }}
            fullWidth
            className="sm:col-span-2"
            sx={themedTextFieldSx}
          />
        ) : null}
        <TextField
          label="Submission instructions"
          value={form.submissionInstructions || ""}
          onChange={(e) => patch("submissionInstructions", e.target.value)}
          fullWidth
          multiline
          minRows={2}
          className="sm:col-span-2"
          sx={themedTextFieldSx}
        />
        <TextField
          label="Evaluation criteria"
          value={form.evaluationCriteria || ""}
          onChange={(e) => patch("evaluationCriteria", e.target.value)}
          fullWidth
          multiline
          minRows={2}
          className="sm:col-span-2"
          sx={themedTextFieldSx}
        />
        <TextField
          label="Issued by"
          value={systemFields.issuedByName}
          helperText="Auto-filled"
          slotProps={{ input: { readOnly: true } }}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Position"
          value={systemFields.issuedByPosition}
          helperText="Auto-filled"
          slotProps={{ input: { readOnly: true } }}
          fullWidth
          sx={themedTextFieldSx}
        />
      </div>
    </div>
  );
}
