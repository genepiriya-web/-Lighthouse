// Browser-side Supabase client, created only when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set
// (without them the app runs with the local test sign-in). Keeps the `lhd_at` cookie in step with the session so page
// loads and document downloads (GET only) are signed in; API changes always send the token in a header.
"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;
const setCookie = (token: string | null) => {
  document.cookie = token ? `lhd_at=${encodeURIComponent(token)}; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}` : "lhd_at=; path=/; max-age=0";
};

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || typeof window === "undefined") return (client = null);
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  client.auth.onAuthStateChange((_e, s) => setCookie(s?.access_token ?? null));
  client.auth.getSession().then(({ data }) => setCookie(data.session?.access_token ?? null));
  return client;
}

export async function accessToken(): Promise<string | null> {
  const s = supabase(); if (!s) return null;
  const { data } = await s.auth.getSession(); return data.session?.access_token ?? null;
}
