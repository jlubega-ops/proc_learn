"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRounded from "@mui/icons-material/ArrowUpwardRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import { useToast } from "@/components/providers/toast-provider";
import { useApi } from "@/hooks/use-api";
import { revalidateApi } from "@/lib/api-client-cache";
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { BRAND_BTN_PRIMARY_CLASS } from "@/lib/brand-ui";

/**
 * @param {{ id: string; parentId: string | null; sortOrder: number }[]} units
 */
function structureSignature(units) {
  return JSON.stringify(
    [...units]
      .map((u) => ({
        id: u.id,
        parentId: u.parentId || null,
        sortOrder: u.sortOrder ?? 0,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

/**
 * Re-number sortOrder 0..n-1 within each sibling group.
 * @param {{ id: string; parentId: string | null; sortOrder: number; name?: string }[]} units
 */
function normalizeSiblingOrders(units) {
  const groups = new Map();
  for (const u of units) {
    const key = u.parentId || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  /** @type {typeof units} */
  const next = [];
  for (const [, siblings] of groups) {
    siblings.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        String(a.name || "").localeCompare(String(b.name || "")),
    );
    siblings.forEach((s, i) => {
      next.push({ ...s, sortOrder: i });
    });
  }
  return next;
}

/**
 * @param {{
 *   projectId: string;
 *   readOnly?: boolean;
 *   departmentsHref?: string;
 * }} props
 */
export function OrganisationStructurePanel({ projectId, readOnly = false, departmentsHref }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [draftUnits, setDraftUnits] = useState(/** @type {any[] | null} */ (null));

  const deptLink =
    departmentsHref ||
    (projectId ? `/projects/${projectId}/org-admin/departments` : "/organisation/org-admin/departments");

  const { data, loading, reload, mutate } = useApi(
    `/api/projects/${encodeURIComponent(projectId)}/org-departments?view=structure`,
    { errorMessage: "Could not load organisation structure." },
  );
  const serverUnits = useMemo(
    () => normalizeSiblingOrders(Array.isArray(data?.units) ? data.units : []),
    [data],
  );
  const units = draftUnits ?? serverUnits;
  const savedSignature = useMemo(() => structureSignature(serverUnits), [serverUnits]);

  /** @param {(prev: any[]) => any[]} update */
  const setUnits = useCallback(
    (update) => setDraftUnits((prev) => update(prev ?? serverUnits)),
    [serverUnits],
  );

  const load = useCallback(async () => {
    setDraftUnits(null);
    await reload();
  }, [reload]);

  const dirty = useMemo(
    () => structureSignature(units) !== savedSignature,
    [units, savedSignature],
  );

  const topLevelOptions = useMemo(
    () => units.filter((u) => !u.parentId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [units],
  );

  const orderedRows = useMemo(() => {
    const roots = units
      .filter((u) => !u.parentId)
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          String(a.name || "").localeCompare(String(b.name || "")),
      );
    /** @type {any[]} */
    const rows = [];
    for (const root of roots) {
      rows.push({ ...root, depth: 0 });
      const children = units
        .filter((u) => u.parentId === root.id)
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            String(a.name || "").localeCompare(String(b.name || "")),
        );
      for (const child of children) {
        rows.push({ ...child, depth: 1 });
      }
    }
    // Orphans (invalid draft) still listed
    const listed = new Set(rows.map((r) => r.id));
    for (const u of units) {
      if (!listed.has(u.id)) rows.push({ ...u, depth: 0 });
    }
    return rows;
  }, [units]);

  function setParent(unitId, parentId) {
    setUnits((prev) => {
      const next = prev.map((u) => {
        if (u.id !== unitId) return u;
        return { ...u, parentId: parentId || null };
      });
      return normalizeSiblingOrders(next);
    });
  }

  function moveSibling(unitId, direction) {
    setUnits((prev) => {
      const unit = prev.find((u) => u.id === unitId);
      if (!unit) return prev;
      const parentKey = unit.parentId || null;
      const siblings = prev
        .filter((u) => (u.parentId || null) === parentKey)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const idx = siblings.findIndex((s) => s.id === unitId);
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapWith < 0 || swapWith >= siblings.length) return prev;
      const a = siblings[idx];
      const b = siblings[swapWith];
      const orderA = a.sortOrder ?? idx;
      const orderB = b.sortOrder ?? swapWith;
      return normalizeSiblingOrders(
        prev.map((u) => {
          if (u.id === a.id) return { ...u, sortOrder: orderB };
          if (u.id === b.id) return { ...u, sortOrder: orderA };
          return u;
        }),
      );
    });
  }

  async function handleSave() {
    if (readOnly || saving || !dirty) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/org-departments/structure`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: units.map((u) => ({
              id: u.id,
              parentId: u.parentId || null,
              sortOrder: u.sortOrder ?? 0,
            })),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message: typeof json.error === "string" ? json.error : "Could not save structure.",
          severity: "error",
        });
        return;
      }
      const list = Array.isArray(json.units) ? json.units : [];
      await mutate({ ...data, units: list }, { revalidate: false });
      setDraftUnits(null);
      void revalidateApi(`/api/projects/${encodeURIComponent(projectId)}/org-`);
      showToast({ message: "Organisation structure saved.", severity: "success" });
    } catch {
      showToast({ message: "Could not save structure.", severity: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={adminCenteredLoadingBoxSx} role="status" aria-busy="true">
        <CircularProgress sx={adminLoadingSpinnerSx} />
      </Box>
    );
  }

  if (!units.length) {
    return (
      <p className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        No departments yet.{" "}
        <Link href={deptLink} className="font-semibold text-primary underline-offset-2 hover:underline">
          Create departments
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="cursor-pointer"
          startIcon={<RefreshRounded />}
          onClick={() => void load()}
          disabled={saving}
        >
          Refresh
        </Button>
        {!readOnly ? (
          <Button
            type="button"
            variant="contained"
            className={`${BRAND_BTN_PRIMARY_CLASS} cursor-pointer disabled:cursor-not-allowed`}
            startIcon={
              saving ? <CircularProgress size={14} color="inherit" /> : <SaveRounded />
            }
            disabled={!dirty || saving || !units.length}
            onClick={() => void handleSave()}
          >
            Save structure
          </Button>
        ) : null}
        {!readOnly && dirty ? (
          <Button
            type="button"
            className="cursor-pointer"
            onClick={() => void load()}
            disabled={saving}
          >
            Reset
          </Button>
        ) : null}
      </div>

      <TableContainer sx={adminOutlinedTableContainerSx}>
          <Table size="small" sx={adminTableSx}>
            <TableHead>
              <TableRow>
                <TableCell>Unit</TableCell>
                <TableCell>Parent</TableCell>
                <TableCell align="right">Order</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orderedRows.map((row) => {
                const siblings = units
                  .filter((u) => (u.parentId || null) === (row.parentId || null))
                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                const sibIdx = siblings.findIndex((s) => s.id === row.id);
                const parentChoices = topLevelOptions.filter((o) => o.id !== row.id);
                const hasChildren = units.some((u) => u.parentId === row.id);

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div
                        className={row.depth ? "pl-4 text-sm sm:pl-6" : "font-medium"}
                        style={row.depth ? undefined : undefined}
                      >
                        {row.depth ? (
                          <span className="text-zinc-500">↳ </span>
                        ) : null}
                        {row.name}
                      </div>
                      {!row.isActive ? (
                        <span className="text-xs text-brand-red">Inactive</span>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      {readOnly ? (
                        <span className="text-sm">
                          {row.parentId
                            ? units.find((u) => u.id === row.parentId)?.name || "—"
                            : "Top level"}
                        </span>
                      ) : (
                        <FormControl
                          fullWidth
                          sx={themedTextFieldSx}
                          title={hasChildren ? "Has subunits" : undefined}
                        >
                          <InputLabel id={`parent-${row.id}`}>Parent</InputLabel>
                          <Select
                            labelId={`parent-${row.id}`}
                            label="Parent"
                            value={row.parentId || ""}
                            disabled={hasChildren}
                            onChange={(e) => {
                              const v = String(e.target.value || "");
                              setParent(row.id, v || null);
                            }}
                          >
                            <MenuItem value="">Top level</MenuItem>
                            {parentChoices.map((p) => (
                              <MenuItem key={p.id} value={p.id}>
                                {p.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!readOnly ? (
                        <div className="inline-flex flex-nowrap">
                          <Tooltip title="Move up">
                            <span>
                              <IconButton
                                size="small"
                                className="cursor-pointer disabled:cursor-not-allowed"
                                disabled={sibIdx <= 0 || saving}
                                aria-label={`Move ${row.name} up`}
                                onClick={() => moveSibling(row.id, "up")}
                              >
                                <ArrowUpwardRounded fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move down">
                            <span>
                              <IconButton
                                size="small"
                                className="cursor-pointer disabled:cursor-not-allowed"
                                disabled={sibIdx < 0 || sibIdx >= siblings.length - 1 || saving}
                                aria-label={`Move ${row.name} down`}
                                onClick={() => moveSibling(row.id, "down")}
                              >
                                <ArrowDownwardRounded fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </div>
                      ) : (
                        <span className="text-sm text-zinc-500">{(row.sortOrder ?? 0) + 1}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
    </div>
  );
}
