import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazily construct the client on first use instead of at module load. Client
// Components are still rendered once on the server (e.g. during `next build`
// prerendering / static export), and with no live Supabase project configured
// yet, an eager `createClient(...)` call here would throw during that
// server-side pass and break the build. Deferring construction until a
// property is actually accessed means it only runs in the browser, where the
// env vars are inlined at build time as usual.
let cached: SupabaseClient | undefined

function getSupabaseBrowser(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return cached
}

export const supabaseBrowser: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseBrowser(), prop, receiver)
  },
})
