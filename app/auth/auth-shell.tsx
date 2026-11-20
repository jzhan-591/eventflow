import type { ReactNode } from "react";

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 font-sans text-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="mb-2 text-sm font-bold text-teal-800">EventFlow</p>
        {children}
      </div>
    </main>
  );
}
