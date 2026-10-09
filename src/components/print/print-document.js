"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { format, isValid } from "date-fns";
import Button from "@mui/material/Button";
import PrintRounded from "@mui/icons-material/PrintRounded";
import { APP_BRAND_LABEL, APP_NAME, ORG_SHORT } from "@/lib/appConfig";

const noopSubscribe = () => () => {};

/** @param {unknown} value */
function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return isValid(d) ? d : null;
}

/** @param {unknown} value */
export function formatPrintDate(value) {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy") : "—";
}

/** @param {unknown} value */
export function formatPrintDateTime(value) {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy HH:mm") : "—";
}

/**
 * @typedef {{ label: string; value?: import("react").ReactNode; full?: boolean }} PrintField
 * @typedef {{ id: string; label: string; align?: "left" | "right" | "center"; width?: string }} PrintColumn
 * @typedef {{ key: string | number; cells: Record<string, import("react").ReactNode>; note?: string | null }} PrintRow
 * @typedef {
 *   | { type: "fields"; title: string; fields: PrintField[] }
 *   | { type: "table"; title: string; columns: PrintColumn[]; rows: PrintRow[]; empty?: string; footer?: { label: string; value: import("react").ReactNode } }
 *   | { type: "text"; title: string; text: string }
 * } PrintSection
 * @typedef {{ label: string; name?: string | null; role?: string | null; date?: unknown }} PrintSignature
 */

const CELL = "border border-black px-1.5 py-1 align-top";
const SECTION_HEAD = "border border-black bg-zinc-200 px-1.5 py-1 text-center text-[11pt] font-bold";

/** @param {{ title: string; colSpan: number }} p */
function SectionHead({ title, colSpan }) {
  return (
    <tr>
      <th colSpan={colSpan} className={SECTION_HEAD}>
        {title}
      </th>
    </tr>
  );
}

/** @param {{ section: Extract<PrintSection, { type: "fields" }> }} p */
function FieldsSection({ section }) {
  /** @type {PrintField[][]} */
  const rows = [];
  let pair = [];
  for (const f of section.fields) {
    if (f.full) {
      if (pair.length) rows.push(pair);
      rows.push([f]);
      pair = [];
      continue;
    }
    pair.push(f);
    if (pair.length === 2) {
      rows.push(pair);
      pair = [];
    }
  }
  if (pair.length) rows.push(pair);

  return (
    <table className="print-section w-full border-collapse">
      <colgroup>
        <col style={{ width: "18%" }} />
        <col style={{ width: "32%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "32%" }} />
      </colgroup>
      <tbody>
        <SectionHead title={section.title} colSpan={4} />
        {rows.map((r, i) => (
          <tr key={i}>
            {r.length === 1 ? (
              <>
                <td className={`${CELL} font-semibold`}>{r[0].label}</td>
                <td className={`${CELL} whitespace-pre-wrap`} colSpan={3}>
                  {r[0].value || "—"}
                </td>
              </>
            ) : (
              r.map((f) => (
                <FieldPair key={f.label} field={f} />
              ))
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** @param {{ field: PrintField }} p */
function FieldPair({ field }) {
  return (
    <>
      <td className={`${CELL} font-semibold`}>{field.label}</td>
      <td className={CELL}>{field.value || "—"}</td>
    </>
  );
}

/** @param {{ section: Extract<PrintSection, { type: "table" }> }} p */
function TableSection({ section }) {
  const span = section.columns.length;
  return (
    <table className="print-section w-full border-collapse">
      <thead>
        <SectionHead title={section.title} colSpan={span} />
        <tr>
          {section.columns.map((c) => (
            <th
              key={c.id}
              className={`${CELL} font-bold`}
              style={{ textAlign: c.align || "left", width: c.width }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {section.rows.length === 0 ? (
          <tr>
            <td className={CELL} colSpan={span}>
              {section.empty || "None."}
            </td>
          </tr>
        ) : (
          section.rows.map((row) => (
            <PrintTableRow key={row.key} row={row} columns={section.columns} />
          ))
        )}
        {section.footer ? (
          <tr>
            <td className={`${CELL} text-right font-bold`} colSpan={Math.max(1, span - 1)}>
              {section.footer.label}
            </td>
            <td className={`${CELL} text-right font-bold`}>{section.footer.value}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** @param {{ row: PrintRow; columns: PrintColumn[] }} p */
function PrintTableRow({ row, columns }) {
  const note = String(row.note || "").trim();
  return (
    <>
      <tr className="print-avoid-break">
        {columns.map((c) => (
          <td key={c.id} className={CELL} style={{ textAlign: c.align || "left" }}>
            {row.cells[c.id] ?? "—"}
          </td>
        ))}
      </tr>
      {note ? (
        <tr className="print-avoid-break">
          <td className={CELL} />
          <td className={`${CELL} whitespace-pre-wrap text-[9pt] italic`} colSpan={columns.length - 1}>
            {note}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** @param {{ section: Extract<PrintSection, { type: "text" }> }} p */
function TextSection({ section }) {
  return (
    <table className="print-section w-full border-collapse">
      <tbody>
        <SectionHead title={section.title} colSpan={1} />
        <tr>
          <td className={`${CELL} whitespace-pre-wrap`}>{section.text || "—"}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** @param {string | null | undefined} name */
export function signatureInitials(name) {
  const parts = String(name || "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  return parts.length ? `${parts.map((w) => w[0].toUpperCase()).join(".")}.` : "";
}

/** @param {{ signatures: PrintSignature[] }} p */
function SignaturesSection({ signatures }) {
  const perRow = Math.min(signatures.length, 3);
  /** @type {PrintSignature[][]} */
  const rows = [];
  for (let i = 0; i < signatures.length; i += perRow) rows.push(signatures.slice(i, i + perRow));
  return (
    <table className="print-section print-avoid-break w-full border-collapse">
      <tbody>
        <SectionHead title="Sign-off" colSpan={perRow} />
        {rows.map((sigs, r) => (
        <tr key={r}>
          {sigs.map((s, i) => (
            <td key={`${s.label}-${i}`} className={CELL} style={{ width: `${100 / perRow}%` }}>
              <p className="font-bold">{s.label}</p>
              <p>Name: {s.name || "—"}</p>
              <p>Role: {s.role || "—"}</p>
              <p>Date: {s.date ? formatPrintDate(s.date) : "—"}</p>
              {signatureInitials(s.name) ? (
                <p className="mt-5">
                  Signature:{" "}
                  <span className="inline-block min-w-32 border-b border-black px-1 font-serif text-[13pt] italic">
                    {signatureInitials(s.name)}
                  </span>
                </p>
              ) : (
                <p className="mt-5">Signature: ____________________</p>
              )}
            </td>
          ))}
        </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Formal A4 print / PDF layout shared by every printable organisation record.
 * Rendered off-screen in a body portal; only visible when printing.
 *
 * @param {{
 *   documentTitle: string;
 *   reference?: string | null;
 *   status?: string | null;
 *   organisation: { name: string; code?: string | null };
 *   sections: PrintSection[];
 *   signatures?: PrintSignature[];
 *   printedBy?: { name?: string | null; role?: string | null } | null;
 * }} p
 */
export function PrintDocument({
  documentTitle,
  reference,
  status,
  organisation,
  sections,
  signatures = [],
  printedBy,
}) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [printedAt, setPrintedAt] = useState(() => new Date());

  useEffect(() => {
    const onBefore = () => setPrintedAt(new Date());
    window.addEventListener("beforeprint", onBefore);
    return () => window.removeEventListener("beforeprint", onBefore);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="print-portal" aria-hidden>
      <div className="print-page bg-white font-sans text-[10pt] leading-snug text-black">
        <div className="brand-tricolor-stripe mb-2 h-1.5" />
        <table className="print-section w-full border-collapse">
          <tbody>
            <tr>
              <td className={`${CELL} w-[22%]`}>
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/mubs.png" alt="" className="h-10 w-10 object-contain" />
                  <div>
                    <p className="text-[8pt] font-bold">{ORG_SHORT}</p>
                    <p className="text-[11pt] font-extrabold text-[#008bd0]">{APP_NAME}</p>
                  </div>
                </div>
              </td>
              <td className={`${CELL} text-center`}>
                <p className="text-[14pt] font-extrabold uppercase">{organisation.name || "—"}</p>
                {organisation.code ? <p className="text-[9pt]">Org code: {organisation.code}</p> : null}
                <p className="mt-1 text-[12pt] font-bold uppercase">{documentTitle}</p>
              </td>
              <td className={`${CELL} w-[22%] text-[9pt]`}>
                <p>
                  <span className="font-semibold">Ref:</span> {reference || "—"}
                </p>
                <p>
                  <span className="font-semibold">Status:</span> {status || "—"}
                </p>
                <p>
                  <span className="font-semibold">Printed:</span> {formatPrintDateTime(printedAt)}
                </p>
              </td>
            </tr>
          </tbody>
        </table>

        {sections.map((s) =>
          s.type === "fields" ? (
            <FieldsSection key={s.title} section={s} />
          ) : s.type === "table" ? (
            <TableSection key={s.title} section={s} />
          ) : (
            <TextSection key={s.title} section={s} />
          ),
        )}

        {signatures.length ? <SignaturesSection signatures={signatures} /> : null}

        <p className="mt-2 text-center text-[8pt]">
          Printed by {printedBy?.name || "—"}
          {printedBy?.role ? ` (${printedBy.role})` : ""} on {formatPrintDateTime(printedAt)} ·{" "}
          {APP_BRAND_LABEL}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Opens the browser print dialog (Save as PDF supported) with a meaningful file name.
 * @param {{ fileName?: string; disabled?: boolean }} p
 */
export function PrintButton({ fileName, disabled = false }) {
  function print() {
    const previous = document.title;
    if (fileName) document.title = fileName;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  return (
    <Button
      variant="outlined"
      startIcon={<PrintRounded />}
      onClick={print}
      disabled={disabled}
      title="Print or save as PDF"
    >
      Print
    </Button>
  );
}
