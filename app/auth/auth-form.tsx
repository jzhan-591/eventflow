"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logIn, signUp } from "./actions";

const fieldClass = "mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus-visible:outline-2 focus-visible:outline-teal-700";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignUp = mode === "signup";
  const [state, submit, pending] = useActionState(isSignUp ? signUp : logIn, {});
  const title = isSignUp ? "Sign Up" : "Log In";

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <form action={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email Address
          <input name="email" type="email" autoComplete="email" required className={fieldClass} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? 8 : undefined}
            aria-describedby={isSignUp ? "password-hint" : undefined}
            required
            className={fieldClass}
          />
        </label>
        {isSignUp && <p id="password-hint" className="text-sm text-slate-600">Use at least 8 characters.</p>}
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.message && <p role="status" className="text-sm text-teal-800">{state.message}</p>}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-lg bg-teal-800 px-4 font-medium text-white enabled:hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
        >
          {pending ? (isSignUp ? "Signing up…" : "Logging in…") : title}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        {isSignUp ? "Already have an account? " : "Need an account? "}
        <Link href={isSignUp ? "/login" : "/signup"} className="font-semibold text-teal-800 underline underline-offset-2">
          {isSignUp ? "Log In" : "Sign Up"}
        </Link>
      </p>
    </>
  );
}
