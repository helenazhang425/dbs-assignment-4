"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";

type AppNavProps = {
  loadingAuth: boolean;
  onSignOut: () => void;
  session: Session | null;
};

export function AppNav({ loadingAuth, onSignOut, session }: AppNavProps) {
  return (
    <div className="border-b border-[#d8e1ec] bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-6 py-4">
        <div>
          <Link className="font-serif text-[1.9rem] leading-none" href="/">
            Time to Run
          </Link>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#688098]">
            Weather picks for runners
          </div>
        </div>

        <nav className="ml-6 flex items-center gap-5 text-sm text-[#35506b]">
          <Link className="hover:text-[#17324c]" href="/">
            Home
          </Link>
          <Link className="hover:text-[#17324c]" href="/cities">
            My Cities
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {session ? (
            <>
              <span className="hidden text-[#688098] md:inline">
                {session.user.email}
              </span>
              <button
                className="rounded-full border border-[#c7d4e2] bg-white px-4 py-2 text-[#17324c] hover:bg-[#f5f9fc]"
                disabled={loadingAuth}
                onClick={onSignOut}
                type="button"
              >
                {loadingAuth ? "Working..." : "Sign out"}
              </button>
            </>
          ) : (
            <Link
              className="rounded-full border border-[#c7d4e2] bg-white px-4 py-2 text-[#17324c] hover:bg-[#f5f9fc]"
              href="/#auth"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
