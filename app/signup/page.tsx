import AuthForm from "../auth/auth-form";
import AuthShell from "../auth/auth-shell";

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
