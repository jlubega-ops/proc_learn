"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  adminCenteredLoadingBoxSx,
  adminLoadingSpinnerSx,
  adminOutlinedTableContainerSx,
  adminTableSx,
  themedTextFieldSx,
} from "@/lib/admin-mui-surfaces";
import { BRAND_BTN_PRIMARY_CLASS, BRAND_TRICOLOR_STRIPE_CLASS } from "@/lib/brand-ui";
import { buildDepartmentTree } from "@/lib/projects/org-department-tree";

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
 *   organizationName?: string | null;
 *   projectName?: string | null;
 *   readOnly?: boolean;
 *   departmentsHref?: string;
 * }} props
 */
export function OrganisationStructurePanel({
  projectId,
  organizationName,
  projectName,
  readOnly = false,
  departmentsHref,
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState(/** @type {any[]} */ ([]));
  const [savedSignature, setSavedSignature] = useState("");

  const orgLabel =
    String(organizationName || "").trim() ||
    String(projectName || "").trim() ||
    "Organisation";

  const deptLink =
    departmentsHref ||
    (projectId ? `/projects/${projectId}/org-admin/departments` : "/organisation/org-admin/departments");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/org-departments?view=structure`,
        { credentials: "include" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message:
            typeof json.error === "string" ? json.error : "Could not load organisation structure.",
          severity: "error",
        });
        setUnits([]);
        setSavedSignature("");
        return;
      }
      const list = Array.isArray(json.units) ? json.units : [];
      const normalized = normalizeSiblingOrders(list);
      setUnits(normalized);
      setSavedSignature(structureSignature(normalized));
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => structureSignature(units) !== savedSignature,
    [units, savedSignature],
  );

  const tree = useMemo(() => buildDepartmentTree(units), [units]);

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
      const normalized = normalizeSiblingOrders(list);
      setUnits(normalized);
      setSavedSignature(structureSignature(normalized));
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

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] shadow-sm">
        <div className={BRAND_TRICOLOR_STRIPE_CLASS} aria-hidden />
        <div className="border-b border-[color:var(--border-subtle)] px-4 py-4 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            Your organisation hierarchy
          </p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            {orgLabel}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Arrange departments from top to bottom. Nest subunits under a top-level department using
            the parent dropdown
            {readOnly ? " (view only)." : "."}
          </p>
        </div>

        <div className="px-4 py-5 sm:px-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Preview
          </p>
          {!tree.length ? (
            <p className="rounded-xl border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
              No departments yet.{" "}
              <Link href={deptLink} className="font-semibold text-primary underline-offset-2 hover:underline">
                Create departments
              </Link>{" "}
              first, then return here to set the order.
            </p>
          ) : (
            <ul className="space-y-2">
              {tree.map((root) => (
                <li key={root.id}>
                  <div className="rounded-xl border border-t-[3px] border-[color:var(--border-subtle)] border-t-brand-blue bg-[color-mix(in_oklab,var(--brand-blue)_8%,var(--surface-elevated))] px-4 py-3">
                    <p className="font-bold text-foreground">{root.name}</p>
                    {root.description ? (
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        {root.description}
                      </p>
                    ) : null}
                  </div>
                  {(root.subunits || []).length > 0 ? (
                    <ul className="ml-4 mt-2 space-y-2 border-l border-dashed border-primary/30 pl-4 sm:ml-6">
                      {root.subunits.map((child) => (
                        <li
                          key={child.id}
                          className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3 py-2"
                        >
                          <p className="text-sm font-semibold text-foreground">{child.name}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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

      {units.length > 0 ? (
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
                        <FormControl fullWidth sx={themedTextFieldSx}>
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
                      {!readOnly && hasChildren ? (
                        <p className="mt-1 text-[11px] text-zinc-500">
                          Move subunits off this unit before nesting it.
                        </p>
                      ) : null}
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
      ) : null}
    </div>
  );
}
