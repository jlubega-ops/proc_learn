/**
 * Structured organisation document PDFs — branded layout with To block,
 * report-card status, and full field grids (empty fields shown as —).
 */

import { BRAND_BLUE, BRAND_RED, BRAND_YELLOW, SEMANTIC } from "@/lib/brand-colors";

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** @type {Record<string, [number, number, number]>} */
const STATUS_RGB = {
  success: hexToRgb(SEMANTIC.success),
  error: hexToRgb(BRAND_RED),
  warning: [184, 148, 0],
  info: hexToRgb(BRAND_BLUE),
  primary: hexToRgb(BRAND_BLUE),
};

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/**
 * @param {unknown} value
 */
export function pdfFieldValue(value) {
  if (value === null || value === undefined) return "—";
  const t = String(value).trim();
  return t || "—";
}

/**
 * Safe filename from a reference number.
 * @param {string | null | undefined} referenceNumber
 * @param {string} [fallback]
 */
export function orgPdfFilename(referenceNumber, fallback = "document") {
  const ref = String(referenceNumber || "").trim();
  const base = ref || fallback;
  return base
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

/**
 * @typedef {Object} OrgPdfField
 * @property {string} label
 * @property {unknown} [value]
 */

/**
 * @typedef {Object} OrgPdfTable
 * @property {string[]} headers
 * @property {unknown[][]} rows
 */

/**
 * @typedef {Object} OrgPdfSection
 * @property {string} [title]
 * @property {OrgPdfField[]} [fields]
 * @property {OrgPdfTable} [table]
 * @property {string} [paragraph]
 */

/**
 * @typedef {Object} OrgDocumentPdfSpec
 * @property {string} referenceNumber
 * @property {string} documentTitle
 * @property {string} [documentSubtitle]
 * @property {string} [organisationName]
 * @property {string} [departmentName]
 * @property {string} [departmentCode]
 * @property {string} [financialYear]
 * @property {string} [toLabel]
 * @property {{ label: string; stage?: string; color?: string }} [status]
 * @property {OrgPdfSection[]} sections
 * @property {string} [footerNote]
 * @property {boolean} [draftIncomplete]
 */

/**
 * Render and download a structured organisation PDF.
 * @param {OrgDocumentPdfSpec} spec
 */
export async function downloadOrgDocumentPdf(spec) {
  if (typeof document === "undefined") return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const ensureSpace = (needed = 16) => {
    if (y + needed > PAGE_H - MARGIN - 24) {
      doc.addPage();
      y = MARGIN;
      drawPageFooter(doc, spec);
    }
  };

  y = drawPageHeader(doc, spec, y);
  y = drawToBlock(doc, spec, y, ensureSpace);
  if (spec.status?.label) {
    y = drawStatusReportCard(doc, spec.status, y, ensureSpace);
  }
  y = drawDocumentTitleBlock(doc, spec, y, ensureSpace);

  for (const section of spec.sections || []) {
    y = drawSection(doc, section, y, ensureSpace);
  }

  drawPageFooter(doc, spec);
  doc.save(`${orgPdfFilename(spec.referenceNumber, "document")}.pdf`);
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {OrgDocumentPdfSpec} spec
 * @param {number} y
 */
function drawPageHeader(doc, spec, y) {
  const blue = hexToRgb(BRAND_BLUE);
  const yellow = hexToRgb(BRAND_YELLOW);
  const red = hexToRgb(BRAND_RED);

  doc.setLineWidth(3);
  doc.setDrawColor(...blue);
  doc.line(MARGIN, y, MARGIN + 50, y);
  doc.setDrawColor(...yellow);
  doc.line(MARGIN + 50, y, MARGIN + 100, y);
  doc.setDrawColor(...red);
  doc.line(MARGIN + 100, y, MARGIN + 150, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...blue);
  doc.text("Proc Learn", MARGIN, y);

  const ref = pdfFieldValue(spec.referenceNumber);
  if (ref !== "—") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(82, 82, 91);
    const refLabel = `Ref: ${ref}`;
    const refW = doc.getTextWidth(refLabel);
    doc.text(refLabel, PAGE_W - MARGIN - refW, y - 2);
  }
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text("Makerere University Business School · Organisation simulator", MARGIN, y);
  y += 18;

  return y;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {OrgDocumentPdfSpec} spec
 * @param {number} y
 * @param {(n?: number) => void} ensureSpace
 */
function drawToBlock(doc, spec, y, ensureSpace) {
  ensureSpace(52);
  const org = pdfFieldValue(spec.organisationName);
  const dept = pdfFieldValue(spec.departmentName);
  const deptCode = spec.departmentCode ? ` (${spec.departmentCode})` : "";
  const fy = pdfFieldValue(spec.financialYear);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, y, CONTENT_W, 44, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...hexToRgb(BRAND_BLUE));
  doc.text(String(spec.toLabel || "TO").toUpperCase(), MARGIN + 10, y + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(24, 24, 27);
  doc.text(org === "—" ? "Organisation" : org, MARGIN + 10, y + 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(63, 63, 70);
  const deptLine =
    dept !== "—" ? `${dept}${deptCode}` : deptCode ? deptCode.trim() : "Department —";
  const metaLine = fy !== "—" ? `${deptLine} · FY ${fy}` : deptLine;
  doc.text(metaLine, MARGIN + 10, y + 36);

  return y + 52;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {{ label: string; stage?: string; color?: string }} status
 * @param {number} y
 * @param {(n?: number) => void} ensureSpace
 */
function drawStatusReportCard(doc, status, y, ensureSpace) {
  ensureSpace(40);
  const cardH = 34;
  const cardW = Math.min(CONTENT_W, 360);
  const accent = STATUS_RGB[String(status.color || "info").toLowerCase()] || STATUS_RGB.info;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, y, cardW, cardH, "FD");

  doc.setLineWidth(3);
  doc.setDrawColor(...accent);
  doc.line(MARGIN, y, MARGIN, y + cardH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...accent);
  doc.text("STATUS", MARGIN + 12, y + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  const labelLines = doc.splitTextToSize(pdfFieldValue(status.label), cardW - 24);
  doc.text(labelLines, MARGIN + 12, y + 24);

  if (status.stage) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    const stageText = `Stage: ${pdfFieldValue(status.stage)}`;
    const stageW = doc.getTextWidth(stageText);
    doc.text(stageText, MARGIN + cardW - stageW - 8, y + 24);
  }

  return y + cardH + 10;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {OrgDocumentPdfSpec} spec
 * @param {number} y
 * @param {(n?: number) => void} ensureSpace
 */
function drawDocumentTitleBlock(doc, spec, y, ensureSpace) {
  ensureSpace(56);
  doc.setDrawColor(...hexToRgb(BRAND_BLUE));
  doc.setLineWidth(1);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...hexToRgb(BRAND_BLUE));
  const titleLines = doc.splitTextToSize(String(spec.documentTitle || "Document"), CONTENT_W);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 18;

  if (spec.documentSubtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(82, 82, 91);
    const subLines = doc.splitTextToSize(String(spec.documentSubtitle), CONTENT_W);
    doc.text(subLines, MARGIN, y + 4);
    y += subLines.length * 13 + 4;
  }

  if (spec.draftIncomplete) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(184, 148, 0);
    doc.text("Draft — some required fields are not yet complete.", MARGIN, y + 8);
    y += 18;
  }

  doc.setDrawColor(...hexToRgb(BRAND_BLUE));
  doc.line(MARGIN, y + 6, PAGE_W - MARGIN, y + 6);
  return y + 18;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {OrgPdfSection} section
 * @param {number} y
 * @param {(n?: number) => void} ensureSpace
 */
function drawSection(doc, section, y, ensureSpace) {
  if (section.title) {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...hexToRgb(BRAND_BLUE));
    doc.text(String(section.title), MARGIN, y);
    y += 16;
  }

  if (section.paragraph) {
    ensureSpace(20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(24, 24, 27);
    const lines = doc.splitTextToSize(String(section.paragraph), CONTENT_W);
    ensureSpace(lines.length * 13 + 8);
    doc.text(lines, MARGIN, y);
    y += lines.length * 13 + 10;
  }

  if (section.fields?.length) {
    y = drawFieldGrid(doc, section.fields, y, ensureSpace);
  }

  if (section.table?.headers?.length) {
    y = drawDataTable(doc, section.table, y, ensureSpace);
  }

  return y + 8;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {OrgPdfField[]} fields
 * @param {number} y
 * @param {(n?: number) => void} ensureSpace
 */
function drawFieldGrid(doc, fields, y, ensureSpace) {
  const gap = 8;
  const colW = (CONTENT_W - gap) / 2;
  const cardPad = 6;
  let index = 0;

  while (index < fields.length) {
    const left = fields[index];
    const right = fields[index + 1];
    const leftLabel = doc.splitTextToSize(String(left.label), colW - cardPad * 2);
    const leftValue = doc.splitTextToSize(pdfFieldValue(left.value), colW - cardPad * 2);
    const rightLabel = right
      ? doc.splitTextToSize(String(right.label), colW - cardPad * 2)
      : [];
    const rightValue = right
      ? doc.splitTextToSize(pdfFieldValue(right.value), colW - cardPad * 2)
      : [];
    const rowH = Math.max(
      34,
      (leftLabel.length + leftValue.length) * 10 + 10,
      (rightLabel.length + rightValue.length) * 10 + 10,
    );

    ensureSpace(rowH + 4);

    drawFieldCard(doc, MARGIN, y, colW, rowH, leftLabel, leftValue);
    if (right) {
      drawFieldCard(doc, MARGIN + colW + gap, y, colW, rowH, rightLabel, rightValue);
    }

    y += rowH + 6;
    index += 2;
  }

  return y + 2;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string[]} labelLines
 * @param {string[]} valueLines
 */
function drawFieldCard(doc, x, y, w, h, labelLines, valueLines) {
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);
  doc.rect(x, y, w, h, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(labelLines, x + 6, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(24, 24, 27);
  doc.text(valueLines, x + 6, y + 12 + labelLines.length * 9);
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {OrgPdfTable} table
 * @param {number} y
 * @param {(n?: number) => void} ensureSpace
 */
function drawDataTable(doc, table, y, ensureSpace) {
  const headers = table.headers || [];
  const rows = table.rows || [];
  if (!headers.length) return y;

  const colCount = headers.length;
  const colW = CONTENT_W / colCount;
  const headerH = 22;
  const rowPad = 6;

  ensureSpace(headerH + 4);
  doc.setFillColor(...hexToRgb(BRAND_BLUE));
  doc.rect(MARGIN, y, CONTENT_W, headerH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  headers.forEach((header, i) => {
    const cell = doc.splitTextToSize(String(header), colW - 8);
    doc.text(cell, MARGIN + i * colW + 6, y + 14);
  });
  y += headerH;

  rows.forEach((row, rowIndex) => {
    const cells = (row || []).map((cell) => pdfFieldValue(cell));
    const lineCounts = cells.map((cell, i) =>
      doc.splitTextToSize(cell, colW - 8).length,
    );
    const rowH = Math.max(20, Math.max(...lineCounts, 1) * 11 + rowPad * 2);
    ensureSpace(rowH);

    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
    }

    doc.setDrawColor(228, 228, 231);
    doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(24, 24, 27);
    cells.forEach((cell, i) => {
      const lines = doc.splitTextToSize(cell, colW - 8);
      doc.text(lines, MARGIN + i * colW + 6, y + rowPad + 10);
      doc.line(MARGIN + i * colW, y, MARGIN + i * colW, y + rowH);
    });
    doc.line(MARGIN + CONTENT_W, y, MARGIN + CONTENT_W, y + rowH);
    y += rowH;
  });

  doc.setDrawColor(212, 212, 216);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  return y + 8;
}

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {OrgDocumentPdfSpec} spec
 */
function drawPageFooter(doc, spec) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    const footerY = PAGE_H - 28;
    doc.setDrawColor(...hexToRgb(BRAND_BLUE));
    doc.setLineWidth(0.5);
    doc.line(MARGIN, footerY - 8, PAGE_W - MARGIN, footerY - 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    const generated = new Date().toLocaleString("en-UG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const left = spec.footerNote || "Proc Learn teaching reference — submit in the simulator.";
    doc.text(left, MARGIN, footerY);
    const pageLabel = `Page ${p} of ${pages} · Generated ${generated}`;
    doc.text(pageLabel, PAGE_W - MARGIN - doc.getTextWidth(pageLabel), footerY);
  }
}
