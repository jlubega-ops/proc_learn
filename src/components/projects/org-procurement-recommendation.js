"use client";

import { useState } from "react";
import { format, isValid } from "date-fns";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import DoNotDisturbOnRounded from "@mui/icons-material/DoNotDisturbOnRounded";
import GavelRounded from "@mui/icons-material/GavelRounded";
import { useToast } from "@/components/providers/toast-provider";
import { actionConfirmOptions, discardConfirmOptions, useConfirm } from "@/components/providers/confirm-provider";
import { useDraftState } from "@/hooks/use-draft-state";
import { useDraftSync } from "@/hooks/use-draft-sync";
import { RecordDetailsGrid } from "@/components/projects/record-details-grid";
import {
  adminDialogPaperSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { actingRoleLabel } from "@/lib/projects/committee-labels";
import {
  RECOMMENDATION_KIND,
  RECOMMENDATION_KIND_LABELS,
  RECOMMENDATION_STATUS_PRESENTATION,
  recommendActionLabel,
  recommendationReasons,
} from "@/lib/projects/procurement-recommendation-options";

/** @param {unknown} value */
function fmt(value) {
  const d = value ? new Date(String(value)) : null;
  return d && isValid(d) ? format(d, "MMM d, yyyy") : "—";
}

/**
 * @param {string} projectId
 * @param {string} procurementId
 * @param {Record<string, any>} body
 */
async function postAction(projectId, procurementId, body) {
  const res = await fetch(`/api/projects/${projectId}/procurements/${procurementId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * PDU officer's recommendation to the Contracts Committee (cancel, change the approved provider,
 * or change the RFQ shortlist).
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   projectId: string;
 *   procurementId: string;
 *   kinds: string[];
 *   currentProviderId?: string | null;
 *   currentProviderName?: string | null;
 *   currentShortlist?: { id: string; name: string }[];
 *   providers: { id: string; name: string }[];
 *   onSubmitted: () => void | Promise<void>;
 * }} p
 */
export function OrgRecommendationDialog({
  open,
  onClose,
  projectId,
  procurementId,
  kinds,
  currentProviderId,
  currentProviderName,
  currentShortlist = [],
  providers,
  onSubmitted,
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState(kinds[0] || RECOMMENDATION_KIND.CANCEL);
  const [reason, setReason] = useState("");
  const [proposedProviderId, setProposedProviderId] = useState("");
  const [proposedIds, setProposedIds] = useState(() => currentShortlist.map((s) => s.id));
  const [details, setDetails] = useState("");
  const [alternative, setAlternative] = useState("");
  /** @type {[Record<string, string>, Function]} */
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const recDraft = useDraftSync(
    `org:procurement:${procurementId}:recommendation`,
    { kind, reason, proposedProviderId, proposedIds, details, alternative },
    (d) => {
      if (typeof d.kind === "string" && kinds.includes(d.kind)) setKind(d.kind);
      if (typeof d.reason === "string") setReason(d.reason);
      if (typeof d.proposedProviderId === "string") setProposedProviderId(d.proposedProviderId);
      if (Array.isArray(d.proposedIds)) setProposedIds(d.proposedIds);
      if (typeof d.details === "string") setDetails(d.details);
      if (typeof d.alternative === "string") setAlternative(d.alternative);
    },
    { enabled: open },
  );

  async function handleCancel() {
    if (busy) return;
    if (recDraft.isDirty && !(await confirm(discardConfirmOptions()))) return;
    recDraft.clearDraft();
    onClose();
  }

  const isChange = kind === RECOMMENDATION_KIND.CHANGE_PROVIDER;
  const isShortlist = kind === RECOMMENDATION_KIND.CHANGE_SHORTLIST;
  const reasons = recommendationReasons(kind);
  const currentIds = currentShortlist.map((s) => s.id);
  const shortlistUnchanged =
    proposedIds.length === currentIds.length && proposedIds.every((id) => currentIds.includes(id));
  /** @type {{ id: string; name: string }[]} */
  const shortlistOptions = [
    ...currentShortlist.filter((s) => !providers.some((p) => p.id === s.id)),
    ...providers,
  ];

  /** @param {string} key */
  const clear = (key) => setErrors((prev) => ({ ...prev, [key]: "" }));

  async function submit(e) {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    if (!kinds.includes(kind)) next.kind = "Choose a recommendation.";
    if (!reasons.some((r) => r.value === reason)) next.reason = "Choose a reason.";
    if (!details.trim()) next.details = "Enter the details.";
    if (isChange && !proposedProviderId) next.proposedProviderId = "Choose the proposed provider.";
    if (isShortlist && !proposedIds.length) next.proposedProviderIds = "Choose at least one provider.";
    else if (isShortlist && shortlistUnchanged) next.proposedProviderIds = "Change at least one provider.";
    setErrors(next);
    if (Object.keys(next).length) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    if (!(await confirm(actionConfirmOptions("Send to Contracts Committee")))) return;
    setBusy(true);
    try {
      const { ok, data } = await postAction(projectId, procurementId, {
        action: "recommend",
        kind,
        reason,
        details: details.trim(),
        alternative: isChange || isShortlist ? "" : alternative.trim(),
        proposedProviderId: isChange ? proposedProviderId : "",
        proposedProviderIds: isShortlist ? proposedIds : [],
      });
      if (!ok) {
        setErrors(data.fieldErrors || {});
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not send the recommendation.",
          severity: "error",
        });
        return;
      }
      showToast({ message: "Recommendation sent to the Contracts Committee.", severity: "success" });
      recDraft.clearDraft();
      await onSubmitted();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={(_e, r) => {
        if (busy || r === "backdropClick") return;
        void handleCancel();
      }}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
      aria-labelledby="recommend-cc-title"
    >
      <form noValidate onSubmit={submit}>
        <DialogTitle id="recommend-cc-title" className="flex items-center gap-2">
          <GavelRounded color="primary" aria-hidden />
          {recommendActionLabel(kinds)}
        </DialogTitle>
        <DialogContent dividers>
          <div className="grid gap-3">
            <TextField
              select
              label="Recommendation"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setReason("");
                clear("kind");
              }}
              error={Boolean(errors.kind)}
              helperText={errors.kind || " "}
              fullWidth
              sx={themedTextFieldSx}
            >
              {kinds.map((k) => (
                <MenuItem key={k} value={k}>
                  {RECOMMENDATION_KIND_LABELS[k] || k}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                clear("reason");
              }}
              error={Boolean(errors.reason)}
              helperText={errors.reason || (isChange || isShortlist ? " " : "PPDA grounds")}
              fullWidth
              sx={themedTextFieldSx}
            >
              {reasons.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
            {isChange ? (
              <>
                <TextField
                  label="Current provider"
                  value={currentProviderName || "—"}
                  fullWidth
                  slotProps={{ input: { readOnly: true } }}
                  sx={themedTextFieldSx}
                />
                <TextField
                  select
                  label="Proposed provider"
                  value={proposedProviderId}
                  onChange={(e) => {
                    setProposedProviderId(e.target.value);
                    clear("proposedProviderId");
                  }}
                  error={Boolean(errors.proposedProviderId)}
                  helperText={errors.proposedProviderId || " "}
                  fullWidth
                  sx={themedTextFieldSx}
                >
                  {providers
                    .filter((p) => p.id !== currentProviderId)
                    .map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name}
                      </MenuItem>
                    ))}
                </TextField>
              </>
            ) : null}
            {isShortlist ? (
              <>
                <TextField
                  label="Current shortlist"
                  value={currentShortlist.map((s) => s.name).join(", ") || "—"}
                  fullWidth
                  multiline
                  slotProps={{ input: { readOnly: true } }}
                  sx={themedTextFieldSx}
                />
                <Autocomplete
                  multiple
                  options={shortlistOptions}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(o, v) => o.id === v.id}
                  value={shortlistOptions.filter((o) => proposedIds.includes(o.id))}
                  onChange={(_e, v) => {
                    setProposedIds(v.map((o) => o.id));
                    clear("proposedProviderIds");
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Proposed shortlist"
                      error={Boolean(errors.proposedProviderIds)}
                      helperText={
                        errors.proposedProviderIds ||
                        (proposedIds.length > 0 && proposedIds.length < 3 ? "RFQ normally invites at least three" : " ")
                      }
                      sx={themedTextFieldSx}
                    />
                  )}
                />
              </>
            ) : null}
            <TextField
              label="Details"
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                clear("details");
              }}
              error={Boolean(errors.details)}
              helperText={errors.details || " "}
              fullWidth
              multiline
              minRows={3}
              sx={themedTextFieldSx}
            />
            {!isChange && !isShortlist ? (
              <TextField
                label="Alternative process"
                value={alternative}
                onChange={(e) => {
                  setAlternative(e.target.value);
                  clear("alternative");
                }}
                error={Boolean(errors.alternative)}
                helperText={errors.alternative || "Optional"}
                fullWidth
                multiline
                minRows={2}
                sx={themedTextFieldSx}
              />
            ) : null}
          </div>
        </DialogContent>
        <DialogActions className="flex-wrap gap-2">
          <Button onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <GavelRounded />}
          >
            {busy ? "Sending…" : "Send to Contracts Committee"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** @param {unknown} list */
function shortlistNames(list) {
  return Array.isArray(list) ? list.map((p) => p?.name).filter(Boolean).join(", ") || null : null;
}

/**
 * @param {any} rec
 */
function pendingFields(rec) {
  const fields = [
    { label: "Recommendation", value: rec.kindLabel },
    { label: "Reason", value: rec.reasonLabel, wide: true },
    {
      label: "Recommended by",
      value: rec.recommendedBy
        ? [rec.recommendedBy.displayName, rec.recommendedBy.roleName, fmt(rec.createdAt)]
            .filter(Boolean)
            .join(" · ")
        : null,
    },
  ];
  if (rec.kind === RECOMMENDATION_KIND.CHANGE_PROVIDER) {
    fields.push(
      { label: "Current provider", value: rec.currentProvider?.name, wide: true },
      { label: "Proposed provider", value: rec.proposedProvider?.name, wide: true },
    );
  }
  if (rec.kind === RECOMMENDATION_KIND.CHANGE_SHORTLIST) {
    fields.push(
      { label: "Current shortlist", value: shortlistNames(rec.currentShortlist), full: true },
      { label: "Proposed shortlist", value: shortlistNames(rec.proposedShortlist), full: true },
    );
  }
  fields.push({ label: "Details", value: rec.details, full: true });
  if (rec.alternative) fields.push({ label: "Alternative process", value: rec.alternative, full: true });
  return fields;
}

/**
 * Recommendations to the Contracts Committee on this case, plus the committee's decision form.
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   recommendations: any[];
 *   canDecide: boolean;
 *   waitingForCommittee: boolean;
 *   onDecided: () => void | Promise<void>;
 * }} p
 */
export function OrgRecommendationsCard({
  projectId,
  procurementId,
  recommendations,
  canDecide,
  waitingForCommittee,
  onDecided,
}) {
  const { showToast } = useToast();
  const rows = Array.isArray(recommendations) ? recommendations : [];
  const pending = rows.find((r) => r.status === "PENDING") || null;
  const [comment, setComment, commentDraft] = useDraftState(
    `org:procurement:${procurementId}:recommendation:${pending?.id}:decision`,
    "",
    { enabled: Boolean(pending && canDecide), resetKey: pending?.id ?? null },
  );
  const [commentError, setCommentError] = useState("");
  const [confirm, setConfirm] = useState(/** @type {"APPROVE" | "DECLINE" | null} */ (null));
  const [busy, setBusy] = useState(false);

  if (!rows.length) return null;

  /** @param {"APPROVE" | "DECLINE"} decision */
  function ask(decision) {
    if (decision === "DECLINE" && !comment.trim()) {
      setCommentError("Enter the reason.");
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setCommentError("");
    setConfirm(decision);
  }

  async function decide() {
    if (!pending || !confirm) return;
    setBusy(true);
    try {
      const { ok, data } = await postAction(projectId, procurementId, {
        action: "decide_recommendation",
        recommendationId: pending.id,
        decision: confirm,
        comment: comment.trim(),
      });
      if (!ok) {
        if (data.fieldErrors?.comment) setCommentError(data.fieldErrors.comment);
        showToast({
          message: typeof data.error === "string" ? data.error : "Could not record the decision.",
          severity: "error",
        });
        return;
      }
      showToast({
        message: confirm === "APPROVE" ? "Recommendation approved." : "Recommendation declined.",
        severity: "success",
      });
      commentDraft.resetForm("");
      setConfirm(null);
      await onDecided();
    } finally {
      setBusy(false);
    }
  }

  const approveIsDestructive = pending?.kind === RECOMMENDATION_KIND.CANCEL;
  const pendingIsShortlist = pending?.kind === RECOMMENDATION_KIND.CHANGE_SHORTLIST;

  return (
    <Paper variant="outlined" sx={{ p: 2, ...adminOutlinedTableContainerSx }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} className="flex items-center gap-1">
          <GavelRounded fontSize="small" color="primary" aria-hidden />
          Recommendations to Contracts Committee
        </Typography>
        {pending ? (
          <Chip size="small" color="warning" label={RECOMMENDATION_STATUS_PRESENTATION.PENDING.label} />
        ) : null}
      </div>

      {pending ? <RecordDetailsGrid fields={pendingFields(pending)} /> : null}

      {pending && waitingForCommittee && !canDecide ? (
        <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
          Waiting for the Contracts Committee decision.
        </Alert>
      ) : null}

      {pending && canDecide ? (
        <div className="mt-3 grid gap-2">
          <TextField
            label="Committee comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setCommentError("");
            }}
            error={Boolean(commentError)}
            helperText={commentError || "Required to decline"}
            fullWidth
            multiline
            minRows={2}
            sx={themedTextFieldSx}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="contained"
              color={approveIsDestructive ? "error" : "success"}
              startIcon={<CheckCircleRounded />}
              disabled={busy}
              onClick={() => ask("APPROVE")}
            >
              {approveIsDestructive
                ? "Approve cancellation"
                : pendingIsShortlist
                  ? "Approve shortlist change"
                  : "Approve provider change"}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DoNotDisturbOnRounded />}
              disabled={busy}
              onClick={() => ask("DECLINE")}
            >
              Decline
            </Button>
          </div>
        </div>
      ) : null}

      <TableContainer component={Paper} variant="outlined" sx={{ ...adminOutlinedTableContainerSx, mt: 2 }}>
        <Table size="small" sx={{ ...adminTableSx, minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ whiteSpace: "nowrap" }}>Date</TableCell>
              <TableCell>Recommendation</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>By</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Decision</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const pres = RECOMMENDATION_STATUS_PRESENTATION[r.status] || {
                label: r.status,
                color: "info",
              };
              return (
                <TableRow key={r.id} hover sx={{ "& td": { verticalAlign: "top" } }}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{fmt(r.createdAt)}</TableCell>
                  <TableCell>
                    {r.kindLabel}
                    {r.proposedProvider?.name || shortlistNames(r.proposedShortlist) ? (
                      <Typography variant="caption" component="p" sx={adminMutedTextSx}>
                        To {r.proposedProvider?.name || shortlistNames(r.proposedShortlist)}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.reasonLabel}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {r.recommendedBy?.displayName || "—"}
                    </Typography>
                    {r.recommendedBy?.roleName ? (
                      <Typography variant="caption" sx={adminMutedTextSx}>
                        {r.recommendedBy.roleName}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={/** @type {any} */ (pres.color)} label={pres.label} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "pre-wrap", maxWidth: 280 }}>
                    {r.decidedBy?.displayName ? (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {r.decidedBy.displayName}
                        </Typography>
                        {actingRoleLabel(r.decidedBy) ? (
                          <Typography variant="caption" component="p" sx={adminMutedTextSx}>
                            {actingRoleLabel(r.decidedBy)}
                          </Typography>
                        ) : null}
                        <Typography variant="caption" component="p" sx={adminMutedTextSx}>
                          {fmt(r.decidedAt)}
                        </Typography>
                        {r.decisionComment ? <span className="text-sm">{r.decisionComment}</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={Boolean(confirm)}
        onClose={() => (busy ? null : setConfirm(null))}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
        aria-labelledby="decide-rec-title"
      >
        <DialogTitle id="decide-rec-title">
          {confirm === "DECLINE"
            ? "Decline recommendation?"
            : approveIsDestructive
              ? "Cancel this procurement?"
              : pendingIsShortlist
                ? "Change the approved shortlist?"
                : "Change the approved provider?"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirm === "DECLINE"
              ? "The officer continues with the current step."
              : approveIsDestructive
                ? "The procurement is cancelled and its budget commitment released. This cannot be undone."
                : pendingIsShortlist
                  ? `RFQs will go to ${shortlistNames(pending?.proposedShortlist) || "the proposed providers"}.`
                  : `The purchase instruction will go to ${pending?.proposedProvider?.name || "the proposed provider"}.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={busy}>
            Back
          </Button>
          <Button
            variant="contained"
            color={confirm === "DECLINE" || approveIsDestructive ? "error" : "success"}
            disabled={busy}
            onClick={() => void decide()}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {busy ? "Saving…" : confirm === "DECLINE" ? "Decline" : "Approve"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
