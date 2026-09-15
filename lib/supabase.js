/**
 * lib/supabase.js - Database Connection File
 * --------------------------------------------------------
 * Yeh file Supabase (jo hamara database hai) ke sath connection banane ka kaam karti hai.
 * Baaki sabhi files database se connect hone ke liye isi file ka use karti hain.
 */

import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}
