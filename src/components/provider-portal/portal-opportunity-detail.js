"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import AssignmentRounded from "@mui/icons-material/AssignmentRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
import { useToast } from "@/components/providers/toast-provider";
import { actionConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { PrintButton } from "@/components/print/print-document";
import { WorkflowHistoryPanel } from "@/components/projects/workflow-history-panel";
import { PORTAL_NOTIFICATIONS_CHANGED } from "@/components/provider-portal/provider-portal-shell";
import {
  OFFER_STATUS,
  OfferForm,
  StatusChip,
  opportunityStateChip,
} from "@/components/provider-portal/provider-portal-sections";
import { PortalOpportunityPrint } from "@/components/provider-portal/portal-opportunity-print";
import { formatPortalDate, formatPortalDateTime, portalFetch } from "@/components/provider-portal/portal-fetch";
import { formatMoneyUGX } from "@/lib/money";
import { BRAND_CARD_CLASS } from "@/lib/brand-ui";

function notifyPortal() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PORTAL_NOTIFICATIONS_CHANGED));
}

/** @param {{ title: string; children: import("react").ReactNode; action?: import("react").ReactNode }} p */
function Card({ title, children, action = null }) {
  return (
    <section className={`${BRAND_CARD_CLASS} p-4`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** @param {{ label: string; value?: import("react").ReactNode; full?: boolean }} p */
function ReadField({ label, value, full = false }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm wrap-break-word">{value || "—"}</dd>
    </div>
  );
}

/** @param {{ lines?: any[]; total: unknown }} p */
function OfferLinesTable({ lines, total }) {
  if (!lines?.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Unit price</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineNumber} className="border-b border-zinc-100">
              <td className="py-2 pr-2">
                {l.lineNumber}. {l.itemName}
              </td>
              <td className="py-2 pr-2 text-right">
                {l.quantity} {l.unitOfMeasure || ""}
              </td>
              <td className="py-2 pr-2 text-right">{formatMoneyUGX(l.unitPrice)}</td>
              <td className="py-2 text-right">{formatMoneyUGX(l.total)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="py-2 pr-2 text-right font-semibold">
              Total
            </td>
            <td className="py-2 text-right font-bold">{formatMoneyUGX(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** @param {{ clarification: any; canAnswer: boolean; onAnswered: () => void }} p */
function ClarificationItem({ clarification: c, canAnswer, onAnswered }) {
  const { showToast } = useToast();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const trimmed = answer.trim();
    const msg = trimmed.length < 2 ? "Enter your answer." : trimmed.length > 2000 ? "Too long." : "";
    setError(msg);
    if (msg) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await portalFetch(`/api/provider-portal/clarifications/${c.id}`, {
        method: "POST",
        body: JSON.stringify({ response: trimmed }),
      });
      if (!ok) {
        if (data.fieldErrors?.response) setError(data.fieldErrors.response);
        showToast({ message: typeof data.error === "string" ? data.error : "Could not send the answer.", severity: "error" });
        return;
      }
      showToast({ message: "Answer sent.", severity: "success" });
      setAnswer("");
      notifyPortal();
      onAnswered();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-zinc-200 p-3 text-sm">
      <p className="text-xs text-zinc-500">
        {c.askedByName || "Procurement unit"}
        {c.askedByRole ? ` · ${c.askedByRole}` : ""} · {formatPortalDateTime(c.askedAt)}
      </p>
      <p className="mt-1 whitespace-pre-wrap wrap-break-word">{c.question}</p>
      {c.respondedAt ? (
        <div className="mt-2 border-l-4 border-primary/40 pl-3">
          <p className="text-xs text-zinc-500">Your answer · {formatPortalDateTime(c.respondedAt)}</p>
          <p className="whitespace-pre-wrap wrap-break-word">{c.response}</p>
        </div>
      ) : !canAnswer ? (
        <p className="mt-2 text-xs text-zinc-500">Not answered.</p>
      ) : (
        <form noValidate onSubmit={submit} className="mt-2 space-y-2">
          <TextField
            label="Your answer"
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              if (error) setError("");
            }}
            error={Boolean(error)}
            helperText={error || " "}
            fullWidth
            multiline
            minRows={2}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
              className="w-full sm:w-auto"
            >
              {busy ? "Sending…" : "Send answer"}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

/** @param {{ solicitationId: string }} p */
export function PortalOpportunityDetail({ solicitationId }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(/** @type {any} */ (null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void portalFetch(`/api/provider-portal/opportunities/${solicitationId}`).then(({ ok, data: body }) => {
      if (cancelled) return;
      setLoading(false);
      if (ok) {
        setData(body);
        setError("");
      } else setError(typeof body.error === "string" ? body.error : "Could not load this opportunity.");
    });
    return () => {
      cancelled = true;
    };
  }, [solicitationId, reloadKey]);

  const word = data?.type === "RFQ" ? "quotation" : "bid";

  async function withdraw() {
    if (!data?.myOffer) return;
    const confirmed = await confirm(
      actionConfirmOptions(`Withdraw ${word}`, {
        color: "error",
        message: "It will no longer be considered. You can submit a new one before the closing date.",
      }),
    );
    if (!confirmed) return;
    setWithdrawing(true);
    try {
      const { ok, data: body } = await portalFetch(`/api/provider-portal/offers/${data.myOffer.id}`, {
        method: "DELETE",
      });
      if (!ok) {
        showToast({ message: typeof body.error === "string" ? body.error : "Could not withdraw.", severity: "error" });
        reload();
        return;
      }
      showToast({ message: `Your ${word} was withdrawn.`, severity: "success" });
      notifyPortal();
      reload();
    } finally {
      setWithdrawing(false);
    }
  }

  const backRow = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button component={Link} href="/provider-portal/opportunities" startIcon={<ArrowBackRounded />}>
        Back to opportunities
      </Button>
      <div className="flex flex-wrap gap-2">
        {data ? <PrintButton fileName={`${data.type === "RFQ" ? "RFQ" : "Tender"} ${data.document.reference}`} /> : null}
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshRounded />}
          onClick={() => {
            setLoading(true);
            reload();
          }}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {backRow}
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <div className="flex items-center gap-2 py-8 text-sm text-zinc-600" role="status" aria-busy>
            <CircularProgress size={18} /> Loading…
          </div>
        )}
      </div>
    );
  }

  const { procurement, document: doc, myOffer } = data;
  const state = opportunityStateChip(data);
  const activeOffer = myOffer && myOffer.status !== "WITHDRAWN" ? myOffer : null;
  const pastOffers = (data.offers || []).filter((o) => o.id !== activeOffer?.id);
  const showForm = Boolean(data.canSubmit) || (Boolean(data.canEdit) && editing);

  return (
    <div className="space-y-4">
      {backRow}

      <section className={`${BRAND_CARD_CLASS} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {data.type === "RFQ" ? "Request for quotation" : "Open tender"} · {procurement.number}
            </p>
            <h2 className="text-lg font-bold wrap-break-word">{procurement.title || data.title}</h2>
            <p className="text-xs text-zinc-600 wrap-break-word">
              {doc.pdeName || data.organisation?.name}
              {procurement.deliveryLocation ? ` · Deliver to ${procurement.deliveryLocation}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip color={/** @type {any} */ (state.color)} label={state.label} />
            {myOffer ? <StatusChip map={OFFER_STATUS} status={myOffer.status} /> : null}
          </div>
        </div>
        {data.revising ? (
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            Clarification requested. You can revise your {word} until evaluation starts.
          </Alert>
        ) : null}
        {data.outcome ? (
          <Alert
            severity={data.outcome.color}
            variant="outlined"
            sx={{ mt: 2 }}
            action={
              ["awarded", "completed"].includes(data.outcome.key) ? (
                <Button
                  component={Link}
                  href={`/provider-portal/assignments/${procurement.id}`}
                  size="small"
                  startIcon={<AssignmentRounded />}
                >
                  Open assignment
                </Button>
              ) : null
            }
          >
            {data.outcome.message}
          </Alert>
        ) : activeOffer && data.lockedReason ? (
          <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
            {data.lockedReason} Your {word} can no longer be changed.
          </Alert>
        ) : null}
      </section>

      <Card title={doc.documentTitle || (data.type === "RFQ" ? "Request for quotations" : "Bidding document")}>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadField label="Procuring and Disposing Entity (PDE)" value={doc.pdeName} full />
          <ReadField label="Procurement reference" value={doc.reference} />
          <ReadField label="Category" value={procurement.category} />
          <ReadField label="Issued on" value={formatPortalDate(data.issueDate)} />
          <ReadField label="Closing date" value={formatPortalDateTime(data.closingDate)} />
          <ReadField
            label="Issued by"
            value={[doc.issuedByName, doc.issuedByPosition].filter(Boolean).join(" · ") || null}
          />
          {doc.biddingDocumentCost ? (
            <ReadField label="Bidding document fee" value={formatMoneyUGX(doc.biddingDocumentCost)} />
          ) : null}
          {procurement.requestedDeliveryDate ? (
            <ReadField label="Deliver by" value={formatPortalDate(procurement.requestedDeliveryDate)} />
          ) : null}
          <ReadField label="Delivery location" value={procurement.deliveryLocation} full />
          <ReadField label="Subject of procurement" value={doc.subject} full />
          <ReadField label="Specifications / scope" value={doc.specifications} full />
          <ReadField label="Submission instructions" value={doc.submissionInstructions} full />
          <ReadField label="Evaluation criteria" value={doc.evaluationCriteria} full />
        </dl>
      </Card>

      {data.items.length ? (
        <Card title="Items requested">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                  <th className="w-10 py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2 text-right">Qty</th>
                  <th className="py-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.lineNumber} className="border-b border-zinc-100 align-top">
                    <td className="py-2 pr-2">{i.lineNumber}</td>
                    <td className="py-2 pr-2">
                      <p className="font-medium">{i.itemName}</p>
                      {i.description ? <p className="text-xs text-zinc-600 wrap-break-word">{i.description}</p> : null}
                      {i.specification ? (
                        <p className="text-xs text-zinc-600 wrap-break-word">{i.specification}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-right">{i.quantity}</td>
                    <td className="py-2">{i.unitOfMeasure || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card
        title={showForm ? (activeOffer ? `Edit your ${word}` : `Submit your ${word}`) : `Your ${word}`}
        action={
          showForm ? null : (
            <div className="flex flex-wrap items-center gap-2">
              {activeOffer && activeOffer.source !== "PORTAL" ? (
                <Chip
                  size="small"
                  variant="outlined"
                  color="info"
                  label="Recorded by the organisation"
                  title="Entered on your behalf by the procurement unit"
                />
              ) : null}
              {data.canEdit ? (
                <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>
                  {data.revising ? `Revise ${word}` : `Edit ${word}`}
                </Button>
              ) : null}
              {data.canWithdraw ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={withdrawing ? <CircularProgress size={16} color="inherit" /> : <UndoRounded />}
                  onClick={() => void withdraw()}
                  disabled={withdrawing}
                >
                  {withdrawing ? "Withdrawing…" : `Withdraw ${word}`}
                </Button>
              ) : null}
            </div>
          )
        }
      >
        {showForm ? (
          <OfferForm
            key={activeOffer?.id || "new"}
            opportunity={data}
            onCancel={activeOffer ? () => setEditing(false) : null}
            onSaved={() => {
              setEditing(false);
              notifyPortal();
              reload();
            }}
          />
        ) : activeOffer ? (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ReadField label="Total price" value={formatMoneyUGX(activeOffer.amount)} />
              <ReadField label="Status" value={<StatusChip map={OFFER_STATUS} status={activeOffer.status} />} />
              <ReadField label="Delivery period" value={activeOffer.deliveryDays ? `${activeOffer.deliveryDays} days` : null} />
              <ReadField label="Submitted" value={formatPortalDateTime(activeOffer.submittedAt)} />
              <ReadField label="Remarks" value={activeOffer.remarks} full />
            </dl>
            <OfferLinesTable lines={activeOffer.lineItems} total={activeOffer.amount} />
          </>
        ) : data.noResponseAt ? (
          <p className="text-sm text-zinc-600">
            Recorded as no response on {formatPortalDate(data.noResponseAt)}.
            {data.canSubmit ? ` You can still submit before the closing date.` : ""}
          </p>
        ) : (
          <p className="text-sm text-zinc-600">No {word} submitted.</p>
        )}
        {pastOffers.length ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Earlier</p>
            <ul className="space-y-2">
              {pastOffers.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3">
                  <span className="text-sm">
                    <span className="font-semibold">{formatMoneyUGX(o.amount)}</span>
                    <span className="text-xs text-zinc-600">
                      {" "}
                      · {formatPortalDateTime(o.submittedAt)}
                      {o.withdrawnAt ? ` · withdrawn ${formatPortalDateTime(o.withdrawnAt)}` : ""}
                    </span>
                  </span>
                  <StatusChip map={OFFER_STATUS} status={o.status} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {activeOffer?.clarifications?.length ? (
        <Card title="Clarifications">
          <ul className="space-y-3">
            {activeOffer.clarifications.map((c) => (
              <ClarificationItem key={c.id} clarification={c} canAnswer={!data.decided} onAnswered={reload} />
            ))}
          </ul>
        </Card>
      ) : null}

      <WorkflowHistoryPanel
        history={(data.history || []).map((h) => ({
          id: h.id,
          createdAt: h.createdAt,
          actionLabel: h.action,
          actorName: h.actor,
          actorRoleName: h.role,
          comment: h.comment,
        }))}
      />

      <PortalOpportunityPrint data={data} />
    </div>
  );
}
