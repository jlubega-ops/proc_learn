import { ForceAuthLightHtml } from "@/components/auth/force-auth-light-html";

export default function AuthLayout({ children }) {
  return (
    <>
      <ForceAuthLightHtml />
      <div className="min-h-dvh">{children}</div>
    </>
  );
}
