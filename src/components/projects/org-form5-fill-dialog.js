"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import { useToast } from "@/components/providers/toast-provider";
import { adminDialogPaperSx, adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { usePersistedFormDraft } from "@/hooks/use-persisted-form-draft";
import {
  PPDA_PLAN_METHOD_OPTIONS,
  PPDA_YES_NO,
  buildForm5PartI,
  buildForm5PartII,
  downloadPdfReference,
  form5PartIToHtml,
  form5PartIIToHtml,
} from "@/lib/projects/ppda-forms";

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   projectId: string;
 *   requisition: any;
 *   part: "I" | "II";
 *   onSaved?: (requisition: any) => void;
 * }} p
 */
export function OrgForm5FillDialog({ open, onClose, projectId, requisition, part, onSaved }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [form, setForm] = useState(/** @type {Record<string, string>} */ ({}));
  const [baseReady, setBaseReady] = useState(false);
  const formKey =
    open && requisition?.id ? `form5:${part}:${String(requisition.id)}` : "";

  useEffect(() => {
    if (!open || !requisition) {
      setBaseReady(false);
      return;
    }
    if (part === "I") {
      const snap = requisition.form5PartI || buildForm5PartI(requisition, {});
      setForm({
        pdeCode: snap.pdeCode || "",
        categorySuppliesWorksServices: snap.categorySuppliesWorksServices || "Supplies",
        financialYearLabel: snap.financialYearLabel || "",
        sequenceNumber: snap.sequenceNumber || "",
        budgetCategory: snap.budgetCategory || "Recurrent",
        projectCode: snap.projectCode || "",
        projectTitle: snap.projectTitle || "",
        multiYearContracting: snap.multiYearContracting || "No",
        resourcesYearOne: snap.resourcesYearOne || "",
        resourcesYearTwo: snap.resourcesYearTwo || "",
        resourcesYearThree: snap.resourcesYearThree || "",
        resourcesYearFour: snap.resourcesYearFour || "",
        subjectOfProcurement: snap.subjectOfProcurement || "",
        procurementPlanReference: snap.procurementPlanReference || "",
        locationForDelivery: snap.locationForDelivery || "",
        dateRequired: snap.dateRequired || "",
        currency: snap.currency || "UGX",
        marketPrice: snap.marketPrice || "",
        estimatedTotalCost: snap.estimatedTotalCost || "",
        voteHeadNo: snap.voteHeadNo || "",
        programme: snap.programme || "",
        subProgramme: snap.subProgramme || "",
        fundingItem: snap.fundingItem || "",
        balanceRemaining: snap.balanceRemaining || "",
        memberName: snap.memberName || "",
        memberTitle: snap.memberTitle || "",
        hodName: snap.hodName || "",
        hodTitle: snap.hodTitle || "",
        aoName: snap.aoName || "",
        aoTitle: snap.aoTitle || "Accounting Officer",
      });
    } else {
      const snap =
        requisition.form5PartII ||
        buildForm5PartII({}, { method: requisition.procurementMethod || null });
      setForm({
        dateSubmittedToCc: snap.dateSubmittedToCc || "",
        ccMeetingReference: snap.ccMeetingReference || "",
        recommendedMethod: snap.recommendedMethod || "",
        methodJustification: snap.methodJustification || "",
        shortlistedProviders: snap.shortlistedProviders || "",
        shortlistJustification: snap.shortlistJustification || "",
        biddingDocumentPreparers: snap.biddingDocumentPreparers || "",
        evaluationCommitteeNominees: snap.evaluationCommitteeNominees || "",
        evaluationCommitteeJustification: snap.evaluationCommitteeJustification || "",
        biddingDocumentCost: snap.biddingDocumentCost || "",
        otherInformation: snap.otherInformation || "",
        pduOfficerName: snap.pduOfficerName || "",
        pduOfficerPosition: snap.pduOfficerPosition || "Procurement Officer",
        ccChairName: snap.ccChairName || "",
        ccSecretaryName: snap.ccSecretaryName || "",
      });
    }
    setFieldErrors({});
    setBaseReady(true);
  }, [open, requisition, part]);

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
    if (part === "I") {
      if (!String(form.subjectOfProcurement || "").trim()) {
        errors.subjectOfProcurement = "Enter the subject of procurement.";
      }
      if (!String(form.locationForDelivery || "").trim()) {
        errors.locationForDelivery = "Enter the delivery location.";
      }
      if (!String(form.estimatedTotalCost || "").trim()) {
        errors.estimatedTotalCost = "Enter the estimated total cost.";
      }
      if (!String(form.memberName || "").trim()) {
        errors.memberName = "Enter the user-department member name.";
      }
    } else {
      if (!String(form.recommendedMethod || "").trim()) {
        errors.recommendedMethod = "Enter the recommended procurement method.";
      }
      if (!String(form.methodJustification || "").trim()) {
        errors.methodJustification = "Enter the justification for the method.";
      }
      if (!String(form.pduOfficerName || "").trim()) {
        errors.pduOfficerName = "Enter the PDU officer name.";
      }
    }
    return errors;
  }

  const canDownloadPdf = useMemo(
    () => Object.keys(validateClient()).length === 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validate from current form/part
    [form, part],
  );

  async function save() {
    const errors = validateClient();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/requisitions/${requisition.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: part === "I" ? "save_form5_part_i" : "save_form5_part_ii",
          form5: form,
          procurementMethod: requisition.procurementMethod || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(data.fieldErrors);
        }
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save Form 5.",
          severity: "error",
        });
        return;
      }
      await clearDraft();
      showToast({
        message: part === "I" ? "Form 5 Part I saved." : "Form 5 Part II saved.",
        severity: "success",
      });
      onSaved?.(data.requisition || null);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    const errors = validateClient();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      showToast({
        message: "Complete all required fields before downloading the PDF.",
        severity: "error",
      });
      return;
    }
    try {
      if (part === "I") {
        const snap = buildForm5PartI(requisition, form);
        await downloadPdfReference(
          `form5-part-i-${requisition.requisitionReference || requisition.id}`,
          "FORM 5 — Part I",
          form5PartIToHtml(snap),
        );
      } else {
        const snap = buildForm5PartII(form, { method: requisition.procurementMethod });
        await downloadPdfReference(
          `form5-part-ii-${requisition.requisitionReference || requisition.id}`,
          "FORM 5 — Part II",
          form5PartIIToHtml(snap),
        );
      }
    } catch {
      showToast({ message: "Could not generate the PDF.", severity: "error" });
    }
  }

  const title = part === "I" ? "Fill Form 5 — Part I" : "Fill Form 5 — Part II";

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent className="pt-2">
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 1 }}>
          Teaching Form 5 (PPDA). Progress autosaves to your account so you can continue on another
          device. PDF download unlocks when required fields are complete.
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
          {part === "I" ? (
            <>
              <TextField
                label="Subject of procurement"
                value={form.subjectOfProcurement || ""}
                onChange={(e) => patch("subjectOfProcurement", e.target.value)}
                fullWidth
                className="sm:col-span-2"
                error={Boolean(fieldErrors.subjectOfProcurement)}
                helperText={fieldErrors.subjectOfProcurement}
                sx={themedTextFieldSx}
              />
              <TextField
                label="PDE code"
                value={form.pdeCode || ""}
                onChange={(e) => patch("pdeCode", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Category (supplies / works / services)"
                value={form.categorySuppliesWorksServices || ""}
                onChange={(e) => patch("categorySuppliesWorksServices", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Financial year"
                value={form.financialYearLabel || ""}
                onChange={(e) => patch("financialYearLabel", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Sequence / requisition ref"
                value={form.sequenceNumber || ""}
                onChange={(e) => patch("sequenceNumber", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Budget category"
                value={form.budgetCategory || ""}
                onChange={(e) => patch("budgetCategory", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                select
                label="Multi-year contracting"
                value={form.multiYearContracting || "No"}
                onChange={(e) => patch("multiYearContracting", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              >
                {PPDA_YES_NO.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Plan reference"
                value={form.procurementPlanReference || ""}
                onChange={(e) => patch("procurementPlanReference", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Date required"
                type="date"
                value={form.dateRequired || ""}
                onChange={(e) => patch("dateRequired", e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Location for delivery"
                value={form.locationForDelivery || ""}
                onChange={(e) => patch("locationForDelivery", e.target.value)}
                fullWidth
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />
              <TextField
                label="Currency"
                value={form.currency || "UGX"}
                onChange={(e) => patch("currency", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Estimated total cost"
                value={form.estimatedTotalCost || ""}
                onChange={(e) => patch("estimatedTotalCost", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Market price"
                value={form.marketPrice || ""}
                onChange={(e) => patch("marketPrice", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Vote / head no."
                value={form.voteHeadNo || ""}
                onChange={(e) => patch("voteHeadNo", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Programme"
                value={form.programme || ""}
                onChange={(e) => patch("programme", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Sub-programme"
                value={form.subProgramme || ""}
                onChange={(e) => patch("subProgramme", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Funding item"
                value={form.fundingItem || ""}
                onChange={(e) => patch("fundingItem", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Balance remaining"
                value={form.balanceRemaining || ""}
                onChange={(e) => patch("balanceRemaining", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Member (User Department)"
                value={form.memberName || ""}
                onChange={(e) => patch("memberName", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Member title"
                value={form.memberTitle || ""}
                onChange={(e) => patch("memberTitle", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Head of User Department"
                value={form.hodName || ""}
                onChange={(e) => patch("hodName", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="HOD title"
                value={form.hodTitle || ""}
                onChange={(e) => patch("hodTitle", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Accounting Officer"
                value={form.aoName || ""}
                onChange={(e) => patch("aoName", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="AO title"
                value={form.aoTitle || ""}
                onChange={(e) => patch("aoTitle", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
            </>
          ) : (
            <>
              <TextField
                select
                label="Recommended method"
                value={form.recommendedMethod || ""}
                onChange={(e) => patch("recommendedMethod", e.target.value)}
                fullWidth
                className="sm:col-span-2"
                error={Boolean(fieldErrors.recommendedMethod)}
                helperText={
                  fieldErrors.recommendedMethod ||
                  "Teaching note: the simulator still uses Select method on the task; this records Form 5 Part II."
                }
                sx={themedTextFieldSx}
              >
                <MenuItem value="">Select…</MenuItem>
                {PPDA_PLAN_METHOD_OPTIONS.map((v) => (
                  <MenuItem key={v} value={v}>
                    {v}
                  </MenuItem>
                ))}
                <MenuItem value="MICRO">Micro (simulator)</MenuItem>
                <MenuItem value="QUOTATION">Quotation (simulator)</MenuItem>
                <MenuItem value="TENDER">Tender (simulator)</MenuItem>
              </TextField>
              <TextField
                label="Method justification"
                value={form.methodJustification || ""}
                onChange={(e) => patch("methodJustification", e.target.value)}
                fullWidth
                multiline
                minRows={2}
                className="sm:col-span-2"
                error={Boolean(fieldErrors.methodJustification)}
                helperText={fieldErrors.methodJustification}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Date submitted to CC"
                type="date"
                value={form.dateSubmittedToCc || ""}
                onChange={(e) => patch("dateSubmittedToCc", e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={themedTextFieldSx}
              />
              <TextField
                label="CC meeting reference"
                value={form.ccMeetingReference || ""}
                onChange={(e) => patch("ccMeetingReference", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Shortlisted providers"
                value={form.shortlistedProviders || ""}
                onChange={(e) => patch("shortlistedProviders", e.target.value)}
                fullWidth
                multiline
                minRows={2}
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />
              <TextField
                label="Shortlist justification"
                value={form.shortlistJustification || ""}
                onChange={(e) => patch("shortlistJustification", e.target.value)}
                fullWidth
                multiline
                minRows={2}
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />
              <TextField
                label="Bidding document preparers"
                value={form.biddingDocumentPreparers || ""}
                onChange={(e) => patch("biddingDocumentPreparers", e.target.value)}
                fullWidth
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />
              <TextField
                label="Evaluation committee nominees"
                value={form.evaluationCommitteeNominees || ""}
                onChange={(e) => patch("evaluationCommitteeNominees", e.target.value)}
                fullWidth
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />
              <TextField
                label="EC justification"
                value={form.evaluationCommitteeJustification || ""}
                onChange={(e) => patch("evaluationCommitteeJustification", e.target.value)}
                fullWidth
                multiline
                minRows={2}
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />
              <TextField
                label="Bidding document cost"
                value={form.biddingDocumentCost || ""}
                onChange={(e) => patch("biddingDocumentCost", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Other information"
                value={form.otherInformation || ""}
                onChange={(e) => patch("otherInformation", e.target.value)}
                fullWidth
                multiline
                minRows={2}
                className="sm:col-span-2"
                sx={themedTextFieldSx}
              />
              <TextField
                label="PDU officer"
                value={form.pduOfficerName || ""}
                onChange={(e) => patch("pduOfficerName", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="PDU position"
                value={form.pduOfficerPosition || ""}
                onChange={(e) => patch("pduOfficerPosition", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="CC Chair"
                value={form.ccChairName || ""}
                onChange={(e) => patch("ccChairName", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="CC Secretary"
                value={form.ccSecretaryName || ""}
                onChange={(e) => patch("ccSecretaryName", e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
            </>
          )}
        </div>
      </DialogContent>
      <DialogActions className="flex flex-wrap gap-2 px-3 pb-3">
        <Button
          type="button"
          variant="outlined"
          startIcon={<DownloadRounded />}
          onClick={() => void downloadPdf()}
          disabled={busy || !canDownloadPdf}
          title={
            canDownloadPdf
              ? "Download completed form as PDF"
              : "Fill all required fields to enable PDF download"
          }
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
          {busy ? "Saving…" : "Save Form 5"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
