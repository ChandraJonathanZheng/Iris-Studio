import '@testing-library/jest-dom/vitest'

// No live Supabase project exists yet in this environment. Set harmless
// placeholders so any code path that ends up constructing a Supabase client
// during a test run (e.g. lib/supabase/client.ts) doesn't crash for lack of
// configured env vars.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://placeholder.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'placeholder-anon-key'
