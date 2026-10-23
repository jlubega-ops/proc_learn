"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useToast } from "@/components/providers/toast-provider";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { adminDialogPaperSx, adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { toDateInputValue } from "@/lib/financial-year-dates";

/**
 * Quiet study shortcut: accept or submit on behalf of a provider.
 * Never primary/contained — text button only; stage-gated by the parent.
 *
 * @param {{
 *   label: string;
 *   confirmLabel: string;
 *   action: string;
 *   projectId: string;
 *   procurementId: string;
 *   disabled?: boolean;
 *   busy?: boolean;
 *   onDone?: () => Promise<void> | void;
 *   formKind?: "accept" | "invoice" | "delivery" | "clarification" | "custom";
 *   providerName?: string;
 *   clarificationId?: string;
 *   deliveryLines?: { itemName: string; outstanding: number; unitOfMeasure?: string | null }[];
 *   defaultAmount?: string | number;
 *   runLifecycle?: (action: string, body?: Record<string, any>, successMessage?: string) => Promise<boolean>;
 *   children?: import("react").ReactNode;
 * }} p
 */
export function OrgOnBehalfProviderAction({
  label,
  confirmLabel,
  action,
  projectId,
  procurementId,
  disabled = false,
  busy: busyProp = false,
  onDone,
  formKind = "accept",
  providerName = "provider",
  clarificationId,
  deliveryLines = [],
  defaultAmount = "",
  runLifecycle,
  children,
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));

  const [acceptedByName, setAcceptedByName] = useState("");
  const [response, setResponse] = useState("");
  const [amount, setAmount] = useState(String(defaultAmount || ""));
  const [invoiceDate, setInvoiceDate] = useState(toDateInputValue(new Date()));
  const [supplierReference, setSupplierReference] = useState("");
  const [notes, setNotes] = useState("");
  const [dispatchedAt, setDispatchedAt] = useState(toDateInputValue(new Date()));
  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lineQty, setLineQty] = useState(/** @type {Record<string, string>} */ ({}));

  const working = busy || busyProp;

  /** Prefill qty with outstanding (same as provider portal); officer can still edit. */
  function defaultLineQty() {
    /** @type {Record<string, string>} */
    const next = {};
    for (const l of deliveryLines) {
      const n = Number(l.outstanding);
      if (Number.isFinite(n) && n > 0) next[l.itemName] = String(n);
    }
    return next;
  }

  function resetForm() {
    setErrors({});
    setAcceptedByName("");
    setResponse("");
    setAmount(String(defaultAmount || ""));
    setInvoiceDate(toDateInputValue(new Date()));
    setSupplierReference("");
    setNotes("");
    setDispatchedAt(toDateInputValue(new Date()));
    setDeliveredBy("");
    setVehicleNumber("");
    setRemarks("");
    setLineQty(formKind === "delivery" ? defaultLineQty() : {});
  }

  function validate() {
    /** @type {Record<string, string>} */
    const next = {};
    if (formKind === "accept") {
      if (!acceptedByName.trim()) next.acceptedByName = "Enter the name.";
    } else if (formKind === "clarification") {
      if (response.trim().length < 2) next.response = "Enter the answer.";
    } else if (formKind === "invoice") {
      const n = Number(String(amount).replace(/,/g, "").trim());
      if (!Number.isFinite(n) || n <= 0) next.amount = "Enter a valid amount.";
      if (!invoiceDate.trim()) next.invoiceDate = "Enter the date.";
    } else if (formKind === "delivery") {
      if (!deliveredBy.trim()) next.deliveredBy = "Enter who is delivering.";
      if (!dispatchedAt.trim()) next.dispatchedAt = "Enter the date.";
      const lines = deliveryLines
        .map((l) => ({ itemName: l.itemName, quantity: lineQty[l.itemName] || "" }))
        .filter((l) => String(l.quantity).trim());
      if (!lines.length) next.lines = "Enter at least one quantity.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function buildBody() {
    if (formKind === "accept") return { acceptedByName: acceptedByName.trim() };
    if (formKind === "clarification") {
      return { clarificationId, response: response.trim() };
    }
    if (formKind === "invoice") {
      return {
        amount: amount.trim(),
        invoiceDate,
        supplierReference: supplierReference.trim() || null,
        notes: notes.trim() || null,
      };
    }
    if (formKind === "delivery") {
      return {
        dispatchedAt,
        deliveredBy: deliveredBy.trim(),
        vehicleNumber: vehicleNumber.trim() || null,
        remarks: remarks.trim() || null,
        lines: deliveryLines
          .map((l) => ({
            itemName: l.itemName,
            quantity: lineQty[l.itemName] || "",
            unitOfMeasure: l.unitOfMeasure || null,
          }))
          .filter((l) => String(l.quantity).trim()),
      };
    }
    return {};
  }

  async function submit() {
    if (!validate()) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    const ok = await confirm(
      actionConfirmOptions(confirmLabel, {
        message: `Same effect as the provider portal for ${providerName}. Marked Generated.`,
        color: "warning",
      }),
    );
    if (!ok) return;

    setBusy(true);
    try {
      const body = buildBody();
      let done = false;
      if (typeof runLifecycle === "function") {
        done = await runLifecycle(action, body, `${label} done.`);
      } else {
        const res = await fetch(`/api/projects/${projectId}/procurements/${procurementId}/lifecycle`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.fieldErrors) setErrors(data.fieldErrors);
          showToast({
            message: typeof data.error === "string" ? data.error : "Could not complete.",
            severity: "error",
          });
          return;
        }
        showToast({ message: `${label} done.`, severity: "success" });
        done = true;
      }
      if (done) {
        resetForm();
        setOpen(false);
        await onDone?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tooltip title="Study shortcut — same effect as provider portal">
        <span>
          <Button
            size="small"
            variant="text"
            color="warning"
            disabled={disabled || working}
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
            className="normal-case"
            sx={{
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {label}
          </Button>
        </span>
      </Tooltip>

      <Dialog
        open={open}
        onClose={working ? undefined : () => setOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <DialogTitle>{label}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ ...adminMutedTextSx, mb: 2 }}>
            For {providerName}. Marked Generated.
          </Typography>
          {formKind === "accept" ? (
            <TextField
              label="Accepted by"
              value={acceptedByName}
              onChange={(e) => setAcceptedByName(e.target.value)}
              error={Boolean(errors.acceptedByName)}
              helperText={errors.acceptedByName || " "}
              fullWidth
              autoFocus
              sx={themedTextFieldSx}
            />
          ) : null}
          {formKind === "clarification" ? (
            <TextField
              label="Answer"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              error={Boolean(errors.response)}
              helperText={errors.response || " "}
              fullWidth
              multiline
              minRows={3}
              autoFocus
              sx={themedTextFieldSx}
            />
          ) : null}
          {formKind === "invoice" ? (
            <div className="grid gap-2">
              <TextField
                label="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={Boolean(errors.amount)}
                helperText={errors.amount || " "}
                fullWidth
                autoFocus
                sx={themedTextFieldSx}
              />
              <TextField
                label="Invoice date"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                error={Boolean(errors.invoiceDate)}
                helperText={errors.invoiceDate || " "}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Supplier reference"
                value={supplierReference}
                onChange={(e) => setSupplierReference(e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                sx={themedTextFieldSx}
              />
            </div>
          ) : null}
          {formKind === "delivery" ? (
            <div className="grid gap-2">
              <TextField
                label="Dispatch date"
                type="date"
                value={dispatchedAt}
                onChange={(e) => setDispatchedAt(e.target.value)}
                error={Boolean(errors.dispatchedAt)}
                helperText={errors.dispatchedAt || " "}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Delivered by"
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                error={Boolean(errors.deliveredBy)}
                helperText={errors.deliveredBy || " "}
                fullWidth
                autoFocus
                sx={themedTextFieldSx}
              />
              <TextField
                label="Vehicle number"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                fullWidth
                sx={themedTextFieldSx}
              />
              <TextField
                label="Remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                sx={themedTextFieldSx}
              />
              {errors.lines ? (
                <Typography variant="caption" color="error" role="alert">
                  {errors.lines}
                </Typography>
              ) : null}
              <ul className="space-y-2">
                {deliveryLines.map((l) => (
                  <li key={l.itemName} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 wrap-break-word">
                      {l.itemName}
                      <span className="opacity-70">
                        {" "}
                        (max {l.outstanding}
                        {l.unitOfMeasure ? ` ${l.unitOfMeasure}` : ""})
                      </span>
                    </span>
                    <TextField
                      label="Qty"
                      value={lineQty[l.itemName] || ""}
                      onChange={(e) => setLineQty((prev) => ({ ...prev, [l.itemName]: e.target.value }))}
                      sx={{ ...themedTextFieldSx, width: 100 }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {children}
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={() => setOpen(false)} disabled={working}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            disabled={working}
            startIcon={working ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={() => void submit()}
          >
            {working ? "Saving…" : "Continue"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * Multi-provider picker for 1 / selected / all awaiting (quotes etc.).
 * @param {{
 *   providers: { id: string; name: string }[];
 *   value: string[];
 *   onChange: (ids: string[]) => void;
 *   disabled?: boolean;
 * }} p
 */
export function OrgOnBehalfProviderPicker({ providers, value, onChange, disabled = false }) {
  const allIds = providers.map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => value.includes(id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="text"
          disabled={disabled || !providers.length}
          onClick={() => onChange(allIds)}
          sx={{ color: "text.secondary" }}
        >
          All ({providers.length})
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={disabled || !value.length}
          onClick={() => onChange([])}
          sx={{ color: "text.secondary" }}
        >
          Clear
        </Button>
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-(--border-subtle) p-2">
        {providers.map((p) => (
          <li key={p.id}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={value.includes(p.id)}
                  disabled={disabled}
                  onChange={() =>
                    onChange(
                      value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id],
                    )
                  }
                />
              }
              label={<span className="text-sm wrap-break-word">{p.name}</span>}
            />
          </li>
        ))}
      </ul>
      {allSelected ? (
        <Typography variant="caption" sx={adminMutedTextSx}>
          All selected.
        </Typography>
      ) : null}
    </div>
  );
}
