import { Suspense } from "react";
import AuthForm from "../auth/auth-form";
import AuthShell from "../auth/auth-shell";

type LoginPageProps = { searchParams: Promise<{ confirmation?: string | string[] }> };

async function ConfirmationMessage({ searchParams }: LoginPageProps) {
  if ((await searchParams).confirmation !== "failed") return null;
  return (
    <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
      This confirmation link is invalid or has expired. Use the latest email from EventFlow, or try signing up again.
    </p>
  );
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ConfirmationMessage searchParams={searchParams} />
      </Suspense>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
