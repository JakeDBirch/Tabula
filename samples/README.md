# samples/

Two drum kits, loaded by `loadKit` and listed in `kits.json`. They are shipped
inside the app: GitHub Pages serves them from here, and `npm run build:ios`
copies the whole directory into `ios/www/`.

| kit | voices | size |
|---|---|---|
| `808-kit` | 13 one-shots | ~2.0 MB |
| `vp-kit` | 23 files — velocity layers (`BDv1`/`BDv2`, `SDv1`–`v3`) and hat round-robins (`CH1`–`CH6`, `SH1`–`SH3`) | ~6.1 MB |

## Provenance — these are Jake's own recordings

**Confirmed 2026-10-03. There is no third-party licence involved, and nothing
to evidence to anyone.**

This file exists because that fact was written down nowhere, so the question
got asked twice while preparing the public beta — and it is a question with
real consequences:

- **App Store Connect asks whether the app contains, shows or accesses
  third-party content.** The answer is **No**. See
  `docs/app-store-connect.md`.
- The clause that bites a **paid** app is the common sample-pack one — *use
  these sounds in your music, but do not redistribute them as sounds* — and a
  kit bundled inside an app for other people to play is exactly a
  redistribution of them. Owning the recordings is what makes that question
  moot rather than arguable.

**If a kit is ever added that is NOT his, add it to a table here with its
licence and whether that licence permits redistribution inside a product.**
Shipping a kit whose terms nobody can produce is the kind of thing that
surfaces as a takedown rather than as a build failure, and no test here can
catch it: `build.mjs` checks that the payload has no remote references, not
that its contents are yours to ship.
