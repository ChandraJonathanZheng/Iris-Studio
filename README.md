# Iris-Studio

## Iris Studio Teacher App

Next.js + Supabase teacher-facing app. See `docs/superpowers/specs/2026-08-26-iris-studio-teacher-app-design.md` for the design.

### Setup

1. Copy `.env.local.example` to `.env.local` and fill in Supabase project values.
2. Apply `supabase/schema.sql` to your Supabase project (SQL editor or CLI).
3. Create two public Storage buckets: `homework-audio`, `homework-photos`.
4. `npm install`
5. `npm run seed` — seeds one studio with sample students, classes, homework, fees, events, and a reschedule request.
6. `npm run dev` — visit `http://localhost:3000` for the public landing page, `http://localhost:3000/app` for the teacher app.

### Testing

`npm test` runs the Vitest suite (component and form-validation tests).

### Deployment

Configured for Netlify via `netlify.toml`. Set the same three env vars in Netlify's dashboard before deploying.
