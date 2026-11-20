"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AuthState = { error?: string; message?: string };

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if ([...password].length < 8) return { error: "Use a password with at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error?.code === "weak_password") {
    return { error: "Choose a stronger password that meets the password requirements." };
  }
  if (error?.code === "email_address_invalid") return { error: "Enter a valid email address." };
  if (error?.status === 429) return { error: "Too many attempts. Wait a moment and try again." };

  // Supabase can hide whether an address already has an account.
  if (error && error.code !== "user_already_exists" && error.code !== "email_exists") {
    return { error: "We couldn't create your account. Try again in a moment." };
  }

  if (data.session) redirect("/");
  return {
    message: "Check your email for a link to confirm your account. If you already have an account, you can log in.",
  };
}

export async function logIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter your email address and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error?.code === "email_not_confirmed") {
    return { error: "Confirm your email using the link we sent before logging in." };
  }
  if (error?.code === "invalid_credentials") return { error: "The email address or password is incorrect." };
  if (error?.status === 429) return { error: "Too many attempts. Wait a moment and try again." };
  if (error) return { error: "We couldn't log you in. Try again in a moment." };

  redirect("/");
}

export async function logOut(): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error && error.code !== "session_not_found") {
    return { error: "We couldn't log you out. Try again in a moment." };
  }

  redirect("/login");
}
