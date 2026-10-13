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
import SaveRounded from "@mui/icons-material/SaveRounded";
import { discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { adminDialogPaperSx, adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX, parseMoneyInput, validatePositiveMoney } from "@/lib/money";
import { draftLinesTotal } from "@/lib/projects/offer-line-items";

/**
 * Record a provider's quotation / bid, pre-filled in the provider's character.
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   taskId: string;
 *   decision: string;
 *   provider: { id: string; name: string } | null;
 *   isTender: boolean;
 *   onClose: () => void;
 *   onSaved: () => Promise<void> | void;
 * }} p
 */
export function OrgRecordOfferDialog({ projectId, procurementId, taskId, decision, provider, isTender, onClose, onSaved }) {
  const { showToast } = useToast();
  const word = isTender ? "bid" : "quotation";
  const Word = isTender ? "Bid" : "Quotation";

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  /** @type {[any[], Function]} */
  const [lines, setLines] = useState([]);
  /** @type {[Record<string, string>, Function]} */
  const [unitPrices, setUnitPrices] = useState({});
  const [amount, setAmount] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [remarks, setRemarks] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [loadedFor, setLoadedFor] = useState("");
  const confirm = useConfirm();

  const providerId = provider?.id || "";
  const offerDraft = useDraftSync(
    `org:procurement:${procurementId}:task:${taskId}:offer:${providerId}`,
    { unitPrices, amount, deliveryDays, remarks },
    (d) => {
      if (d.unitPrices && typeof d.unitPrices === "object") setUnitPrices(d.unitPrices);
      if (typeof d.amount === "string") setAmount(d.amount);
      if (typeof d.deliveryDays === "string") setDeliveryDays(d.deliveryDays);
      if (typeof d.remarks === "string") setRemarks(d.remarks);
    },
    { enabled: Boolean(providerId) && loadedFor === providerId && !loading },
  );

  async function handleCancel() {
    if (busy) return;
    if (offerDraft.isDirty && !(await confirm(discardConfirmOptions()))) return;
    offerDraft.clearDraft();
    onClose();
  }

  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    setLoading(true);
    setErrors({});
    fetch(
      `/api/projects/${projectId}/procurements/${procurementId}/quote-draft?supplierId=${encodeURIComponent(providerId)}`,
      { credentials: "include", cache: "no-store" },
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          showToast({ message: typeof data.error === "string" ? data.error : "Could not load the draft.", severity: "error" });
          return;
        }
        const d = data.draft || {};
        const draftLines = Array.isArray(d.lineItems) ? d.lineItems : [];
        setLines(draftLines);
        setUnitPrices(Object.fromEntries(draftLines.map((l) => [String(l.lineNumber), String(l.unitPrice ?? "")])));
        setAmount(d.amount ? String(d.amount) : "");
        setDeliveryDays(d.deliveryDays ? String(d.deliveryDays) : "");
        setRemarks(d.remarks || "");
        setLoadedFor(providerId);
      })
      .catch(() => {
        if (!cancelled) showToast({ message: "Could not load the draft.", severity: "error" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, procurementId, providerId, showToast]);

  const byLine = lines.length > 0;
  const total = byLine ? draftLinesTotal(lines, unitPrices) : Number(parseMoneyInput(amount)) || 0;

  /** @param {import("react").FormEvent} e */
  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    if (byLine) {
      for (const l of lines) {
        const err = validatePositiveMoney(unitPrices[String(l.lineNumber)] || "", "Unit price");
        if (err) next[`line_${l.lineNumber}`] = err;
      }
    } else {
      const err = validatePositiveMoney(amount, "Amount");
      if (err) next.amount = err;
    }
    if (deliveryDays.trim()) {
      const n = Number(deliveryDays);
      if (!Number.isInteger(n) || n < 1 || n > 730) next.deliveryDays = "Whole days, 1–730.";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          decision,
          finalize: false,
          offer: {
            supplierId: providerId,
            amount: byLine ? total : parseMoneyInput(amount),
            lineItems: byLine
              ? lines.map((l) => ({ lineNumber: l.lineNumber, unitPrice: parseMoneyInput(unitPrices[String(l.lineNumber)] || "") }))
              : null,
            deliveryDays: deliveryDays.trim() || null,
            remarks: remarks.trim() || null,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        showToast({ message: typeof data.error === "string" ? data.error : `Could not record the ${word}.`, severity: "error" });
        return;
      }
      showToast({ message: `${Word} recorded.`, severity: "success" });
      offerDraft.clearDraft();
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={Boolean(provider)}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <form noValidate onSubmit={submit}>
        <DialogTitle>
          Record {word}
          <Typography variant="body2" sx={adminMutedTextSx}>
            {provider?.name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 py-6" role="status" aria-busy="true">
              <CircularProgress size={20} />
              <Typography variant="body2">Loading {word}…</Typography>
            </div>
          ) : (
            <>
              {byLine ? (
                <div className="space-y-2">
                  {lines.map((l) => {
                    const key = String(l.lineNumber);
                    const err = errors[`line_${l.lineNumber}`];
                    const unit = Number(parseMoneyInput(unitPrices[key] || ""));
                    const qty = Number(l.quantity);
                    return (
                      <div
                        key={key}
                        className="grid grid-cols-1 items-start gap-2 rounded-lg border border-(--border-subtle) p-2 sm:grid-cols-[1fr_10rem]"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="font-semibold wrap-break-word">
                            {l.lineNumber}. {l.itemName}
                          </p>
                          <Typography variant="caption" sx={adminMutedTextSx}>
                            {qty} {l.unitOfMeasure || "units"}
                            {Number.isFinite(unit) && unit > 0 ? ` · ${formatMoneyUGX(unit * qty)}` : ""}
                          </Typography>
                        </div>
                        <TextField
                          label="Unit price (UGX)"
                          value={unitPrices[key] || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setUnitPrices((p) => ({ ...p, [key]: v }));
                            setErrors((p) => ({ ...p, [`line_${l.lineNumber}`]: "" }));
                          }}
                          error={Boolean(err)}
                          helperText={err || " "}
                          fullWidth
                          slotProps={{ htmlInput: { inputMode: "decimal" } }}
                          sx={themedTextFieldSx}
                        />
                      </div>
                    );
                  })}
                  <p className="text-right text-sm">
                    Total <span className="font-bold">{formatMoneyUGX(total)}</span>
                  </p>
                </div>
              ) : (
                <TextField
                  label="Total price (UGX)"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setErrors((p) => ({ ...p, amount: "" }));
                  }}
                  error={Boolean(errors.amount)}
                  helperText={errors.amount || " "}
                  fullWidth
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                  sx={themedTextFieldSx}
                />
              )}
              <TextField
                label="Delivery period (days)"
                value={deliveryDays}
                onChange={(e) => {
                  setDeliveryDays(e.target.value);
                  setErrors((p) => ({ ...p, deliveryDays: "" }));
                }}
                error={Boolean(errors.deliveryDays)}
                helperText={errors.deliveryDays || "Optional"}
                fullWidth
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
                sx={themedTextFieldSx}
              />
              <TextField
                label="Remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                helperText="Optional"
                fullWidth
                multiline
                minRows={2}
                sx={themedTextFieldSx}
              />
            </>
          )}
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || loading}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />}
          >
            {busy ? "Saving…" : `Record ${word}`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
