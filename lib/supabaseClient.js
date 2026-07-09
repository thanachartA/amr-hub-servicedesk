"use client";
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kkbffgbotigddtfmultm.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_kr0-mgRzCmmGUIGcBtx7_w_mR4se1wa";
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
