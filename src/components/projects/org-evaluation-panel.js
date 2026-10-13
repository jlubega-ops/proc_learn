"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import GavelRounded from "@mui/icons-material/GavelRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftSync } from "@/hooks/use-draft-sync";
import {
  adminDialogPaperSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import { formatPrintDate } from "@/components/print/print-document";
import { OrgProviderRunValidation } from "@/components/projects/org-provider-selection";
import { ProviderComplianceChecklist } from "@/components/projects/org-provider-compliance";
import { OrgAwardDecisionTrail } from "@/components/projects/org-award-recommendation-summary";
import { actingRoleLabel } from "@/lib/projects/committee-labels";
import {
  FINANCIAL_EVAL_STEP_RE,
  PREPARE_EVAL_REPORT_STEP_RE,
  TECHNICAL_EVAL_STEP_RE,
  latestStepSignOff,
} from "@/lib/projects/invoice-match";

const REPORT_STATUS_COLOR = {
  DRAFT: "warning",
  RETURNED: "warning",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "error",
};

/** @type {Record<string, string>} */
const REPORT_STATUS_LABEL = {
  DRAFT: "Draft",
  RETURNED: "Returned",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** @param {{ by: string | null; at: any } | null} s */
function signOffLine(s) {
  return s ? `${s.by || "—"} · ${formatPrintDate(s.at)}` : "—";
}

/**
 * @param {any[]} bidders
 */
function lowestEligible(bidders) {
  return bidders
    .filter((b) => b.qualification?.qualifies)
    .reduce((min, b) => (min === null || Number(b.amount) < Number(min.amount) ? b : min), /** @type {any} */ (null));
}

/**
 * Evaluation Committee eligibility + recommendation, and tender post-qualification.
 * Eligibility is always run by the system ("Run validation"); learning mode never blocks.
 *
 * With `step`, renders only that workflow step's work inside the task card; the step's
 * own action (validation dialog or the task button via `ref`) completes the task.
 *
 * @param {{
 *   projectId: string;
 *   procurement: any;
 *   providerWord: string;
 *   onChanged: () => void;
 *   step?: "technical" | "financial" | "report" | "postQualification" | "review" | "award" | null;
 *   stepActionLabel?: string;
 *   onStepAction?: () => Promise<void> | void;
 *   onStepActionInsideChange?: (inside: boolean) => void;
 *   hideStepAction?: boolean;
 *   stepBusy?: boolean;
 *   phaseLocked?: boolean;
 *   ref?: import("react").Ref<{ prepare: () => Promise<boolean>; submit: () => Promise<boolean> }>;
 * }} p
 */
export function OrgEvaluationPanel({
  projectId,
  procurement,
  onChanged,
  step = null,
  stepActionLabel = "",
  onStepAction,
  onStepActionInsideChange,
  hideStepAction = false,
  stepBusy = false,
  phaseLocked = false,
  ref,
}) {
  const { showToast } = useToast();
  const warnResolveRef = useRef(/** @type {((ok: boolean) => void) | null} */ (null));
  const [ctx, setCtx] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recommendedId, setRecommendedId] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [comments, setComments] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [confirmSubmit, setConfirmSubmit] = useState(/** @type {string[] | null} */ (null));
  const refreshKey = `${procurement?.updatedAt || ""}-${(procurement?.offers || []).length}`;
  const reportStatus = ctx?.evaluationReport?.status;
  const reportDraft = useDraftSync(
    `org:procurement:${procurement.id}:evaluation-report`,
    { recommendedId, recommendation, comments },
    (d) => {
      if (typeof d.recommendedId === "string") setRecommendedId(d.recommendedId);
      if (typeof d.recommendation === "string") setRecommendation(d.recommendation);
      if (typeof d.comments === "string") setComments(d.comments);
    },
    {
      enabled:
        !loading &&
        Boolean(ctx?.permissions?.canEvaluate) &&
        (!reportStatus || ["DRAFT", "RETURNED"].includes(reportStatus)),
    },
  );

  const call = useCallback(
    async (action, body = {}) => {
      const res = await fetch(`/api/projects/${projectId}/procurements/${procurement.id}/lifecycle`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    },
    [projectId, procurement.id],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await call("evaluation_context");
      if (!ok) {
        setCtx(null);
        return;
      }
      setCtx(data);
      const report = data.evaluationReport;
      const fallback = lowestEligible(data.bidders || []) || (data.bidders || [])[0] || null;
      setRecommendedId(report?.recommendedSupplierId || fallback?.id || "");
      setRecommendation(report?.recommendation || "");
      setComments(report?.comments || "");
      setErrors({});
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function mutate(action, body, successMessage) {
    setBusy(true);
    try {
      const { ok, data } = await call(action, body);
      if (!ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not save.",
          severity: "error",
        });
        return false;
      }
      showToast({ message: successMessage, severity: "success" });
      if (action === "save_evaluation") reportDraft.clearDraft();
      await load();
      onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const bidders = Array.isArray(ctx?.bidders) ? ctx.bidders : [];
  const report = ctx?.evaluationReport || null;
  const canEvaluate = Boolean(ctx?.permissions?.canEvaluate);
  const editable = canEvaluate && (!report || ["DRAFT", "RETURNED"].includes(report.status));
  const lowest = lowestEligible(bidders);
  const chosen = bidders.find((b) => b.id === recommendedId) || null;
  const pq = ctx?.postQualification || null;
  const recommended = ctx?.recommended || null;
  const stepActionInside =
    step === "technical"
      ? canEvaluate && bidders.length > 0
      : step === "postQualification"
        ? canEvaluate && Boolean(recommended) && (!pq || pq.status === "DRAFT")
        : false;

  useEffect(() => {
    onStepActionInsideChange?.(stepActionInside);
  }, [onStepActionInsideChange, stepActionInside]);

  useImperativeHandle(ref, () => ({
    async prepare() {
      if (!editable) return true;
      if (!validate(true)) return false;
      const w = recommendationWarnings();
      if (!w.length) return true;
      return new Promise((resolve) => {
        warnResolveRef.current = resolve;
        setConfirmSubmit(w);
      });
    },
    async submit() {
      if (!editable) return true;
      const { ok, data } = await call("submit_evaluation", payload());
      if (!ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit the evaluation report.",
          severity: "error",
        });
      } else {
        reportDraft.clearDraft();
      }
      return ok;
    },
  }));

  if (loading && !ctx) {
    return (
      <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }} aria-busy>
        <div className="flex items-center gap-2 text-sm" role="status">
          <CircularProgress size={16} /> Loading evaluation…
        </div>
      </Paper>
    );
  }
  if (!ctx) return null;

  /** @returns {string[]} */
  function recommendationWarnings() {
    /** @type {string[]} */
    const w = [];
    if (chosen && !chosen.qualification?.qualifies) {
      w.push(`${chosen.name} did not pass eligibility: ${(chosen.qualification?.failedReasons || []).join("; ")}`);
    }
    if (chosen && lowest && lowest.id !== chosen.id) {
      w.push(`${chosen.name} is not the lowest-priced eligible bidder (${lowest.name} offered ${formatMoneyUGX(lowest.amount)}).`);
    }
    return w;
  }

  /** @param {boolean} submit */
  function validate(submit) {
    /** @type {Record<string, string>} */
    const next = {};
    if (!recommendedId) next.recommendedSupplierId = "Choose the recommended bidder.";
    if (submit && !recommendation.trim()) next.recommendation = "Enter the committee's recommendation.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return false;
    }
    return true;
  }

  function payload() {
    return {
      recommendedSupplierId: recommendedId,
      recommendation: recommendation.trim(),
      comments: comments.trim(),
    };
  }

  /** @param {boolean} ok */
  function resolveWarnings(ok) {
    const resolve = warnResolveRef.current;
    warnResolveRef.current = null;
    setConfirmSubmit(null);
    resolve?.(ok);
    return Boolean(resolve);
  }

  async function runPostQualificationStep() {
    setBusy(true);
    try {
      const { ok, data } = await call("run_post_qualification", {});
      if (!ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not submit post-qualification.",
          severity: "error",
        });
        return;
      }
      await onStepAction?.();
    } finally {
      setBusy(false);
    }
  }

  const warningsDialog = (
    <Dialog
      open={Boolean(confirmSubmit)}
      onClose={() => {
        if (!resolveWarnings(false)) setConfirmSubmit(null);
      }}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: adminDialogPaperSx }}
    >
      <DialogTitle>Continue with warnings?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1 }}>
          This is learning mode, so you can continue. The warnings below are recorded on the
          procurement file for review.
        </Typography>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {(confirmSubmit || []).map((w) => (
            <li key={w} className="wrap-break-word">
              {w}
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogActions className="flex-wrap gap-2">
        <Button
          onClick={() => {
            if (!resolveWarnings(false)) setConfirmSubmit(null);
          }}
        >
          Go back
        </Button>
        <Button
          variant="contained"
          color="warning"
          startIcon={<WarningAmberRounded />}
          onClick={() => {
            if (!resolveWarnings(true)) setConfirmSubmit(null);
          }}
        >
          Continue anyway
        </Button>
      </DialogActions>
    </Dialog>
  );

  const reportFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        select
        label="Recommended bidder"
        value={recommendedId}
        onChange={(e) => {
          setRecommendedId(e.target.value);
          setErrors((prev) => ({ ...prev, recommendedSupplierId: "" }));
        }}
        error={Boolean(errors.recommendedSupplierId)}
        helperText={
          errors.recommendedSupplierId ||
          (lowest ? `Lowest-priced eligible: ${lowest.name}` : "No bidder passed eligibility")
        }
        fullWidth
        className="sm:col-span-2"
        sx={themedTextFieldSx}
      >
        {bidders.map((b) => (
          <MenuItem key={b.id} value={b.id}>
            {b.name} · {formatMoneyUGX(b.amount)} · {b.qualification?.qualifies ? "eligible" : "not eligible"}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Recommendation"
        value={recommendation}
        onChange={(e) => {
          setRecommendation(e.target.value);
          setErrors((prev) => ({ ...prev, recommendation: "" }));
        }}
        error={Boolean(errors.recommendation)}
        helperText={errors.recommendation || "Why this bidder is recommended for award"}
        fullWidth
        multiline
        minRows={3}
        className="sm:col-span-2"
        sx={themedTextFieldSx}
      />
      <TextField
        label="Committee comments (optional)"
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        fullWidth
        multiline
        minRows={2}
        className="sm:col-span-2"
        sx={themedTextFieldSx}
      />
    </div>
  );

  const reportSummary =
    report && report.status !== "DRAFT" ? (
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-semibold">Recommended:</span> {report.recommendedSupplier?.name || "—"} ·{" "}
          {formatMoneyUGX(report.evaluatedAmount)}
          {report.committee?.name ? ` · ${report.committee.name}` : ""}
        </p>
        {report.recommendation ? <p className="wrap-break-word">{report.recommendation}</p> : null}
      </div>
    ) : null;

  const notMemberAlert = (
    <Alert severity="info" variant="outlined">
      Only Evaluation Committee members can do this, from their Evaluation Committee seat.
    </Alert>
  );

  /**
   * @param {{ id: string; name: string; amount: any; qualifies: boolean; failedReasons?: string[] }[]} list
   * @param {string | null} [recommendedSupplierId]
   */
  const rankedTable = (list, recommendedSupplierId = null) => {
    const sorted = [...list].sort(
      (a, b) => (a.qualifies ? 0 : 1) - (b.qualifies ? 0 : 1) || Number(a.amount) - Number(b.amount),
    );
    const lowestId = sorted.find((b) => b.qualifies)?.id || null;
    return (
      <div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-(--border-subtle) text-left">
              <th className="p-2 font-semibold">Rank</th>
              <th className="p-2 font-semibold">Bidder</th>
              <th className="p-2 text-right font-semibold">Amount</th>
              <th className="p-2 font-semibold">Eligibility</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b, i) => (
              <tr key={b.id} className="border-b border-(--border-subtle) last:border-0">
                <td className="p-2">{b.qualifies ? i + 1 : "—"}</td>
                <td className="p-2 wrap-break-word">
                  {b.name}
                  {lowestId === b.id ? (
                    <Chip size="small" color="success" variant="outlined" label="Lowest eligible" sx={{ ml: 1 }} />
                  ) : null}
                  {recommendedSupplierId === b.id ? (
                    <Chip size="small" color="primary" label="Recommended" sx={{ ml: 1 }} />
                  ) : null}
                  {!b.qualifies && b.failedReasons?.length ? (
                    <span className="block text-xs opacity-75">{b.failedReasons.join("; ")}</span>
                  ) : null}
                </td>
                <td className="p-2 text-right">{formatMoneyUGX(b.amount)}</td>
                <td className="p-2">
                  <Chip
                    size="small"
                    color={b.qualifies ? "success" : "error"}
                    label={b.qualifies ? "Eligible" : "Not eligible"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  const liveRanking = bidders.map((b) => ({
    id: b.id,
    name: b.name,
    amount: b.amount,
    qualifies: Boolean(b.qualification?.qualifies),
    failedReasons: b.qualification?.failedReasons || [],
  }));

  if (step) {
    let body = null;
    if (!bidders.length) {
      body = (
        <Typography variant="body2" sx={adminMutedTextSx}>
          No opened quotations or bids.
        </Typography>
      );
    } else if (step === "technical") {
      const criteria = procurement?.solicitations?.[0]?.bidDocument?.evaluationCriteria || "";
      body = (
        <div className="space-y-3">
          {criteria ? (
            <div className="rounded-lg border border-(--border-subtle) p-3 text-sm">
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Evaluation criteria
              </Typography>
              <p className="whitespace-pre-line wrap-break-word">{criteria}</p>
            </div>
          ) : null}
          {canEvaluate ? (
            <OrgProviderRunValidation
              providers={bidders}
              actionLabel={stepActionLabel || "Complete technical evaluation"}
              busy={stepBusy || busy}
              busyLabel="Completing…"
              hideAction={hideStepAction || phaseLocked}
              onConfirm={() => onStepAction?.()}
            />
          ) : (
            notMemberAlert
          )}
        </div>
      );
    } else if (step === "financial") {
      body = rankedTable(liveRanking);
    } else if (step === "review" || step === "award") {
      const recorded = Array.isArray(report?.eligibility?.bidders) ? report.eligibility.bidders : null;
      const estimate = Number(procurement?.requisition?.estimatedTotalValue) || 0;
      const price = Number(report?.evaluatedAmount) || 0;
      const variance = price - estimate;
      const ccDecision = [...(procurement?.timeline || [])]
        .reverse()
        .find((a) => a.decision && /^approve evaluation/i.test(String(a.taskTitle || "")));
      /** @param {string} label @param {import("react").ReactNode} value */
      const fact = (label, value) => (
        <div>
          <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
            {label}
          </Typography>
          {value}
        </div>
      );
      body = !report || ["DRAFT", "RETURNED"].includes(report.status) ? (
        <Alert severity="warning" variant="outlined">
          No submitted evaluation report yet.
        </Alert>
      ) : (
        <div className="space-y-3">
          {step === "award" ? (
            <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 text-sm sm:grid-cols-3">
              {fact(
                "Best evaluated bidder",
                <span className="font-semibold wrap-break-word">{report.recommendedSupplier?.name || "—"}</span>,
              )}
              {fact("Contract price", <span className="font-semibold">{formatMoneyUGX(price)}</span>)}
              {fact("Estimated value", formatMoneyUGX(estimate))}
              {fact(
                "Against estimate",
                estimate ? (
                  <Chip
                    size="small"
                    color={variance > 0 ? "error" : "success"}
                    label={
                      variance > 0
                        ? `Over by ${formatMoneyUGX(variance)}`
                        : `Within · saves ${formatMoneyUGX(-variance)}`
                    }
                  />
                ) : (
                  "—"
                ),
              )}
              {fact(
                "Evaluation report",
                <Chip
                  size="small"
                  color={/** @type {any} */ (REPORT_STATUS_COLOR[report.status] || "info")}
                  label={report.approvedAt ? `Approved ${formatPrintDate(report.approvedAt)}` : report.status}
                />,
              )}
              {fact(
                "Evaluation approved by",
                ccDecision ? (
                  <span className="wrap-break-word">
                    {ccDecision.actor?.displayName || "—"}
                    {actingRoleLabel(ccDecision) ? (
                      <Typography component="span" variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                        {actingRoleLabel(ccDecision)}
                      </Typography>
                    ) : null}
                  </span>
                ) : (
                  "—"
                ),
              )}
              {fact("Evaluation committee", report.committee?.name || "—")}
              {report.recommendation ? (
                <div className="sm:col-span-3">
                  {fact("Evaluation recommendation", <p className="wrap-break-word">{report.recommendation}</p>)}
                </div>
              ) : null}
              {report.comments ? (
                <div className="sm:col-span-3">
                  {fact("Committee comments", <p className="wrap-break-word">{report.comments}</p>)}
                </div>
              ) : null}
            </div>
          ) : null}
          {step === "award" ? <OrgAwardDecisionTrail timeline={procurement?.timeline} /> : null}
          {step === "award" ? null : (
          <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 text-sm sm:grid-cols-3">
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Recommended bidder
              </Typography>
              <span className="font-semibold wrap-break-word">{report.recommendedSupplier?.name || "—"}</span>
            </div>
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Evaluated amount
              </Typography>
              <span className="font-semibold">{formatMoneyUGX(report.evaluatedAmount)}</span>
            </div>
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Committee
              </Typography>
              {report.committee?.name || "—"}
            </div>
            {fact("Estimated value", estimate ? formatMoneyUGX(estimate) : "—")}
            {fact(
              "Against estimate",
              estimate ? (
                <Chip
                  size="small"
                  color={variance > 0 ? "error" : "success"}
                  label={variance > 0 ? `Over by ${formatMoneyUGX(variance)}` : "Within estimate"}
                />
              ) : (
                "—"
              ),
            )}
            {fact("Report prepared by", signOffLine(latestStepSignOff(procurement?.timeline, PREPARE_EVAL_REPORT_STEP_RE)))}
            {fact("Technical evaluation", signOffLine(latestStepSignOff(procurement?.timeline, TECHNICAL_EVAL_STEP_RE)))}
            {fact("Financial evaluation", signOffLine(latestStepSignOff(procurement?.timeline, FINANCIAL_EVAL_STEP_RE)))}
            {report.recommendation ? (
              <div className="sm:col-span-3">
                <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                  Recommendation
                </Typography>
                <p className="wrap-break-word">{report.recommendation}</p>
              </div>
            ) : null}
            {report.comments ? (
              <div className="sm:col-span-3">
                <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                  Committee comments
                </Typography>
                <p className="wrap-break-word">{report.comments}</p>
              </div>
            ) : null}
          </div>
          )}
          {rankedTable(
            recorded
              ? recorded.map((b) => ({
                  id: b.supplierId,
                  name: b.name,
                  amount: b.amount,
                  qualifies: Boolean(b.qualifies),
                  failedReasons: b.failedReasons || [],
                }))
              : liveRanking,
            report.recommendedSupplierId,
          )}
          {(report.eligibility?.warnings || []).map((w) => (
            <Alert key={w} severity="warning" variant="outlined">
              {w}
            </Alert>
          ))}
          {pq ? (
            <div className="rounded-lg border border-(--border-subtle) p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Post-qualification
                </Typography>
                <div className="flex flex-wrap items-center gap-2">
                  {pq.validation ? (
                    <Chip
                      size="small"
                      color={pq.validation.qualifies ? "success" : "error"}
                      label={pq.validation.qualifies ? "Qualifies" : "Does not qualify"}
                    />
                  ) : null}
                  <Chip
                    size="small"
                    variant="outlined"
                    color={/** @type {any} */ (REPORT_STATUS_COLOR[pq.status] || "info")}
                    label={REPORT_STATUS_LABEL[pq.status] || pq.status}
                  />
                </div>
              </div>
              <p className="mt-1 text-sm">
                {pq.validation?.name || report.recommendedSupplier?.name || "—"} · post-qualified by{" "}
                {signOffLine(latestStepSignOff(procurement?.timeline, /^post-qualification/i))}
              </p>
              {pq.validation?.failedReasons?.length ? (
                <p className="mt-1 text-xs text-brand-red wrap-break-word">{pq.validation.failedReasons.join(" · ")}</p>
              ) : null}
              {pq.validation?.checks?.length ? (
                <ProviderComplianceChecklist checks={pq.validation.checks} />
              ) : null}
            </div>
          ) : null}
        </div>
      );
    } else if (step === "report") {
      const estimate = Number(procurement?.requisition?.estimatedTotalValue) || 0;
      const overBy = chosen && estimate ? Number(chosen.amount) - estimate : 0;
      const results = (
        <div className="space-y-3">
          <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 text-sm sm:grid-cols-3">
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Technical evaluation
              </Typography>
              <span className="wrap-break-word">{signOffLine(latestStepSignOff(procurement?.timeline, TECHNICAL_EVAL_STEP_RE))}</span>
            </div>
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Financial evaluation
              </Typography>
              <span className="wrap-break-word">{signOffLine(latestStepSignOff(procurement?.timeline, FINANCIAL_EVAL_STEP_RE))}</span>
            </div>
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Estimated value
              </Typography>
              {estimate ? formatMoneyUGX(estimate) : "—"}
            </div>
          </div>
          {rankedTable(liveRanking, recommendedId || null)}
        </div>
      );
      const returned =
        report?.status === "RETURNED"
          ? [...(procurement?.timeline || [])]
              .filter((a) => a.decision === "RETURN" && /^(review|approve) evaluation/i.test(String(a.taskTitle || "")))
              .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null
          : null;
      body = editable ? (
        <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-3">
          {returned ? (
            <Alert severity="warning" variant="outlined">
              Returned by {returned.actor?.displayName || "—"}
              {actingRoleLabel(returned) ? ` (${actingRoleLabel(returned)})` : ""} · {formatPrintDate(returned.createdAt)}
              {returned.comment ? `: ${returned.comment}` : ""}
            </Alert>
          ) : null}
          {results}
          {reportFields}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {chosen ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  Evaluated amount: <span className="font-semibold">{formatMoneyUGX(chosen.amount)}</span>
                </span>
                {estimate ? (
                  <Chip
                    size="small"
                    color={overBy > 0 ? "error" : "success"}
                    label={overBy > 0 ? `Over estimate by ${formatMoneyUGX(overBy)}` : "Within estimate"}
                  />
                ) : null}
              </p>
            ) : (
              <span />
            )}
            <Button
              variant="outlined"
              startIcon={<SaveRounded />}
              disabled={busy || stepBusy || phaseLocked}
              onClick={() => {
                if (validate(false)) void mutate("save_evaluation", payload(), "Evaluation draft saved.");
              }}
              className="w-full sm:w-auto"
            >
              Save draft
            </Button>
          </div>
        </form>
      ) : !canEvaluate ? (
        notMemberAlert
      ) : (
        reportSummary
      );
    } else if (step === "postQualification") {
      body = (
        <div className="space-y-2">
          <div className="grid gap-3 rounded-lg border border-(--border-subtle) p-3 text-sm sm:grid-cols-3">
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Recommended bidder
              </Typography>
              <span className="font-semibold wrap-break-word">
                {report?.recommendedSupplier?.name || recommended?.name || "—"}
              </span>
            </div>
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Evaluated amount
              </Typography>
              <span className="font-semibold">{formatMoneyUGX(report?.evaluatedAmount)}</span>
            </div>
            <div>
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Report cleared by (Head PDU)
              </Typography>
              <span className="wrap-break-word">
                {signOffLine(latestStepSignOff(procurement?.timeline, /^review evaluation report/i))}
              </span>
            </div>
            <div className="sm:col-span-3">
              <Typography variant="caption" sx={{ ...adminMutedTextSx, display: "block" }}>
                Checks
              </Typography>
              Registration, tax compliance and experience in the category.
            </div>
          </div>
          {stepActionInside && recommended ? (
            <OrgProviderRunValidation
              providers={[recommended]}
              actionLabel={stepActionLabel || "Submit post-qualification"}
              busy={stepBusy || busy}
              busyLabel="Submitting post-qualification…"
              hideAction={hideStepAction || phaseLocked}
              onConfirm={() => runPostQualificationStep()}
            />
          ) : !canEvaluate ? (
            notMemberAlert
          ) : null}
          {pq?.validation?.checks?.length ? (
            <div className="rounded-md bg-surface-card p-2">
              <Typography variant="body2" fontWeight={700}>
                {pq.validation.name}
              </Typography>
              <ProviderComplianceChecklist checks={pq.validation.checks} />
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {report && (step === "report" || step === "review") ? (
          <Chip
            size="small"
            color={/** @type {any} */ (REPORT_STATUS_COLOR[report.status] || "info")}
            label={`Report ${(REPORT_STATUS_LABEL[report.status] || report.status).toLowerCase()}`}
          />
        ) : null}
        {body}
        {warningsDialog}
      </div>
    );
  }

  const recordedRanking = Array.isArray(report?.eligibility?.bidders)
    ? report.eligibility.bidders.map((b) => ({
        id: b.supplierId,
        name: b.name,
        amount: b.amount,
        qualifies: Boolean(b.qualifies),
        failedReasons: b.failedReasons || [],
      }))
    : null;
  const reportIn = Boolean(report) && !["DRAFT", "RETURNED"].includes(report.status);

  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} className="flex items-center gap-1">
          <GavelRounded fontSize="small" color="primary" aria-hidden />
          Evaluation
        </Typography>
        <Chip
          size="small"
          color={/** @type {any} */ (reportIn ? REPORT_STATUS_COLOR[report.status] || "info" : "warning")}
          label={reportIn ? `Report ${(REPORT_STATUS_LABEL[report.status] || report.status).toLowerCase()}` : "Report not submitted"}
        />
      </div>

      {!bidders.length ? (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
          No opened quotations or bids.
        </Typography>
      ) : (
        <div className="mt-2 space-y-3">
          {reportIn ? reportSummary : null}
          {rankedTable(reportIn && recordedRanking ? recordedRanking : liveRanking, reportIn ? report.recommendedSupplierId : null)}
          {reportIn
            ? (report.eligibility?.warnings || []).map((w) => (
                <Alert key={w} severity="warning" variant="outlined">
                  {w}
                </Alert>
              ))
            : null}

          {ctx.postQualificationRequired && reportIn ? (
            <div className="space-y-2 border-t border-(--border-subtle) pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Post-qualification
                </Typography>
                <Chip
                  size="small"
                  color={/** @type {any} */ (pq ? REPORT_STATUS_COLOR[pq.status] || "info" : "warning")}
                  label={pq ? REPORT_STATUS_LABEL[pq.status] || pq.status : "Not started"}
                />
              </div>
              {pq?.validation?.checks?.length ? (
                <div className="rounded-md bg-surface-card p-2">
                  <Typography variant="body2" fontWeight={700}>
                    {pq.validation.name}
                  </Typography>
                  <ProviderComplianceChecklist checks={pq.validation.checks} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Paper>
  );
}
