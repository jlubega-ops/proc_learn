"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import NoteAddRounded from "@mui/icons-material/NoteAddRounded";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/providers/toast-provider";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { SubmissionSourceChip } from "@/components/projects/org-procurement-supply-cards";
import { OfferClarificationThread, OfferClarifyButton } from "@/components/projects/org-offer-clarification";
import { adminMutedTextSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import { OrgRecordOfferDialog } from "@/components/projects/org-record-offer-dialog";

const ALL = "__ALL__";

/** @param {unknown} value */
function shortDateTime(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(/** @type {any} */ (value));
  return isValid(d) ? format(d, "MMM d, yyyy h:mm a") : "—";
}

/**
 * @param {{ offer: any | null; noResponseAt: string | null }} p
 * @returns {{ color: "info" | "error" | "warning" | "success"; label: string }}
 */
function answerChip({ offer, noResponseAt }) {
  if (offer?.status === "LATE") return { color: "error", label: "Late — not accepted" };
  if (offer) return { color: "info", label: offer.status === "OPENED" ? "Opened" : "Received" };
  if (noResponseAt) return { color: "error", label: "No response" };
  return { color: "warning", label: "Awaiting" };
}

/**
 * Receive Quotations / Receive Bids: who answered, record a paper offer, generate
 * offers in each provider's character, and ask providers to clarify.
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   taskId: string;
 *   decision: string;
 *   clarifyAllowed: boolean;
 *   isTender: boolean;
 *   providerWord: string;
 *   providerWordPlural: string;
 *   offers: any[];
 *   quotePool: { accepting: boolean; providers: { id: string; name: string; noResponseAt: string | null }[] } | null;
 *   busy: boolean;
 *   setBusy: (b: boolean) => void;
 *   onChanged: () => Promise<void> | void;
 *   viewerRole?: string | null;
 * }} p
 */
export function OrgReceiveOffersPanel({
  projectId,
  procurementId,
  taskId,
  decision,
  clarifyAllowed,
  isTender,
  providerWord,
  providerWordPlural,
  offers,
  quotePool,
  busy,
  setBusy,
  onChanged,
  viewerRole = null,
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const word = isTender ? "bid" : "quotation";
  const Word = isTender ? "Bid" : "Quotation";

  const liveOffers = offers.filter((o) => o.status !== "WITHDRAWN");
  const offerBySupplier = new Map(liveOffers.map((o) => [o.supplierId, o]));
  const pool = quotePool?.providers || [];
  const rows = [
    ...pool.map((s) => ({ id: s.id, name: s.name, noResponseAt: s.noResponseAt })),
    ...liveOffers
      .filter((o) => !pool.some((s) => s.id === o.supplierId))
      .map((o) => ({ id: o.supplierId, name: o.supplier?.name || "—", noResponseAt: null })),
  ];
  const answered = (/** @type {{ id: string; noResponseAt: string | null }} */ r) =>
    offerBySupplier.has(r.id) || Boolean(r.noResponseAt);
  const remaining = rows.filter((r) => !answered(r));
  const accepting = Boolean(quotePool?.accepting);

  /** "" = default: all remaining providers while any are left. */
  const [target, setTarget] = useState("");
  /** @type {[{ id: string; name: string } | null, Function]} */
  const [recordFor, setRecordFor] = useState(null);
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});

  const chosen = target || ALL;
  const single = chosen !== ALL ? rows.find((r) => r.id === chosen) || null : null;
  const effectiveTarget = chosen === ALL && !remaining.length ? "" : chosen;
  const generateAll = effectiveTarget === ALL;

  /** @param {Record<string, any>} extra */
  async function post(extra) {
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, decision, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function generate() {
    if (!generateAll) return;
    const ok = await confirm(
      actionConfirmOptions(`Generate ${word}s`, {
        message: `Each remaining ${providerWord} answers in line with its profile. Existing ${word}s are kept.`,
      }),
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { ok: done, data } = await post({ generate: { supplierId: "ALL" } });
      if (!done) {
        showToast({ message: typeof data.error === "string" ? data.error : `Could not generate ${word}s.`, severity: "error" });
        return;
      }
      const parts = [];
      if (data.quoted?.length) parts.push(`${data.quoted.length} ${data.quoted.length === 1 ? word : `${word}s`} received`);
      if (data.late?.length) parts.push(`${data.late.length} late`);
      if (data.noResponse?.length) parts.push(`${data.noResponse.length} no response`);
      showToast({ message: `${parts.join(", ") || "Done"}.`, severity: "success" });
      setTarget("");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  function openRecord() {
    if (!single || answered(single)) {
      setErrors({ target: `Choose one ${providerWord}.` });
      return;
    }
    setRecordFor({ id: single.id, name: single.name });
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {Word}s received
        </Typography>
        <Chip
          size="small"
          color={remaining.length ? "warning" : "success"}
          label={`${rows.length - remaining.length} of ${rows.length} answered`}
        />
      </div>

      {rows.length ? (
        <ul className="divide-y divide-(--border-subtle) rounded-lg border border-(--border-subtle)">
          {rows.map((r) => {
            const offer = offerBySupplier.get(r.id) || null;
            const chip = answerChip({ offer, noResponseAt: r.noResponseAt });
            return (
              <li key={r.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold wrap-break-word">{r.name}</span>
                  {offer ? (
                    <>
                      <span className="font-semibold">{formatMoneyUGX(offer.amount)}</span>
                      {offer.deliveryDays ? <span className="opacity-80">· {offer.deliveryDays} days</span> : null}
                      <span className="text-xs opacity-70">· {shortDateTime(offer.submittedAt)}</span>
                      <SubmissionSourceChip source={offer.source} />
                    </>
                  ) : null}
                  <Chip size="small" color={chip.color} label={chip.label} />
                  {accepting && !answered(r) ? (
                    <Tooltip title={`Submit ${word} on behalf — study shortcut`}>
                      <span>
                        <IconButton
                          size="small"
                          color="warning"
                          aria-label={`Submit ${word} on behalf of ${r.name}`}
                          disabled={busy}
                          onClick={() => setRecordFor({ id: r.id, name: r.name })}
                        >
                          <NoteAddRounded fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : null}
                  {offer ? (
                    <OfferClarifyButton
                      projectId={projectId}
                      procurementId={procurementId}
                      offer={offer}
                      allowed={clarifyAllowed}
                      onChanged={onChanged}
                    />
                  ) : null}
                </div>
                {offer?.lineItems?.length ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-primary">Price breakdown</summary>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full min-w-[360px] border-collapse">
                        <tbody>
                          {offer.lineItems.map((l) => (
                            <tr key={l.lineNumber} className="border-b border-(--border-subtle)">
                              <td className="py-1 pr-2">{l.itemName}</td>
                              <td className="py-1 pr-2 text-right">
                                {l.quantity} {l.unitOfMeasure || ""} × {formatMoneyUGX(l.unitPrice)}
                              </td>
                              <td className="py-1 text-right font-medium">{formatMoneyUGX(l.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
                {offer?.remarks ? <p className="text-xs opacity-70 wrap-break-word">{offer.remarks}</p> : null}
                <OfferClarificationThread
                  clarifications={offer?.clarifications}
                  projectId={projectId}
                  procurementId={procurementId}
                  providerName={r.name}
                  viewerRole={viewerRole}
                  onChanged={onChanged}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <Typography variant="body2" sx={adminMutedTextSx}>
          No {providerWordPlural} on this {isTender ? "tender" : "RFQ"}.
        </Typography>
      )}

      {accepting ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            select
            label="Receive from"
            value={effectiveTarget || ""}
            onChange={(e) => {
              setTarget(e.target.value);
              setErrors({});
            }}
            error={Boolean(errors.target)}
            helperText={errors.target || (remaining.length ? " " : `Every ${providerWord} has answered.`)}
            disabled={busy || !remaining.length}
            fullWidth
            sx={themedTextFieldSx}
          >
            <MenuItem value={ALL} disabled={!remaining.length}>
              All remaining {providerWordPlural} ({remaining.length})
            </MenuItem>
            {rows.map((r) => (
              <MenuItem key={r.id} value={r.id} disabled={answered(r)}>
                {r.name}
                {offerBySupplier.has(r.id) ? " (answered)" : r.noResponseAt ? " (no response)" : ""}
              </MenuItem>
            ))}
          </TextField>
          <div className="flex items-start">
            <Tooltip
              title={
                !remaining.length
                  ? `Every ${providerWord} has answered`
                  : single
                    ? `Open a ${word} for ${single.name}, pre-filled from its profile`
                    : `Each remaining ${providerWord} answers in line with its profile`
              }
            >
              <span className="w-full sm:w-auto">
                <Button
                  variant="text"
                  color="warning"
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRounded />}
                  disabled={busy || !effectiveTarget || (single ? answered(single) : !generateAll)}
                  onClick={() => (single ? openRecord() : void generate())}
                  className="w-full normal-case sm:w-auto"
                  sx={{
                    mt: { sm: 0.25 },
                    fontWeight: 600,
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    "&:hover": { textDecoration: "underline" },
                  }}
                  title="Study shortcut — same effect as provider portal"
                >
                  {single ? `Submit on behalf (${single.name})` : "Submit on behalf (all remaining)"}
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>
      ) : (
        <Typography variant="caption" sx={adminMutedTextSx}>
          Closed for new {word}s.
        </Typography>
      )}

      <OrgRecordOfferDialog
        projectId={projectId}
        procurementId={procurementId}
        taskId={taskId}
        decision={decision}
        provider={recordFor}
        isTender={isTender}
        onClose={() => setRecordFor(null)}
        onSaved={async () => {
          setTarget("");
          await onChanged();
        }}
      />
    </div>
  );
}
