"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useDraftState } from "@/hooks/use-draft-state";
import { adminDialogPaperSx, themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { OrgOnBehalfProviderAction } from "@/components/projects/org-on-behalf-provider-action";
import { SubmissionSourceChip } from "@/components/projects/org-procurement-supply-cards";
import { LIFECYCLE_ACTION_ROLES } from "@/lib/projects/procurement-lifecycle-roles";

const LIVE = new Set(["SUBMITTED", "OPENED"]);

/**
 * Ask a provider to clarify its quotation / bid (until evaluation starts).
 * @param {{
 *   projectId: string;
 *   procurementId: string;
 *   offer: any;
 *   allowed: boolean;
 *   onChanged: () => Promise<void> | void;
 * }} p
 */
export function OfferClarifyButton({ projectId, procurementId, offer, allowed, onChanged }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [question, setQuestion, questionDraft] = useDraftState(
    `org:procurement:${procurementId}:offer:${offer?.id}:clarify`,
    "",
    { enabled: open, resetKey: open },
  );
  const [error, setError] = useState("");

  function handleCancel() {
    questionDraft.clearDraft();
    setOpen(false);
  }
  const [busy, setBusy] = useState(false);
  const name = offer?.supplier?.name || "provider";
  const openQuestion = (offer?.clarifications || []).some((c) => !c.respondedAt);
  const canAsk = allowed && LIVE.has(offer?.status) && !openQuestion;

  async function submit(e) {
    e.preventDefault();
    const q = question.trim();
    const msg = q.length < 5 ? "Enter the question." : q.length > 1000 ? "Too long." : "";
    setError(msg);
    if (msg) {
      showToast({ message: "Please fix the highlighted fields.", severity: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/procurements/${procurementId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask_clarification", offerId: offer.id, question: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors?.question) setError(data.fieldErrors.question);
        showToast({ message: typeof data.error === "string" ? data.error : "Could not send the question.", severity: "error" });
        return;
      }
      showToast({ message: "Question sent.", severity: "success" });
      questionDraft.resetForm("");
      setOpen(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tooltip
        title={canAsk ? "Ask for clarification" : openQuestion ? "Waiting for an answer" : "Clarifications closed"}
      >
        <span>
          <IconButton
            size="small"
            color="primary"
            aria-label={`Ask ${name} for clarification`}
            disabled={!canAsk || busy}
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            <HelpOutlineRounded fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Dialog
        open={open}
        onClose={busy ? undefined : handleCancel}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: adminDialogPaperSx } }}
      >
        <form noValidate onSubmit={submit}>
          <DialogTitle>Ask {name} for clarification</DialogTitle>
          <DialogContent dividers>
            <TextField
              label="Question"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (error) setError("");
              }}
              error={Boolean(error)}
              helperText={error || " "}
              fullWidth
              multiline
              minRows={3}
              autoFocus
              sx={themedTextFieldSx}
            />
          </DialogContent>
          <DialogActions className="flex-wrap gap-2">
            <Button onClick={handleCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <HelpOutlineRounded />}
            >
              {busy ? "Sending…" : "Send question"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

/**
 * @param {{
 *   clarifications?: any[];
 *   projectId?: string;
 *   procurementId?: string;
 *   providerName?: string;
 *   viewerRole?: string | null;
 *   onChanged?: () => Promise<void> | void;
 * }} p
 */
export function OfferClarificationThread({
  clarifications,
  projectId,
  procurementId,
  providerName = "provider",
  viewerRole = null,
  onChanged,
}) {
  if (!clarifications?.length) return null;
  const canAnswerOnBehalf =
    Boolean(projectId && procurementId) &&
    (LIFECYCLE_ACTION_ROLES.on_behalf_answer_clarification || []).includes(viewerRole || "");
  return (
    <>
      {clarifications.map((c) => (
        <div key={c.id} className="w-full space-y-1 rounded-md bg-(--nav-active-bg) p-2 text-xs">
          <p className="wrap-break-word">
            <span className="font-semibold">Q:</span> {c.question}
          </p>
          <p className="wrap-break-word">
            <span className="font-semibold">A:</span>{" "}
            {c.response || <span className="italic opacity-70">Awaiting answer</span>}
            {c.response && c.responseSource ? (
              <span className="ml-2 inline-flex align-middle">
                <SubmissionSourceChip source={c.responseSource} />
              </span>
            ) : null}
          </p>
          {!c.response && canAnswerOnBehalf ? (
            <OrgOnBehalfProviderAction
              label="Answer on behalf"
              confirmLabel="Answer clarification on behalf"
              action="on_behalf_answer_clarification"
              projectId={projectId}
              procurementId={procurementId}
              providerName={providerName}
              formKind="clarification"
              clarificationId={c.id}
              onDone={onChanged}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}
