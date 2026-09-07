# Cloud sync — setup

Loud Light can save projects to a Supabase project instead of (as well as) this
device's localStorage, so a sketch started on the desktop can be picked up on
the phone. The code is written and shipped; it stays **completely hidden** until
the two constants at the top of `src/loudlight.jsx` are filled in:

```js
const CLOUD_URL="";   // https://<project-ref>.supabase.co
const CLOUD_KEY="";   // the anon / publishable key
```

With those blank, `CLOUD_ON` is false, the CLOUD section of the PROJECT menu
doesn't render, and nothing touches the network. Fill them in, `npm run build`,
push — that's the whole switch-on.

The anon key is **public by design**. It grants nothing on its own; row-level
security is what decides who sees which row. It belongs in the source, next to
the URL, not in a secret store.

---

## What you have to do (three things)

### 1. Create the project

<https://supabase.com/dashboard> → New project. Any region near you. Note the
**Project URL** and the **anon / publishable key** from Settings → API — those
are the two constants above.

### 2. Run the SQL

Dashboard → SQL Editor → New query → paste and run:

```sql
create table if not exists public.projects (
  user_id    uuid        not null references auth.users(id) on delete cascade default auth.uid(),
  slot       text        not null,
  name       text,
  data       text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.projects enable row level security;

-- One policy, all four verbs: you can only ever touch your own rows.
-- Dropped first so the whole block is safe to re-run.
drop policy if exists "own rows only" on public.projects;
create policy "own rows only" on public.projects
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reach the table through the Data API at all. Needed when the project was
-- created with "Automatically expose new tables" off (the default for projects
-- made after 2026-05-30); harmless when it was on. `authenticated` only —
-- every request the app makes carries a signed-in user's JWT, so `anon` never
-- needs to touch this table.
grant select, insert, update, delete on public.projects to authenticated;
```

Grants and RLS are two separate gates: the `grant` decides whether the
`authenticated` role can see the table through the API at all, RLS decides which
of its rows. You need both — a table with RLS but no grant returns a permission
error, and a table with a grant but no RLS is readable by every signed-in user
on the project.

Notes on the shape:

- **`(user_id, slot)` is the primary key**, which is what makes SAVE an upsert:
  the app POSTs with `on_conflict=user_id,slot` and
  `Prefer: resolution=merge-duplicates`, so re-saving C1 replaces C1 rather than
  piling up rows.
- **`data` is `text`, not `jsonb`.** It holds the sparse-packed project exactly
  as `getShareState()` produced it — the same bytes a file export or share link
  carries. Round-tripping it through `jsonb` would re-key and re-order it for no
  benefit, and the app never queries inside it.
- **`name` is the project's label and `slot` its permanent id.** Renaming
  rewrites `name` only, so it never orphans the row or its data.

### 3. Put the code in **both** email templates

Dashboard → Authentication → Emails. Supabase's default templates carry only the
`{{ .ConfirmationURL }}` link, and Loud Light asks for a **six-digit code** instead
(a link would open a new browser tab, which on iOS means leaving the home-screen
PWA). Whichever variable is present decides what gets sent: `{{ .Token }}` sends
a code, `{{ .ConfirmationURL }}` sends a link.

**Two templates need it, not one.** The OTP endpoint signs a user *up* when they
don't exist yet, and a signup sends **Confirm signup** — not **Magic Link**. Edit
Magic Link alone and a first-ever sign-in gets the stock "Confirm your email
address" link instead of a code, which is a confusing dead end (the link
redirects to the default Site URL, `http://localhost:3000`, and the browser
refuses to connect). So paste this into **Confirm signup** *and* **Magic Link**:

```html
<h2>Loud Light sign-in</h2>
<p>Your code is:</p>
<p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
<p>It expires in an hour.</p>
```

While you're there, set Authentication → URL Configuration → **Site URL** to
`https://jakedbirch.github.io/Loud Light`. Nothing in this flow follows a link, but
it stops any stray confirmation link pointing at a localhost server that isn't
running.

Optional but worth it: Authentication → Providers → Email → turn **Confirm
email** on and leave "Enable email provider" on; turn **off** any other provider
you don't want. If you'd rather nobody else can create an account, Authentication
→ Settings → disable **Allow new users to sign up** *after* you've signed in
once on each device (the app sends `create_user: true`, so the first sign-in has
to be allowed).

---

## How it works

**Auth** is email one-time-code, hand-rolled over `fetch` against Supabase's
REST endpoints rather than pulling in `supabase-js` — Loud Light is one static file
with two UMD script tags, and the six calls needed here are a page of code. An
SDK from a CDN would also have to be precached by the service worker to keep the
installed PWA offline-clean.

| Step | Endpoint |
|---|---|
| Send the code | `POST /auth/v1/otp` `{email, create_user:true}` |
| Verify it | `POST /auth/v1/verify` `{email, token, type:"email"}` |
| Stay signed in | `POST /auth/v1/token?grant_type=refresh_token` |
| Sign out | `POST /auth/v1/logout` |

Only the **refresh token** is persisted (storage key `cloud`). Access tokens
expire in an hour, so on every launch the app trades the refresh token for a
fresh pair; if that fails — revoked, expired — it drops the session and shows
signed-out rather than leaving a dead account on screen.

**Storage** is a named project list, the same one the DEVICE tab shows, against
the account instead of the device. The `slot` column holds the project's opaque
id and `name` its label — which is why moving off fixed slots needed no schema
change. The payload is `getShareState(true)` — the full project including
recorded samples.
This is only viable because of the sparse codec: a 32-bar project is ~244KB
packed against ~2.4MB dense. Anything over 6MB (`CLOUD_MAX_BYTES`) is refused
before it leaves the device, so a phone on cellular doesn't find out mid-save.

The slot list query deliberately selects `slot, name, updated_at` and **not**
`data` — opening the menu shouldn't download every project just to draw four
dots. Each filled slot shows how stale it is (`NOW` / `20m` / `4h` / `3d`).

The service worker skips `/auth/v1/` and `/rest/v1/` entirely; they're
cross-origin GETs that would otherwise land in its cache-first branch and serve
a stale project list forever.

## Two operational limits worth knowing

Neither is a bug in Loud Light, and both look exactly like "cloud sync is broken".

**The built-in email sender allows 2 messages per hour.** Supabase's default SMTP
is explicitly a demo service. Signing in on the desktop and then the phone is
two emails — right at the ceiling. A mistyped code costs nothing (verifying
doesn't re-send), but tapping RESEND does. If you hit it, wait an hour or wire
up a real sender: Authentication → Emails → SMTP Settings, point it at any
provider (Resend, Postmark, SES), and the limit becomes configurable — it starts
at 30/hour. Worth doing only if the 2/hour actually bites; sign-ins are rare
because the refresh token keeps a device signed in indefinitely.

**Free-plan projects pause after 7 days of no activity.** A paused project
refuses connections, so SAVE/LOAD fail until you hit Restore in the dashboard
(paused projects stay restorable for 90 days). For an app you might not open for
a fortnight this is the thing most likely to trip you up. The fix is a dashboard
click; the alternative is a paid plan, which is not worth it for four slots.

## What v1 deliberately isn't

- **Not automatic.** Nothing uploads on its own. Autosave stays local. You press
  SAVE, you press LOAD — same as the slots have always worked.
- **Not conflict-aware.** Last write to a slot wins. With one person on two
  devices and a manual save, the `updated_at` caption is enough to see which end
  is newer before you overwrite it.
- **Not quota'd.** Nothing yet limits how many projects an account can store.
  That's the hook the premium gate goes on, and it belongs in an RLS policy
  rather than in the app — the publishable key is in the client, so a
  client-side check gates nothing.
