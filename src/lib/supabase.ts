import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL, ' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in your .env.local'
  )
}

// Public client — safe to import anywhere, including client components.
// Uses the anon key, which respects Row Level Security policies.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client — SERVER-ONLY. Uses the service role key, which bypasses
// Row Level Security entirely. Never import this in client components or
// any file that ships to the browser (e.g. files under 'use client').
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)