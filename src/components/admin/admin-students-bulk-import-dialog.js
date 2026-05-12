"use client";

import { useCallback, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import {
  adminDialogPaperSx,
  adminLoadingSpinnerSx,
  adminMutedTextSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
} from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";

/**
 * @param {{ open: boolean; onClose: () => void; onImported: () => void }} props
 */
export function AdminStudentsBulkImportDialog({ open, onClose, onImported }) {
  const { showToast } = useToast();
  const fileRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [headerErrors, setHeaderErrors] = useState(/** @type {string[]} */ ([]));
  const [sheetError, setSheetError] = useState("");
  const [previewRows, setPreviewRows] = useState(/** @type {any[]} */ ([]));
  const [valid, setValid] = useState(false);
  const [payloads, setPayloads] = useState(/** @type {any[]} */ ([]));
  const [confirmSend, setConfirmSend] = useState(false);

  const reset = useCallback(() => {
    setHeaderErrors([]);
    setSheetError("");
    setPreviewRows([]);
    setValid(false);
    setPayloads([]);
    setConfirmSend(false);
    setBusy(false);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = () => {
    if (busy || importing) return;
    reset();
    onClose();
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/admin/students/bulk/template", { credentials: "include" });
      if (!res.ok) {
        showToast({ message: "Could not download template.", severity: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "students-import-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast({ message: "Could not download template.", severity: "error" });
    }
  };

  const parseFile = async (file) => {
    setBusy(true);
    setHeaderErrors([]);
    setSheetError("");
    setPreviewRows([]);
    setValid(false);
    setPayloads([]);
    setConfirmSend(false);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/students/bulk/validate", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Validation request failed.",
          severity: "error",
        });
        return;
      }
      if (Array.isArray(data.headerErrors) && data.headerErrors.length > 0) {
        setHeaderErrors(data.headerErrors);
        return;
      }
      if (typeof data.sheetError === "string" && data.sheetError) {
        setSheetError(data.sheetError);
        return;
      }
      setPreviewRows(Array.isArray(data.rows) ? data.rows : []);
      setValid(Boolean(data.valid));
      if (data.valid && Array.isArray(data.rows)) {
        setPayloads(data.rows.map((r) => r.payload).filter(Boolean));
      }
    } catch {
      showToast({ message: "Could not read the file.", severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!valid || payloads.length === 0 || !confirmSend) {
      showToast({
        message: "Confirm sending activation emails before importing.",
        severity: "error",
      });
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/admin/students/bulk/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloads }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof data.error === "string" ? data.error : "Import failed.",
          severity: "error",
        });
        return;
      }
      const n = typeof data.created === "number" ? data.created : 0;
      const fails = Array.isArray(data.activationFailures) ? data.activationFailures : [];
      showToast({
        message:
          fails.length === 0
            ? `Imported ${n} student(s). Activation emails sent.`
            : `Imported ${n} student(s). Activation email failed for: ${fails.join(", ")}.`,
        severity: fails.length === 0 ? "success" : "error",
        duration: fails.length === 0 ? 6000 : 12000,
      });
      reset();
      onImported();
      onClose();
    } catch {
      showToast({ message: "Import failed.", severity: "error" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="lg"
      scroll="paper"
      slotProps={{ paper: { sx: adminDialogPaperSx } }}
    >
      <DialogTitle sx={{ color: "var(--foreground)" }}>Import students from Excel</DialogTitle>
      <DialogContent dividers className="flex flex-col gap-4">
        <Typography variant="body2" sx={adminMutedTextSx}>
          Download the template for column headers and one sample row. Fill your rows under the header, then
          upload. We validate programmes (by short name), school emails, academic years, and duplicates before
          you confirm.
        </Typography>
        <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outlined"
            startIcon={<DownloadRounded />}
            onClick={() => void downloadTemplate()}
            disabled={busy || importing}
            className="w-full sm:w-auto"
          >
            Download template
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void parseFile(f);
            }}
          />
          <Button
            type="button"
            variant="contained"
            startIcon={<UploadFileRounded />}
            onClick={() => fileRef.current?.click()}
            disabled={busy || importing}
            className="w-full sm:w-auto"
          >
            Choose Excel file
          </Button>
        </div>

        {busy ? (
          <Box className="flex justify-center py-8" aria-busy="true" aria-label="Validating file">
            <CircularProgress size={40} sx={adminLoadingSpinnerSx} />
          </Box>
        ) : null}

        {headerErrors.length > 0 ? (
          <Paper variant="outlined" sx={{ ...adminOutlinedTableContainerSx, p: 2 }}>
            <Typography variant="subtitle2" sx={{ color: "var(--foreground)", mb: 1 }}>
              Fix these header issues
            </Typography>
            <ul className="list-disc space-y-1 pl-5">
              {headerErrors.map((h) => (
                <li key={h}>
                  <Typography variant="body2" sx={adminMutedTextSx}>
                    {h}
                  </Typography>
                </li>
              ))}
            </ul>
          </Paper>
        ) : null}

        {sheetError ? (
          <Typography variant="body2" sx={{ color: "var(--foreground)" }}>
            {sheetError}
          </Typography>
        ) : null}

        {previewRows.length > 0 ? (
          <>
            <Typography variant="subtitle2" sx={{ color: "var(--foreground)" }}>
              Preview {valid ? "(ready to import)" : "(fix errors below)"}
            </Typography>
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                ...adminOutlinedTableContainerSx,
                maxHeight: "min(55vh, 420px)",
                overflow: "auto",
              }}
            >
              <Table size="small" stickyHeader sx={adminTableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell>Row</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Student #</TableCell>
                    <TableCell>Programme short</TableCell>
                    <TableCell>Year</TableCell>
                    <TableCell>Academic year</TableCell>
                    <TableCell>Issues</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell>{r.preview?.email}</TableCell>
                      <TableCell>
                        {[r.preview?.firstName, r.preview?.lastName].filter(Boolean).join(" ")}
                      </TableCell>
                      <TableCell>{r.preview?.studentNumber}</TableCell>
                      <TableCell>{r.preview?.programmeShortName}</TableCell>
                      <TableCell>{r.preview?.yearOfStudy}</TableCell>
                      <TableCell>{r.preview?.academicYearLabel}</TableCell>
                      <TableCell sx={{ maxWidth: 280, whiteSpace: "normal" }}>
                        {r.errors?.length ? (
                          <Typography variant="caption" component="span" color="error">
                            {r.errors.join(" · ")}
                          </Typography>
                        ) : (
                          <Typography variant="caption" sx={adminMutedTextSx}>
                            OK
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {valid ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={confirmSend}
                    onChange={(e) => setConfirmSend(e.target.checked)}
                    disabled={importing}
                    sx={{
                      color: "color-mix(in oklab, var(--foreground) 52%, transparent)",
                      "&.Mui-checked": { color: "#008bd0" },
                    }}
                  />
                }
                label="I confirm activation emails will be sent to every imported address."
                sx={{ color: "var(--foreground)", alignItems: "flex-start", mr: 0 }}
              />
            ) : null}
          </>
        ) : null}
      </DialogContent>
      <DialogActions className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
        <Button type="button" onClick={handleClose} disabled={busy || importing} className="w-full sm:w-auto">
          Close
        </Button>
        <Button
          type="button"
          variant="contained"
          disabled={!valid || !confirmSend || importing || busy}
          onClick={() => void runImport()}
          className="w-full sm:w-auto"
        >
          {importing ? <CircularProgress size={22} color="inherit" aria-hidden /> : "Confirm import"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
