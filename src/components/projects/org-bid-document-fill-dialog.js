"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import { useToast } from "@/components/providers/toast-provider";
import { adminDialogPaperSx, adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";
import {
  buildBidDocument,
  buildOrgPdfContext,
  bidDocumentToPdfSpec,
  downloadOrgFormPdf,
} from "@/lib/projects/ppda-forms";

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   projectId: string;
 *   procurement: any;
 *   onSaved?: (solicitation: any) => void;
 * }} p
 */
export function OrgBidDocumentFillDialog({ open, onClose, projectId, procurement, onSaved }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [form, setForm] = useState(/** @type {Record<string, string>} */ ({}));
  const [baseReady, setBaseReady] = useState(false);
  const formKey =
    open && procurement?.id ? `bid-document:${String(procurement.id)}` : "";

  useEffect(() => {
    if (!open || !procurement) {
      setBaseReady(false);
      return;
    }
    const fromSolicitation =
      Array.isArray(procurement.solicitations) && procurement.solicitations[0]?.bidDocument
        ? procurement.solicitations[0].bidDocument
        : null;
    const snap = fromSolicitation || buildBidDocument(procurement, {});
    setForm({
      documentTitle: snap.documentTitle || "",
      pdeName: snap.pdeName || "",
      procurementReference: snap.procurementReference || "",
      subject: snap.subject || "",
      specifications: snap.specifications || "",
      closingDate: snap.closingDate || "",
      submissionInstructions: snap.submissionInstructions || "",
      evaluationCriteria: snap.evaluationCriteria || "",
      issuedByName: snap.issuedByName || "",
      issuedByPosition: snap.issuedByPosition || "Procurement Officer",
      issueDate: snap.issueDate || "",
    });
    setFieldErrors({});
    setBaseReady(true);
  }, [open, procurement]);

  const { serverSyncState, clearDraft } = usePersistedFormDraft({
    formKey,
    values: form,
    projectId,
    enabled: Boolean(open && formKey && baseReady),
    onHydrated: (payload) => {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        setForm((prev) => ({ ...prev, .../** @type {Record<string, string>} */ (payload) }));
      }
    },
  });

  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => {
      if (!fe[key]) return fe;
      const n = { ...fe };
      delete n[key];
      return n;
    });
  }

  function validateClient() {
    /** @type {Record<string, string>} */
    const errors = {};
    if (!String(form.subject || "").trim()) errors.subject = "Enter the subject of procurement.";
    if (!String(form.specifications || "").trim()) {
      errors.specifications = "Enter specifications or scope.";
    }
    if (!String(form.closingDate || "").trim()) {
      errors.closingDate = "Enter the closing date.";
    }
    if (!String(form.issuedByName || "").trim()) {
      errors.issuedByName = "Enter who issued the document.";
    }
    return errors;
  }

  async function save() {
    const errors = validateClient();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurements/${procurement.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_bid_document",
          bidDocument: form,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save bid document.",
          severity: "error",
        });
        return;
      }
      await clearDraft();
      showToast({ message: "Bid / RFQ document saved.", severity: "success" });
      onSaved?.(data.solicitation || null);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    const errors = validateClient();
    const incomplete = Object.keys(errors).length > 0;
    if (incomplete) setFieldErrors(errors);
    try {
      const snap = buildBidDocument(procurement, form);
      const ctx = buildOrgPdfContext(procurement, {
        referenceNumber: snap.procurementReference || procurement.procurementNumber || "",
      });
      await downloadOrgFormPdf(
        bidDocumentToPdfSpec(snap, ctx, { draftIncomplete: incomplete }),
      );
    } catch {
      showToast({ message: "Could not generate the PDF.", severity: "error" });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <DialogTitle>Fill educational bid / RFQ document</DialogTitle>
      <DialogContent className="pt-2">
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
          Minimal teaching RFQ/bid form. Progress autosaves across devices. Download a branded PDF
          at any time — named from the procurement reference.
        </Typography>
        <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block", mb: 2 }}>
          {serverSyncState === "saving"
            ? "Saving draft…"
            : serverSyncState === "saved"
              ? "Draft saved"
              : serverSyncState === "error"
                ? "Draft will retry as you continue"
                : "Draft autosave on"}
        </Typography>
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
            label="PDE / organisation name"
            value={form.pdeName || ""}
            onChange={(e) => patch("pdeName", e.target.value)}
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
          <TextField
            label="Closing date"
            type="date"
            value={form.closingDate || ""}
            onChange={(e) => patch("closingDate", e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            error={Boolean(fieldErrors.closingDate)}
            helperText={fieldErrors.closingDate}
            sx={themedTextFieldSx}
          />
          <TextField
            label="Issue date"
            type="date"
            value={form.issueDate || ""}
            onChange={(e) => patch("issueDate", e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={themedTextFieldSx}
          />
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
            label="Issued by (name)"
            value={form.issuedByName || ""}
            onChange={(e) => patch("issuedByName", e.target.value)}
            fullWidth
            error={Boolean(fieldErrors.issuedByName)}
            helperText={fieldErrors.issuedByName}
            sx={themedTextFieldSx}
          />
          <TextField
            label="Position"
            value={form.issuedByPosition || ""}
            onChange={(e) => patch("issuedByPosition", e.target.value)}
            fullWidth
            sx={themedTextFieldSx}
          />
        </div>
      </DialogContent>
      <DialogActions className="flex flex-wrap gap-2 px-3 pb-3">
        <Button
          type="button"
          variant="outlined"
          startIcon={<DownloadRounded />}
          onClick={() => void downloadPdf()}
          disabled={busy}
          title="Download bid / RFQ document as PDF"
        >
          Download PDF
        </Button>
        <div className="flex-1" />
        <Button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="contained"
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Save document"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
