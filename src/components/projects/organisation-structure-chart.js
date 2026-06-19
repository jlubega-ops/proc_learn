"use client";

import { PROCUREMENT_ORG_STRUCTURE } from "@/lib/projects/procurement-org-structure";
import { BRAND_TRICOLOR_STRIPE_CLASS } from "@/lib/brand-ui";

/**
 * @param {{
 *   organizationName?: string | null;
 *   projectName?: string | null;
 *   departments?: { id: string; name: string }[];
 *   readOnly?: boolean;
 * }} props
 */
export function OrganisationStructureChart({
  organizationName,
  projectName,
  departments = [],
  readOnly = false,
}) {
  const orgLabel =
    String(organizationName || "").trim() ||
    String(projectName || "").trim() ||
    "Organisation";
  const { apex, branches } = PROCUREMENT_ORG_STRUCTURE;
  const headPdu = branches.find((b) => b.id === "head-pdu");
  const contractsCommittee = branches.find((b) => b.id === "contracts-committee");
  const userDepartments = branches.find((b) => b.id === "user-departments");
  const headUserDept = userDepartments?.children?.[0];
  const userDeptStaff = headUserDept?.children?.[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] shadow-sm">
      <div className={BRAND_TRICOLOR_STRIPE_CLASS} aria-hidden />
      <div className="border-b border-[color:var(--border-subtle)] bg-gradient-to-r from-[color-mix(in_oklab,var(--brand-blue)_10%,var(--surface-elevated))] to-[color:var(--surface-elevated)] px-4 py-5 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          Procurement governance model
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          {orgLabel}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          How procurement authority and user departments are arranged in this isolated workspace.
          {readOnly ? " View-only access." : " This structure guides how you configure departments, roles, and workflows below."}
        </p>
      </div>

      <div className="overflow-x-auto px-3 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto min-w-[min(100%,52rem)] max-w-5xl">
          <div className="flex flex-col items-center">
            <OrgNode
              title={apex.title}
              description={apex.description}
              variant="apex"
              orgLabel={orgLabel}
            />
            <ConnectorDown className="h-8" />

            <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3 md:gap-4">
              <BranchColumn>
                <OrgNode
                  title={headPdu?.title || "Head PDU"}
                  description={headPdu?.description}
                  variant="branch"
                />
                <ConnectorDown className="h-6" />
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center md:flex-col">
                  {(headPdu?.children || []).map((child) => (
                    <OrgNode key={child.id} title={child.title} variant="role" />
                  ))}
                </div>
              </BranchColumn>

              <BranchColumn className="md:pt-10">
                <OrgNode
                  title={contractsCommittee?.title || "Contracts Committee"}
                  description={contractsCommittee?.description}
                  variant="branch"
                />
              </BranchColumn>

              <BranchColumn>
                <OrgNode
                  title={userDepartments?.title || "User Departments (Various Units)"}
                  description={userDepartments?.description}
                  variant="branch"
                />
                {departments.length > 0 ? (
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5 px-1">
                    {departments.map((dept) => (
                      <span
                        key={dept.id}
                        className="rounded-full border border-primary/25 bg-[color-mix(in_oklab,var(--brand-blue)_10%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                      >
                        {dept.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-center text-[11px] italic text-zinc-500 dark:text-zinc-400">
                    Add departments under Administration to list your units here.
                  </p>
                )}
                <ConnectorDown className="h-6" />
                <OrgNode
                  title={headUserDept?.title || "Head User Department"}
                  variant="role"
                />
                <ConnectorDown className="h-5" />
                <OrgNode
                  title={userDeptStaff?.title || "User Department Staff"}
                  variant="leaf"
                />
              </BranchColumn>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-3 text-center text-xs text-zinc-500 dark:text-zinc-400 sm:px-6">
        Standard public-procurement reporting lines · tailored for{" "}
        <span className="font-semibold text-foreground">{orgLabel}</span>
      </div>
    </div>
  );
}

/**
 * @param {{ title: string; description?: string; orgLabel?: string; variant: "apex" | "branch" | "role" | "leaf" }} p
 */
function OrgNode({ title, description, orgLabel, variant }) {
  const styles = {
    apex:
      "border-t-[3px] border-t-brand-blue bg-[color-mix(in_oklab,var(--brand-blue)_8%,var(--surface-elevated))] px-6 py-4 text-center shadow-md",
    branch:
      "border-t-2 border-t-brand-yellow bg-[color-mix(in_oklab,var(--brand-yellow)_12%,var(--surface-elevated))] px-4 py-3 text-center shadow-sm",
    role: "border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3 py-2.5 text-center shadow-sm",
    leaf: "border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2 text-center",
  };

  const titleClass = {
    apex: "text-base font-extrabold text-primary sm:text-lg",
    branch: "text-sm font-bold text-foreground",
    role: "text-sm font-semibold text-foreground",
    leaf: "text-xs font-semibold text-zinc-700 dark:text-zinc-200",
  };

  return (
    <div className={`w-full max-w-[15rem] rounded-xl ${styles[variant]}`}>
      {variant === "apex" && orgLabel ? (
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {orgLabel}
        </p>
      ) : null}
      <p className={titleClass[variant]}>{title}</p>
      {description ? (
        <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** @param {{ className?: string; children?: import("react").ReactNode }} p */
function BranchColumn({ className = "", children }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>{children}</div>
  );
}

/** @param {{ className?: string }} p */
function ConnectorDown({ className = "" }) {
  return (
    <div
      className={`flex w-px flex-col items-center bg-[color-mix(in_oklab,var(--brand-blue)_35%,transparent)] ${className}`}
      aria-hidden
    >
      <span className="h-full w-px border-l border-dashed border-primary/40" />
    </div>
  );
}
