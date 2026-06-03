import { createClient } from '@supabase/supabase-js'

// 1. Double check that these values match your Supabase dashboard!
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://YOUR-ACTUAL-PROJECT-ID.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR-ACTUAL-LONG-SERVICE-ROLE-KEY'

// 2. Export both so no matter what your code imports, it works!
export const supabase = createClient(supabaseUrl, supabaseKey)
export const supabaseAdmin = supabase