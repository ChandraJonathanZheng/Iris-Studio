import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// @testing-library/react's auto-cleanup only self-registers when it detects
// `afterEach` as a global (i.e. `test.globals: true` in vitest.config.ts).
// This project doesn't enable globals, so register cleanup explicitly —
// otherwise a test file with more than one `render()` call leaks DOM nodes
// across tests within that file.
afterEach(() => {
  cleanup()
})

// No live Supabase project exists yet in this environment. Set harmless
// placeholders so any code path that ends up constructing a Supabase client
// during a test run (e.g. lib/supabase/client.ts) doesn't crash for lack of
// configured env vars.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://placeholder.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'placeholder-anon-key'
