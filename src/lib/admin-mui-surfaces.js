/**
 * MUI `sx` helpers so Paper/Dialog/Table surfaces follow app tokens
 * (`globals.css` on `html` / `body`, toggled with `.dark`), not MUI’s default light palette.
 */

export const adminPaperSx = {
  bgcolor: "var(--background)",
  color: "var(--foreground)",
  backgroundImage: "none",
};

export const adminOutlinedTableContainerSx = {
  ...adminPaperSx,
  borderColor: "color-mix(in oklab, var(--foreground) 16%, transparent)",
};

export const adminDialogPaperSx = {
  ...adminPaperSx,
  "& .MuiDialogTitle-root": { color: "var(--foreground)" },
  "& .MuiDialogContent-root": { color: "var(--foreground)" },
  "& .MuiDialogActions-root": {
    borderTop: "1px solid color-mix(in oklab, var(--foreground) 12%, transparent)",
    "& .MuiButton-text": { color: "var(--foreground)" },
  },
  "& .MuiFormControlLabel-label": { color: "var(--foreground)" },
};

/** MUI TextField / Select: follow `globals.css` tokens (light/dark via `html.dark`). */
export const themedTextFieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "var(--background)",
    color: "var(--foreground)",
  },
  "& .MuiInputBase-input": {
    color: "var(--foreground)",
  },
  "& .MuiInputBase-input::placeholder": {
    color: "color-mix(in oklab, var(--foreground) 45%, transparent)",
    opacity: 1,
  },
  "& .MuiInputLabel-root": {
    color: "color-mix(in oklab, var(--foreground) 62%, transparent)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "color-mix(in oklab, var(--foreground) 78%, transparent)",
  },
  "& .MuiSelect-icon": {
    color: "var(--foreground)",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in oklab, var(--foreground) 18%, transparent)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in oklab, var(--foreground) 28%, transparent)",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--brand-blue)",
  },
  "& .MuiFormHelperText-root": {
    color: "color-mix(in oklab, var(--foreground) 55%, transparent)",
  },
};

export const adminTableSx = {
  color: "var(--foreground)",
  "& .MuiTableCell-root": {
    color: "var(--foreground)",
    borderColor: "color-mix(in oklab, var(--foreground) 12%, transparent)",
  },
  "& .MuiTableCell-head": {
    fontWeight: 600,
    borderBottomColor: "color-mix(in oklab, var(--brand-blue) 35%, transparent)",
    bgcolor: "color-mix(in oklab, var(--brand-blue) 8%, var(--background))",
    color: "var(--foreground)",
  },
  "& .MuiTableCell-body": {
    borderBottomColor: "color-mix(in oklab, var(--foreground) 10%, transparent)",
  },
  "& .MuiTableRow-root:hover .MuiTableCell-body": {
    bgcolor: "color-mix(in oklab, var(--foreground) 5%, transparent)",
  },
};

/** Muted copy on admin surfaces (replaces `color="text.secondary"` with theme tokens). */
export const adminMutedTextSx = {
  color: "color-mix(in oklab, var(--foreground) 70%, transparent)",
};

/** Centered loading region for admin lists (initial fetch or empty state while loading). */
export const adminCenteredLoadingBoxSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "min(42vh, 300px)",
  width: "100%",
  py: 6,
};

/** Spinner tint: readable on light/dark backgrounds using app tokens + brand accent. */
export const adminLoadingSpinnerSx = {
  color: "var(--brand-blue)",
};

/** Semi-opaque overlay centered over a table during silent refetch. Parent needs `position: "relative"`. */
export const adminTableRefetchOverlaySx = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  bgcolor: "color-mix(in oklab, var(--background) 72%, transparent)",
  backdropFilter: "blur(2px)",
  zIndex: 1,
  borderRadius: "inherit",
};
