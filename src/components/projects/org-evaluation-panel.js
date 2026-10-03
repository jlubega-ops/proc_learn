"use client";

import { useCallback, useEffect, useState } from "react";
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
import SendRounded from "@mui/icons-material/SendRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { useToast } from "@/components/providers/toast-provider";
import {
  adminDialogPaperSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { formatMoneyUGX } from "@/lib/money";
import { OrgProviderRunValidation } from "@/components/projects/org-provider-selection";
import { ProviderComplianceChecklist } from "@/components/projects/org-provider-compliance";

const REPORT_STATUS_COLOR = {
  DRAFT: "warning",
  RETURNED: "warning",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "error",
};

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
 * @param {{ projectId: string; procurement: any; providerWord: string; onChanged: () => void }} p
 */
export function OrgEvaluationPanel({ projectId, procurement, providerWord, onChanged }) {
  const { showToast } = useToast();
  const [ctx, setCtx] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [recommendedId, setRecommendedId] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [comments, setComments] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [confirmSubmit, setConfirmSubmit] = useState(/** @type {string[] | null} */ (null));
  const [pqComment, setPqComment] = useState("");
  const [pqCommentError, setPqCommentError] = useState("");

  const refreshKey = `${procurement?.updatedAt || ""}-${(procurement?.offers || []).length}`;

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
      setEligibilityConfirmed(Boolean(report?.eligibility));
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
      await load();
      onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  }

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

  const bidders = Array.isArray(ctx.bidders) ? ctx.bidders : [];
  const report = ctx.evaluationReport;
  const canEvaluate = Boolean(ctx.permissions?.canEvaluate);
  const editable = canEvaluate && (!report || ["DRAFT", "RETURNED"].includes(report.status));
  const lowest = lowestEligible(bidders);
  const chosen = bidders.find((b) => b.id === recommendedId) || null;

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

  const payload = () => ({
    recommendedSupplierId: recommendedId,
    recommendation: recommendation.trim(),
    comments: comments.trim(),
  });

  function startSubmit() {
    if (!validate(true)) return;
    const w = recommendationWarnings();
    if (w.length) {
      setConfirmSubmit(w);
      return;
    }
    void mutate("submit_evaluation", payload(), "Evaluation report submitted for approval.");
  }

  const pq = ctx.postQualification;
  const recommended = ctx.recommended;

  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} className="flex items-center gap-1">
          <GavelRounded fontSize="small" color="primary" aria-hidden />
          Evaluation
        </Typography>
        {report ? (
          <Chip
            size="small"
            color={/** @type {any} */ (REPORT_STATUS_COLOR[report.status] || "info")}
            label={`Report ${report.status}`}
          />
        ) : null}
      </div>

      {!bidders.length ? (
        <Typography variant="body2" sx={{ ...adminMutedTextSx, mt: 1 }}>
          No quotations or bids yet. Evaluation starts once offers have been received and opened.
        </Typography>
      ) : (
        <div className="mt-2 space-y-3">
          {editable ? (
            <>
              <Typography variant="body2" sx={adminMutedTextSx}>
                As a member of the Evaluation Committee, run the eligibility validation on all{" "}
                {bidders.length} bidder(s), then recommend the {providerWord} for award.
              </Typography>
              <OrgProviderRunValidation
                providers={bidders}
                actionLabel="Confirm eligibility results"
                confirmed={eligibilityConfirmed}
                confirmedLabel="Eligibility results confirmed"
                onConfirm={() => setEligibilityConfirmed(true)}
              />
            </>
          ) : !canEvaluate && (!report || ["DRAFT", "RETURNED"].includes(report.status)) ? (
            <Alert severity="info" variant="outlined">
              The Evaluation Committee runs eligibility on the bidders and submits its recommendation
              here. Only Evaluation Committee members can do this, after switching to their
              Evaluation Committee seat.
            </Alert>
          ) : null}

          {editable && eligibilityConfirmed ? (
            <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-3">
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
                      {b.name} · {formatMoneyUGX(b.amount)} ·{" "}
                      {b.qualification?.qualifies ? "eligible" : "not eligible"}
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
              {chosen ? (
                <p className="text-sm">
                  Evaluated amount: <span className="font-semibold">{formatMoneyUGX(chosen.amount)}</span>{" "}
                  (the recommended bidder&apos;s offer)
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outlined"
                  startIcon={<SaveRounded />}
                  disabled={busy}
                  onClick={() => {
                    if (validate(false)) void mutate("save_evaluation", payload(), "Evaluation draft saved.");
                  }}
                  className="w-full sm:w-auto"
                >
                  Save draft
                </Button>
                <Button
                  variant="contained"
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
                  disabled={busy}
                  onClick={startSubmit}
                  className="w-full sm:w-auto"
                >
                  {busy ? "Submitting…" : "Submit evaluation report"}
                </Button>
              </div>
            </form>
          ) : null}

          {report && report.status !== "DRAFT" ? (
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-semibold">Recommended:</span> {report.recommendedSupplier?.name || "—"} ·{" "}
                {formatMoneyUGX(report.evaluatedAmount)}
                {report.committee?.name ? ` · ${report.committee.name}` : ""}
              </p>
              {report.recommendation ? <p className="wrap-break-word">{report.recommendation}</p> : null}
              {report.status === "SUBMITTED" ? (
                <Alert severity="info" variant="outlined">
                  Awaiting approval. The approver records the decision at the &ldquo;Approve evaluation
                  report&rdquo; workflow step.
                </Alert>
              ) : null}
            </div>
          ) : null}

          {report?.eligibility?.bidders?.length ? (
            <div>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Recorded eligibility results
              </Typography>
              <ul className="mt-1 space-y-1 text-sm">
                {report.eligibility.bidders.map((b) => (
                  <li key={b.supplierId} className="flex flex-wrap items-center gap-2">
                    <span className="wrap-break-word">{b.name}</span>
                    <span className="opacity-80">{formatMoneyUGX(b.amount)}</span>
                    <Chip
                      size="small"
                      color={b.qualifies ? "success" : "error"}
                      label={b.qualifies ? "Eligible" : "Not eligible"}
                    />
                    {!b.qualifies && b.failedReasons?.length ? (
                      <span className="w-full text-xs opacity-75">{b.failedReasons.join("; ")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {(report.eligibility.warnings || []).map((w) => (
                <Alert key={w} severity="warning" variant="outlined" sx={{ mt: 1 }}>
                  {w}
                </Alert>
              ))}
            </div>
          ) : null}

          {ctx.postQualificationRequired && ["SUBMITTED", "APPROVED"].includes(report?.status) ? (
            <div className="space-y-2 border-t border-(--border-subtle) pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Post-qualification
                </Typography>
                {pq ? (
                  <Chip
                    size="small"
                    color={/** @type {any} */ (REPORT_STATUS_COLOR[pq.status] || "info")}
                    label={pq.status}
                  />
                ) : null}
              </div>
              {!pq || pq.status === "DRAFT" ? (
                canEvaluate && recommended ? (
                  <>
                    <Typography variant="body2" sx={adminMutedTextSx}>
                      Confirm the recommended bidder still meets the requirements before award.
                    </Typography>
                    <OrgProviderRunValidation
                      providers={[recommended]}
                      actionLabel="Submit post-qualification"
                      busy={busy}
                      busyLabel="Submitting post-qualification…"
                      onConfirm={() =>
                        mutate("run_post_qualification", {}, "Post-qualification submitted for approval.")
                      }
                    />
                  </>
                ) : (
                  <Typography variant="body2" sx={adminMutedTextSx}>
                    The Evaluation Committee post-qualifies the recommended bidder before the award.
                  </Typography>
                )
              ) : null}
              {pq?.validation?.checks?.length ? (
                <div className="rounded-md bg-surface-card p-2">
                  <Typography variant="body2" fontWeight={700}>
                    {pq.validation.name}
                  </Typography>
                  <ProviderComplianceChecklist checks={pq.validation.checks} />
                </div>
              ) : null}
              {pq?.status === "SUBMITTED" && ctx.permissions?.canDecidePostQualification ? (
                <div className="space-y-2">
                  <TextField
                    label="Comment"
                    value={pqComment}
                    onChange={(e) => {
                      setPqComment(e.target.value);
                      setPqCommentError("");
                    }}
                    error={Boolean(pqCommentError)}
                    helperText={pqCommentError || "Required when rejecting"}
                    fullWidth
                    multiline
                    minRows={2}
                    sx={themedTextFieldSx}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="contained"
                      color={pq.validation?.qualifies === false ? "warning" : "success"}
                      startIcon={pq.validation?.qualifies === false ? <WarningAmberRounded /> : <GavelRounded />}
                      disabled={busy}
                      onClick={() => {
                        if (pq.validation?.qualifies === false) {
                          setConfirmSubmit(pq.validation.failedReasons?.length ? pq.validation.failedReasons : ["Some checks failed."]);
                          return;
                        }
                        void mutate(
                          "decide_post_qualification",
                          { decision: "APPROVE", comment: pqComment.trim() || null },
                          "Post-qualification approved.",
                        );
                      }}
                      className="w-full sm:w-auto"
                    >
                      {pq.validation?.qualifies === false
                        ? "Approve post-qualification with warnings"
                        : "Approve post-qualification"}
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      disabled={busy}
                      onClick={() => {
                        if (!pqComment.trim()) {
                          setPqCommentError("Enter the reason for rejecting.");
                          showToast({ message: "Please fix the highlighted fields.", severity: "error" });
                          return;
                        }
                        void mutate(
                          "decide_post_qualification",
                          { decision: "REJECT", comment: pqComment.trim() },
                          "Post-qualification rejected.",
                        );
                      }}
                      className="w-full sm:w-auto"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : pq?.status === "SUBMITTED" ? (
                <Typography variant="body2" sx={adminMutedTextSx}>
                  Pending Contracts Committee decision on post-qualification.
                </Typography>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <Dialog
        open={Boolean(confirmSubmit)}
        onClose={() => setConfirmSubmit(null)}
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
          <Button onClick={() => setConfirmSubmit(null)}>Go back</Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<WarningAmberRounded />}
            onClick={() => {
              setConfirmSubmit(null);
              if (pq?.status === "SUBMITTED" && ctx.permissions?.canDecidePostQualification) {
                void mutate(
                  "decide_post_qualification",
                  { decision: "APPROVE", comment: pqComment.trim() || null },
                  "Post-qualification approved with warnings.",
                );
              } else {
                void mutate("submit_evaluation", payload(), "Evaluation report submitted for approval.");
              }
            }}
          >
            Continue anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
