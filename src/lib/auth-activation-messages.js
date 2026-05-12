/**
 * User-facing copy for activation token checks (GET /api/auth/activate + POST errors).
 * @param {string} code
 */
export function messageForActivationTokenCode(code) {
  switch (code) {
    case "expired":
      return "This activation link has expired. Ask an administrator to resend your invitation.";
    case "used":
      return "This link has already been used. Sign in with the password you set.";
    case "suspended":
      return "This account cannot be activated. Contact support if you need help.";
    case "already_active":
      return "This account is already active. You can sign in below.";
    case "invalid":
    default:
      return "This activation link is invalid or not recognized. Check the link from your email or request a new invitation.";
  }
}
