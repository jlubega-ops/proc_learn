"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import { studentNumberFromStudentEmail } from "@/lib/mubs-email";
import { validateStudentAccountForm } from "@/lib/validation/student-form";
import { themedTextFieldSx } from "@/lib/admin-mui-surfaces";
import { useToast } from "@/components/providers/toast-provider";
import { useRouter } from "next/navigation";
import { campusSelectOptions } from "@/lib/campuses";

function copyForToast(raw) {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!t) return "Something went wrong.";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * @param {{ afterCreatePath?: string }} props
 */
export function AddStudentForm({ afterCreatePath = "/students/manage" }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [programmes, setProgrammes] = useState(
    /** @type {{ id: string; name: string; defaultYearOfStudy?: number }[]} */ ([]),
  );
  const [academicYears, setAcademicYears] = useState(
    /** @type {string[]} */ ([]),
  );

  const [email, setEmail] = useState("");
  const [snSynced, setSnSynced] = useState(true);
  const [studentNumber, setStudentNumber] = useState("");

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sex, setSex] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("3");
  const [academicYearLabel, setAcademicYearLabel] = useState("");
  const [campus, setCampus] = useState("");

  /** @type {[Record<string, string>, import("react").Dispatch<import("react").SetStateAction<Record<string, string>>>]} */
  const [errors, setErrors] = useState({});

  const onEmailChange = useCallback(
    (raw) => {
      const v = raw.trim().toLowerCase();
      setEmail(v);
      const from = studentNumberFromStudentEmail(v) || "";
      if (snSynced) setStudentNumber(from);
    },
    [snSynced],
  );

  const onStudentNumberChange = useCallback(
    (raw) => {
      const digits = raw.replace(/\D/g, "");
      setStudentNumber(digits);
      const from = studentNumberFromStudentEmail(email) || "";
      setSnSynced(digits === from);
    },
    [email],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pRes, yRes] = await Promise.all([
        fetch("/api/programmes", { credentials: "include" }),
        fetch("/api/meta/academic-years"),
      ]);
      const pData = await pRes.json().catch(() => ({}));
      const yData = await yRes.json().catch(() => ({}));
      if (cancelled) return;
      if (pRes.ok && Array.isArray(pData.programmes))
        setProgrammes(pData.programmes);
      if (yRes.ok && Array.isArray(yData.labels) && yData.labels.length) {
        setAcademicYears(yData.labels);
        setAcademicYearLabel(
          (prev) => prev || yData.currentLabel || yData.labels[0] || "",
        );
      } else if (yRes.ok && Array.isArray(yData.extended)) {
        setAcademicYears(yData.extended);
        setAcademicYearLabel(
          (prev) => prev || yData.currentLabel || yData.extended[0] || "",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!programmeId) return;
    const p = programmes.find((x) => x.id === programmeId);
    if (
      p &&
      typeof p.defaultYearOfStudy === "number" &&
      [1, 2, 3].includes(p.defaultYearOfStudy)
    ) {
      setYearOfStudy(String(p.defaultYearOfStudy));
    }
  }, [programmeId, programmes]);

  async function submit(e) {
    e.preventDefault();
    const next = validateStudentAccountForm({
      email,
      studentNumber,
      firstName,
      lastName,
      middleName,
      registrationNumber,
      programmeId,
      academicYearLabel,
      campus,
      sex,
    });
    setErrors(next);
    if (Object.keys(next).length > 0) {
      showToast({
        message: "Please fix the highlighted fields.",
        severity: "error",
        duration: 6000,
      });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "student",
          email: email.trim().toLowerCase(),
          studentNumber: studentNumber.replace(/\D/g, ""),
          firstName,
          middleName: middleName.trim() || undefined,
          lastName,
          sex: sex || undefined,
          profilePhotoUrl: profilePhotoUrl.trim() || undefined,
          registrationNumber,
          programmeId,
          yearOfStudy: Number(yearOfStudy),
          academicYearLabel,
          campus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          message:
            typeof data.error === "string"
              ? copyForToast(data.error)
              : copyForToast("could not create student."),
          severity: "error",
          duration: 8000,
        });
        return;
      }
      showToast({
        message: "Student created. Activation email sent.",
        severity: "success",
      });
      router.push(afterCreatePath);
    } finally {
      setBusy(false);
    }
  }

  const dividerSx = {
    borderColor: "color-mix(in oklab, var(--foreground) 12%, transparent)",
    my: 0.5,
  };

  const sectionTitleSx = { color: "var(--foreground)", fontWeight: 600 };

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-zinc-200 bg-background p-4 dark:border-zinc-800 sm:gap-4 sm:p-5"
    >
      <Typography
        variant="body2"
        sx={{
          color: "color-mix(in oklab, var(--foreground) 72%, transparent)",
        }}
      >
        School email must be <strong>digits@mubs.ac.ug</strong>. The student
        number is filled from the email digits; you can change it if it should
        differ.
      </Typography>

      <Typography variant="subtitle2" sx={sectionTitleSx}>
        Account
      </Typography>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label="School email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => {
            onEmailChange(e.target.value);
            setErrors((p) => {
              const { email: _e, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.email)}
          helperText={errors.email || "Example: 2300123456@mubs.ac.ug"}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Student number"
          autoComplete="off"
          value={studentNumber}
          onChange={(e) => {
            onStudentNumberChange(e.target.value);
            setErrors((p) => {
              const { studentNumber: _s, ...r } = p;
              return r;
            });
          }}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
          error={Boolean(errors.studentNumber)}
          helperText={
            errors.studentNumber || "Digits only; may differ from email."
          }
          fullWidth
          sx={themedTextFieldSx}
        />
      </div>

      <Divider sx={dividerSx} />

      <Typography variant="subtitle2" sx={sectionTitleSx}>
        Identity
      </Typography>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="First name"
          value={firstName}
          onChange={(e) => {
            setFirstName(e.target.value);
            setErrors((p) => {
              const { firstName: _f, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.firstName)}
          helperText={errors.firstName}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Last name"
          value={lastName}
          onChange={(e) => {
            setLastName(e.target.value);
            setErrors((p) => {
              const { lastName: _l, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.lastName)}
          helperText={errors.lastName}
          fullWidth
          sx={themedTextFieldSx}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Middle name (optional)"
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          select
          label="Sex (optional)"
          value={sex}
          onChange={(e) => {
            setSex(e.target.value);
            setErrors((p) => {
              const { sex: _x, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.sex)}
          helperText={errors.sex}
          fullWidth
          sx={themedTextFieldSx}
        >
          <MenuItem value="">—</MenuItem>
          <MenuItem value="MALE">Male</MenuItem>
          <MenuItem value="FEMALE">Female</MenuItem>
        </TextField>
      </div>

      <Divider sx={dividerSx} />

      <Typography variant="subtitle2" sx={sectionTitleSx}>
        Programme & study
      </Typography>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          select
          label="Programme"
          value={programmeId}
          onChange={(e) => {
            setProgrammeId(e.target.value);
            setErrors((p) => {
              const { programmeId: _p, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.programmeId)}
          helperText={errors.programmeId}
          fullWidth
          sx={themedTextFieldSx}
        >
          <MenuItem value="" disabled>
            Select programme
          </MenuItem>
          {programmes.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Campus"
          value={campus}
          onChange={(e) => {
            setCampus(e.target.value);
            setErrors((p) => {
              const { campus: _c, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.campus)}
          helperText={errors.campus || "Where the student studies"}
          fullWidth
          sx={themedTextFieldSx}
        >
          <MenuItem value="" disabled>
            Select campus
          </MenuItem>
          {campusSelectOptions().map((c) => (
            <MenuItem key={c.value} value={c.value}>
              {c.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Year of study"
          value={yearOfStudy}
          onChange={(e) => setYearOfStudy(e.target.value)}
          fullWidth
          sx={themedTextFieldSx}
        >
          <MenuItem value="1">1</MenuItem>
          <MenuItem value="2">2</MenuItem>
          <MenuItem value="3">3</MenuItem>
        </TextField>
        <TextField
          select
          label="Academic year"
          value={academicYearLabel}
          onChange={(e) => {
            setAcademicYearLabel(e.target.value);
            setErrors((p) => {
              const { academicYearLabel: _a, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.academicYearLabel)}
          helperText={
            errors.academicYearLabel ||
            (academicYears.length
              ? ""
              : "Create an academic year under Academic setup first")
          }
          fullWidth
          sx={themedTextFieldSx}
        >
          {academicYears.map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
        </TextField>
      </div>

      <Divider sx={dividerSx} />

      <Typography variant="subtitle2" sx={sectionTitleSx}>
        Other
      </Typography>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Registration number"
          value={registrationNumber}
          onChange={(e) => {
            setRegistrationNumber(e.target.value);
            setErrors((p) => {
              const { registrationNumber: _r, ...r } = p;
              return r;
            });
          }}
          error={Boolean(errors.registrationNumber)}
          helperText={errors.registrationNumber}
          fullWidth
          sx={themedTextFieldSx}
        />
        <TextField
          label="Profile photo URL (optional)"
          value={profilePhotoUrl}
          onChange={(e) => setProfilePhotoUrl(e.target.value)}
          fullWidth
          sx={themedTextFieldSx}
        />
      </div>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          variant="contained"
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {busy ? (
            <CircularProgress size={22} color="inherit" />
          ) : (
            "Create student"
          )}
        </Button>
      </div>
    </form>
  );
}
