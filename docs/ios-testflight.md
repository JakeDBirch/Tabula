# Loud Light on iOS — native app and TestFlight

How the web app becomes something you can install from TestFlight, what has to
happen on Apple's side, and what is still unverified.

---

## The shape of it

Loud Light is one static HTML file. The iOS app is that same file, plus the samples
and every library it used to pull from a CDN, bundled inside a ~150-line native
shell: a full-screen `WKWebView` that owns the audio session, serves the payload
from a custom URL scheme, and hands finished exports to the iOS share sheet.

Nothing is duplicated. `src/loudlight.jsx` is still the only source, and
`npm run build:ios` emits a second target next to `index.html`:

```
src/loudlight.jsx ──┬── index.html   (GitHub Pages: React from CDN, service worker)
                 └── ios/www/     (the app bundle: everything local, no network)
```

The iOS payload is asserted to be self-contained — the build **fails** if a
remote URL survives into it. That guard is the point: a beta that white-screens
on the Tube because a CDN was unreachable is worse than no beta.

---

## Which route

| | Cost | Time to first install | Review |
|---|---|---|---|
| **PWA — Add to Home Screen** | £0 | now | none |
| **TestFlight, internal testers** | the £79/yr you already paid | ~1 hour of setup | **none** |
| **TestFlight, public link** | same | + a day or two | Beta App Review |
| **App Store** | same | + days to weeks | full review |

Start at internal TestFlight. Internal builds go live minutes after upload with
no Apple review at all, which is the whole reason to start there — see
[Going public](#going-public-later) for why that matters more than it sounds.

---

## One-time Apple setup

You need the Team ID and a bundle identifier before anything will build.

**1. Team ID.** [developer.apple.com/account](https://developer.apple.com/account)
→ Membership details → Team ID. Ten characters. Put it in
`ios/Config/LoudLight.xcconfig` and commit — it is not a secret, it appears in
every provisioning profile.

**2. Bundle identifier.** Already set to `co.loudlight.sequencer` in
`ios/Config/LoudLight.xcconfig` — reverse-DNS of `loudlight.co`. It has to match
the App ID you register in App Store Connect **exactly**, and it is permanent: a
bundle ID can never be renamed or reused once a build has been uploaded. So the
only thing to get right is typing the same string in both places.

**3. Register the app.** [App Store Connect](https://appstoreconnect.apple.com)
→ Apps → **+** → New App. Platform iOS, your bundle ID, SKU anything (`tabula`),
name — and here is the one thing worth deciding now rather than later:

> **The name.** Settled — the app is Loud Light, and that is what goes in App
> Store Connect. The *bundle identifier* is the part that is permanent: it can
> never be renamed or reused once a build has been uploaded, so get it right on
> the first attempt. It is set in `ios/Config/LoudLight.xcconfig`.

---

## Route A — from your Mac

Fastest way to a build on your own phone, and the only way to attach Safari's
Web Inspector to the running app.

```bash
npm ci
npm run build:ios            # emits ios/www — must exist before generating

brew install xcodegen        # once
cd ios && xcodegen generate  # writes LoudLight.xcodeproj from project.yml
open LoudLight.xcodeproj
```

Then in Xcode:

1. Plug in your iPhone, pick it as the run destination, and hit **Run**. First
   time it will ask you to trust the developer certificate on the device
   (Settings → General → VPN & Device Management). **Do this before archiving**
   — it is where signing problems surface, and they are far easier to read in
   the Run flow than in an archive log.
2. Once it runs: **Product → Archive** (the destination must be "Any iOS
   Device", not a simulator, or Archive is greyed out).
3. In the Organizer window: **Distribute App → App Store Connect → Upload**.
4. Wait 5–15 minutes for processing, then App Store Connect → your app →
   TestFlight.

`LoudLight.xcodeproj` is generated and gitignored. Anything you change in Xcode's
project or target inspector is **lost on the next `xcodegen generate`** — signing
and versioning live in `Config/Loud Light.xcconfig` for exactly that reason, and
anything structural belongs in `project.yml`.

---

## Route B — from CI

`.github/workflows/ios-testflight.yml` does the same thing on a GitHub-hosted
macOS runner: build the payload, generate the project, archive, upload. Useful
once the first build is working, so shipping a beta is a button rather than an
afternoon.

Create an API key: App Store Connect → **Users and Access → Integrations →
App Store Connect API → Team Keys → +**, role **App Manager**. The `.p8`
downloads **once and only once** — Apple will not let you download it again.

Add three repository secrets (Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
|---|---|
| `APPSTORE_KEY_ID` | the Key ID column, e.g. `ABC123DEFG` |
| `APPSTORE_ISSUER_ID` | the Issuer ID above the key list, a UUID |
| `APPSTORE_PRIVATE_KEY` | `base64 -i AuthKey_ABC123DEFG.p8 \| pbcopy` |

There is no certificate or provisioning profile to export: `xcodebuild
-allowProvisioningUpdates` creates them on the runner using that key. One less
set of secrets to rotate, and no `.p12` sitting in a password manager.

Then **Actions → iOS TestFlight → Run workflow**, or push a tag:

```bash
git tag ios-v1.0.0 && git push origin ios-v1.0.0
```

The build number is the workflow run number, so it always increases — App Store
Connect rejects an upload that reuses one, and that is the single most common
way a first CI upload fails.

The workflow does **not** run on every push to `main`. macOS runner minutes are
billed at 10× Linux, every upload notifies your testers, and a CSS tweak is not
a beta. The cheap Linux half — build the payload, assert it has no remote
references — *does* run on every push.

---

## Getting it onto devices

**Yourself and a few people (no review):** App Store Connect → Users and Access
→ **+** → invite them with the **Developer** role (or **App Manager**). Then
TestFlight → Internal Testing → add them to a group. They install Apple's
TestFlight app, accept the mail, and the build is there. Up to 100 people, live
within minutes of processing, **no Apple review**.

Each internal tester needs an App Store Connect user seat, so it is the right
mechanism for you and a handful of trusted ears, not for a mailing list.

**Builds expire after 90 days.** Not a warning — the build stops launching. Plan
on re-uploading, or expect a puzzled message from someone in three months.

---

## iPad

The build targets iPhone **and** iPad (`TARGETED_DEVICE_FAMILY = "1,2"` in
`ios/project.yml`). One app, one build, one TestFlight entry — install it on the
iPad from the same TestFlight invite you used on the phone.

Nothing in the web app needed changing for it. `IS_MOBILE` keys off
`navigator.maxTouchPoints`, so an iPad gets the **touch** layout rather than the
desktop one, and the layout is flex + `dvh` throughout with `isLandscape`
recomputed on resize. What you gain is size: grid cells go from about 21px on a
phone to about 48px on an 11" iPad, which is the actual reason to play it there.

The thing to know about modern iPadOS: **every app is a resizable window now.**
`UIRequiresFullScreen` is deprecated and ignored from iPadOS 26, so there is no
way to demand full screen and no point declaring it — "iPad support" really
means "survives an arbitrary window size". Checked headlessly from 400×700 up to
1194×834 and through a live resize: no overflow in either axis at any size, no
errors, and the layout returns to its original geometry when the window goes
back. Worth a real drag on the device anyway — a rail layout that reflows
correctly can still *feel* wrong.

An iPhone-only build would have installed on an iPad regardless, letterboxed in
compatibility mode. This is the difference between that and the app actually
using the screen.

## Going public later

External testing (up to 10,000, shareable public link) needs **Beta App
Review** on the first build of each version string. It is lighter than full App
Store review, but it is where the real risk sits:

> **Guideline 4.2 — Minimum Functionality.** Apple rejects apps that are "not
> sufficiently different from a mobile web browsing experience". A full-screen
> web view pointed at a website is the textbook case, and it is what Apple calls
> a "web clipping".

Loud Light is not in the worst part of that bracket, and the shell was written with
this in mind. What is already on its side:

- **It is not a website in a box.** The payload is bundled and the app is fully
  functional with the device in airplane mode. There is no URL being loaded.
- **It does something a browser tab does not.** It owns the audio session,
  defers the bottom system edge gesture so a drag near the transport is not a
  swipe home, and routes MIDI/MP3 exports into the iOS share sheet.
- **It is a creation tool with real output** — MIDI and MP3 files, an account
  system, and cloud-backed project storage. "Useful, unique and app-like" is the
  bar, and a sequencer clears the *useful* and *unique* parts easily.

If it does get bounced, the substantive answers are native ones: **Audio Unit
(AUv3) or Inter-App Audio**, so Loud Light appears as an instrument inside
GarageBand and Logic; **Ableton Link** for tempo sync; **Core MIDI** in and out
so it drives hardware. Any one of those is unarguably not a web page — and each
is a thing you would want anyway. Which is the honest read: shipping the wrapper
gets it on phones now, and the native audio work is what makes it an iOS app
rather than a website with an icon.

---

## Verify on device before you trust it

I could not test any of this on hardware — there is no Mac, no Xcode and no
iPhone in the environment it was written in. The web payload is verified
(renders headlessly, loads React and the font locally, makes zero network
requests, install hint correctly suppressed). **The Swift has never been
compiled.** Expect to fix something in the first build.

Specifically worth checking by hand and by ear, in rough order of how likely
they are to bite:

1. **Does it launch at all**, and does the grid fill the screen with the notch
   and home-indicator insets in the right places (not doubled).
2. **Does a project survive a force-quit.** This is the important one. The whole
   project library and autosave live in `localStorage`; the shell serves the app
   from a custom `loudlight://app` origin specifically so that store is stable
   across launches. Make a pattern, force-quit from the app switcher, reopen.
3. **Ring/silent switch.** The shell asks for an `AVAudioSession` `.playback`
   category, which should mean the sequencer keeps sounding on silent — but
   `WKWebView` runs an audio session of its own and does not reliably honour
   what the host app sets. This may simply not take.
4. **Lock screen / backgrounding.** `UIBackgroundModes: audio` is declared, but
   WKWebView background audio has a long history of stopping and not resuming.
   **If it does not work, remove the key** — declaring a background mode the app
   does not use is itself a rejection reason.
5. **MIDI and MP3 export.** `<a download>` is a silent no-op in a WKWebView, so
   `downloadBlob` now posts the bytes to the shell, which presents the share
   sheet. Untested end to end.
6. **Cloud sync.** Requests now carry an `Origin` of `loudlight://app` rather than
   an `https://` one. Supabase's CORS should accept it, but sign-in is the place
   to find out if it does not.
7. **iPad specifically:** drag the window narrow and wide with the app running.
   The layout is verified to reflow, but a resizable window is also a new
   interruption source for the audio graph, and that part is untested.
8. **Latency and touch feel**, which is the only part of this no test can answer.

To attach Safari's Web Inspector to a Debug build: run from Xcode, then
Safari → Develop → *your device* → Loud Light. For a TestFlight build, add
`LLWebInspectorEnabled = YES` to `ios/LoudLight/Info.plist` first — it is off in
Release builds by default, and should stay off for anything you ship publicly.
