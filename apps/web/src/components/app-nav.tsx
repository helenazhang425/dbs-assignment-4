"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { usePreferences } from "@/lib/use-preferences";

type AppNavProps = {
  session: Session | null;
};

type AuthMode = "sign-in" | "sign-up";

export function AppNav({ session }: AppNavProps) {
  const pathname = usePathname();
  const showSettings = pathname === "/" || Boolean(session);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, updatePrefs] = usePreferences();

  function openAuth(next: AuthMode) {
    setMode(next);
    setAuthError(null);
    setAuthNotice(null);
    setAuthOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAuth(true);
    setAuthError(null);
    setAuthNotice(null);

    const credentials = { email: email.trim(), password };

    try {
      const result =
        mode === "sign-up"
          ? await supabase.auth.signUp(credentials)
          : await supabase.auth.signInWithPassword(credentials);

      if (result.error) {
        console.error("Auth error:", result.error);
        setAuthError(result.error.message);
        return;
      }

      if (mode === "sign-up" && !result.data.session) {
        setAuthNotice("Account created. Check your email to confirm.");
        return;
      }

      setAuthOpen(false);
      setEmail("");
      setPassword("");
    } catch (unexpected) {
      console.error("Auth threw:", unexpected);
      setAuthError(
        unexpected instanceof Error ? unexpected.message : "Something went wrong.",
      );
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleSignOut() {
    setLoadingAuth(true);
    await supabase.auth.signOut();
    setLoadingAuth(false);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[#ebe3d7] bg-[#faf6f0]/90 backdrop-blur-md">
      <div className="mx-auto flex h-[76px] max-w-6xl items-center gap-6 px-6">
        <Link className="group flex items-center gap-3" href="/">
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4a6382] text-xl text-[#faf6f0] ring-2 ring-[#e89e7a] ring-offset-2 ring-offset-[#faf6f0] transition group-hover:rotate-[-6deg]"
          >
            🏃
          </span>
          <span className="leading-tight">
            <span className="block font-serif text-[1.45rem] tracking-tight text-[#4a6382]">
              TimeToRun
            </span>
            <span className="block text-[10px] uppercase tracking-[0.28em] text-[#8a847d]">
              Running weather · live
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 rounded-full border border-[#ebe3d7] bg-[#ffffff] p-1 text-sm">
          <NavLink href="/" active={pathname === "/"}>
            Overview
          </NavLink>
          <NavLink href="/cities" active={pathname === "/cities"}>
            My cities
          </NavLink>
        </nav>

        <div className="relative">
          {showSettings ? (
            <button
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ebe3d7] bg-[#ffffff] text-lg text-[#55504a] hover:bg-[#f5efe6]"
              onClick={() => setSettingsOpen((v) => !v)}
              type="button"
            >
              ⚙
            </button>
          ) : null}
          {showSettings && settingsOpen ? (
            <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-[1.2rem] border border-[#ebe3d7] bg-[#ffffff] p-5 shadow-[0_16px_40px_rgba(58,53,48,0.14)]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.3em] text-[#e89e7a]">
                  Settings
                </div>
                <button
                  aria-label="Close"
                  className="text-sm text-[#8a847d] hover:text-[#3a3530]"
                  onClick={() => setSettingsOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-[#8a847d]">
                  Temperature
                </div>
                <div className="mt-2 inline-flex rounded-full border border-[#ebe3d7] bg-[#faf6f0] p-1 text-xs">
                  {(["C", "F"] as const).map((unit) => (
                    <button
                      key={unit}
                      className={`rounded-full px-3 py-1 ${
                        prefs.tempUnit === unit
                          ? "bg-[#4a6382] text-[#faf6f0]"
                          : "text-[#55504a]"
                      }`}
                      onClick={() =>
                        updatePrefs((current) => ({ ...current, tempUnit: unit }))
                      }
                      type="button"
                    >
                      °{unit}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-[#8a847d]">
                  Run window
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#8a847d]">
                      Start
                    </div>
                    <HourSelect
                      value={prefs.runStartHour}
                      onChange={(hour) =>
                        updatePrefs((current) => ({
                          ...current,
                          runStartHour: hour,
                          runEndHour: Math.max(current.runEndHour, hour + 1),
                        }))
                      }
                    />
                  </div>
                  <span className="pb-2 text-xs text-[#8a847d]">to</span>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[#8a847d]">
                      End
                    </div>
                    <HourSelect
                      value={prefs.runEndHour}
                      onChange={(hour) =>
                        updatePrefs((current) => ({
                          ...current,
                          runEndHour: hour,
                          runStartHour: Math.min(current.runStartHour, hour - 1),
                        }))
                      }
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-[#8a847d]">
                  Best-window picks stay within this start-to-end range in each city&apos;s local time.
                </p>
                <p className="mt-1 text-[11px] text-[#8a847d]">
                  Current window: {formatHour(prefs.runStartHour)} to {formatHour(prefs.runEndHour)}.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative flex items-center gap-2 text-sm">
          {session ? (
            <>
              <span className="hidden max-w-[14ch] truncate font-mono text-xs text-[#8a847d] md:inline">
                {session.user.email}
              </span>
              <button
                className="rounded-full bg-[#4a6382] px-4 py-2 font-medium text-[#faf6f0] hover:bg-[#5d7896] disabled:opacity-60"
                disabled={loadingAuth}
                onClick={handleSignOut}
                type="button"
              >
                {loadingAuth ? "…" : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <button
                className="rounded-full border border-[#4a6382] bg-[#ffffff] px-4 py-2 font-medium text-[#4a6382] hover:bg-[#f5efe6]"
                onClick={() => openAuth("sign-in")}
                type="button"
              >
                Sign in
              </button>
              <button
                className="rounded-full bg-[#4a6382] px-4 py-2 font-medium text-[#faf6f0] hover:bg-[#5d7896]"
                onClick={() => openAuth("sign-up")}
                type="button"
              >
                Sign up
              </button>
              {authOpen ? (
                <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-[1.2rem] border border-[#ebe3d7] bg-[#ffffff] p-5 shadow-[0_16px_40px_rgba(58,53,48,0.14)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[#e89e7a]">
                      <span aria-hidden>👟</span> Lace up
                    </div>
                    <button
                      aria-label="Close"
                      className="text-sm text-[#8a847d] hover:text-[#3a3530]"
                      onClick={() => setAuthOpen(false)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                  <h3 className="mt-2 font-serif text-xl text-[#4a6382]">
                    {mode === "sign-in" ? "Welcome back" : "Start tracking runs"}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[#8a847d]">
                    {mode === "sign-in"
                      ? "Sign in to follow your cities."
                      : "Create an account to save cities."}
                  </p>

                  <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wider text-[#8a847d]">
                        Email
                      </label>
                      <input
                        className="h-10 w-full rounded-xl border border-[#d9cfc0] bg-[#faf6f0] px-3 text-sm outline-none focus:border-[#4a6382]"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wider text-[#8a847d]">
                        Password
                      </label>
                      <input
                        className="h-10 w-full rounded-xl border border-[#d9cfc0] bg-[#faf6f0] px-3 text-sm outline-none focus:border-[#4a6382]"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={
                          mode === "sign-in" ? "current-password" : "new-password"
                        }
                        minLength={6}
                        required
                      />
                    </div>
                    {authError ? (
                      <div className="rounded-lg bg-[#f5e4de] px-3 py-2 text-xs text-[#8a4a3a]">
                        {authError}
                      </div>
                    ) : null}
                    {authNotice ? (
                      <div className="rounded-lg bg-[#e6edf5] px-3 py-2 text-xs text-[#4a6382]">
                        {authNotice}
                      </div>
                    ) : null}
                    <button
                      className="h-10 w-full rounded-xl bg-[#4a6382] text-sm font-medium text-[#faf6f0] hover:bg-[#5d7896] disabled:opacity-60"
                      disabled={loadingAuth}
                      type="submit"
                    >
                      {loadingAuth
                        ? "Warming up…"
                        : mode === "sign-in"
                          ? "Sign in"
                          : "Create account"}
                    </button>
                  </form>

                  <button
                    className="mt-4 w-full text-center text-xs text-[#8a847d] hover:text-[#4a6382]"
                    onClick={() => {
                      setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                      setAuthError(null);
                      setAuthNotice(null);
                    }}
                    type="button"
                  >
                    {mode === "sign-in"
                      ? "Need an account? Sign up"
                      : "Already have an account? Sign in"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function HourSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (hour: number) => void;
}) {
  return (
    <select
      className="h-9 rounded-lg border border-[#d9cfc0] bg-[#faf6f0] px-2 text-sm text-[#3a3530] outline-none focus:border-[#4a6382]"
      onChange={(event) => onChange(Number(event.target.value))}
      value={value}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <option key={hour} value={hour}>
          {formatHour(hour)}
        </option>
      ))}
    </select>
  );
}

function formatHour(hour: number) {
  const period = hour < 12 ? "AM" : "PM";
  const hr12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hr12} ${period}`;
}

function NavLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={`rounded-full px-4 py-1.5 transition ${
        active
          ? "bg-[#4a6382] text-[#faf6f0] shadow-sm"
          : "text-[#55504a] hover:bg-[#f5efe6]"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}
