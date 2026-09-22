# App Store Connect — the copy, and what it has to agree with

Everything to paste into App Store Connect for a **public (external) TestFlight
beta**, plus the answers to the questionnaires that gate it.

The one rule that runs through all of it: **the App Privacy answers, the privacy
manifest (`ios/LoudLight/PrivacyInfo.xcprivacy`) and `privacy.html` must say the
same thing.** They are three descriptions of one set of facts, read by three
different audiences, and a mismatch between them is the kind of thing review
bounces on — the manifest is machine-checked at upload, and a reviewer reads the
other two. Change one, change all three.

---

## Order of operations

External testing needs Beta App Review, which needs the metadata below, which
needs a build. So:

1. **Run the SQL** in `docs/cloud-sync.md` (it now defines `delete_account()`,
   which the in-app DELETE ACCOUNT calls — without it that button 404s, and it
   is a store requirement under 5.1.1(v)).
2. **Device checks** — `docs/ios-testflight.md`, "Verify on device before you
   trust it". This is the critical path, not the copy: nothing here matters if
   the app does not make a sound. `CoreAudioHost` has still never run on
   hardware.
3. **Fill in the metadata below**, including App Privacy and the age rating.
4. **Build**: Actions ▸ iOS TestFlight ▸ Run workflow ▸ main. (A cloud session
   cannot press this — see the note in CLAUDE.md.)
5. **Internal group first.** No review, live in minutes. Anything that goes
   wrong, goes wrong here rather than in front of a reviewer.
6. **Then external**: add the build to an external group and submit for Beta App
   Review. First build of each version string only; later builds on the same
   version go straight out.

---

## Test Information

*TestFlight ▸ Test Information. These are per-app, not per-build, so they are
typed once.*

### Beta App Description

> Loud Light is a touch-first grid sequencer — a drum machine and two synth
> voices on one screen, built to be played with your thumbs rather than
> configured.
>
> Tap cells to place notes. Three parts (a polyphonic synth, a monophonic lead
> and a 13-voice drum kit) run in one pattern and can be different lengths and
> different speeds at once, so patterns drift against each other instead of
> locking to one bar. Patterns go into a song lane you can drag them around in.
>
> Everything that shapes the sound is on one screen: per-layer filter, envelope
> and glide; a delay and a reverb; and a master stage with drive and a
> three-band exciter that reads in words rather than decibels, because you dial
> those by ear.
>
> It exports MIDI and MP3, records short samples from the microphone onto any
> drum voice, and works entirely offline — the whole app, the samples and every
> library it needs are in the download. Signing in is optional and only does one
> thing: keeps your projects on your account so they survive a lost phone.
>
> This beta is the first time the audio engine has run outside a browser. It is
> a C DSP core hosted in AVAudioEngine, which is what lets the sequencer keep
> playing with the screen locked. Sound quality, timing and background playback
> are the things worth being hard on.

*(~1,400 characters. Limit is 4,000.)*

### Feedback Email

Jake's — whichever address you want beta mail going to. It is shown to every
tester, so it is a public address in practice.

### Privacy Policy URL

```
https://jakedbirch.github.io/Tabula/privacy.html
```

Committed as `privacy.html` at the repo root and served by Pages from `main`.
**Change the contact address on it first** — it currently reads
`privacy@loudlight.co`, which is a placeholder.

### Marketing URL (optional)

```
https://jakedbirch.github.io/Tabula
```

The live web build. Reasonable to give: it is the same app, and it lets a
prospective tester try it before installing anything.

### What to Test

> **The short version: does it sound right, and does it keep sounding?**
>
> 1. **Does it make a sound, and the right one.** The engine is new on iOS —
>    the same project should sound identical to the web version at
>    jakedbirch.github.io/Tabula. Anything that sounds different is a bug worth
>    reporting, however small.
> 2. **Lock the screen while a song is playing.** It should keep going. Switch
>    to another app: same. Take a phone call and hang up: it should come back on
>    its own. The lock screen should show a transport (play/pause, and ⏮ is
>    stop).
> 3. **Force-quit with unsaved work.** Make a pattern, swipe the app away from
>    the app switcher, reopen. Your work should still be there. If it is not, say
>    so immediately — that one is serious.
> 4. **Timing.** Play something busy for a few minutes. Listen for drums
>    doubling up, flamming or stuttering, especially after switching away and
>    back, or in Low Power Mode.
> 5. **Export.** MIDI and MP3 (PROJECT ▸ EXPORT) should both open the iOS share
>    sheet. Check the file actually arrives wherever you send it.
> 6. **Cloud sign-in**, if you want to use it. It is an emailed code, no
>    password. Save a project, delete it from the device, load it back.
> 7. **The microphone**, if you want to sample: SOUND ▸ DRUMS ▸ set KIT to
>    USER, tap a voice's name to step into its channel, then REC, and make a
>    noise. It arms on the first transient and stops when you stop. (REC only
>    appears on the USER kit — there is nowhere to put a recording otherwise.)
> 8. **iPad**: drag the window narrow and wide while it is playing.
> 9. **How it feels under your fingers** — the part no test can answer. Drags
>    that stick, taps that miss, anything that fights you.
>
> New here? PROJECT ▸ HOW IT WORKS lists every gesture. Most of what the app can
> do is a hold or a drag, and there is no way to guess them.

### Beta App Review Information

| Field | Answer |
|---|---|
| Contact | Jake's name, email, phone |
| **Sign-in required** | **No** |
| Demo account | not needed — see the note |
| Notes | below |

**Sign-in is NO, and that is worth getting right.** Answering yes obliges you to
supply working credentials, and there are none to supply: sign-in is an emailed
one-time code, so there is no password that could be handed over. It is also
genuinely optional — every feature except cloud storage works signed out. The
notes say so, so a reviewer who tries it and hits a code prompt knows it is by
design rather than a wall.

> **Review notes**
>
> Loud Light is a music sequencer. It runs entirely offline — the app, its
> samples and every library it uses are in the download, and there is no URL
> being loaded. Turn on airplane mode and it is fully functional.
>
> **No sign-in is required.** Everything except cloud project storage works
> without an account. Sign-in, if you want to try it, is an emailed one-time
> code to any address — there is no password, so there is no demo account to
> provide. PROJECT ▸ CLOUD.
>
> **Account deletion** is inside the app: PROJECT ▸ CLOUD ▸ DELETE ACCOUNT,
> which removes the account and every project stored under it.
>
> **Microphone** is used by the drum sampler only, to record a short sample onto
> a drum pad: SOUND ▸ DRUMS ▸ KIT: USER ▸ tap a voice's name ▸ REC. It is never
> used anywhere else in the app, and the app does not use the camera at all.
>
> **Background audio** is declared and used: the sequencer is a C audio engine
> in AVAudioEngine, not a web page playing sound, and it keeps running with the
> screen locked. Lock-screen transport controls are provided.
>
> If it helps: PROJECT ▸ HOW IT WORKS is a full gesture reference. The app is
> deliberately gesture-heavy and the first-launch screen is that reference.

---

## App Privacy

*App Store Connect ▸ your app ▸ App Privacy. Required before you can submit for
external testing. It must match `ios/LoudLight/PrivacyInfo.xcprivacy` — which is
uploaded inside the build — exactly.*

**Do you or your third-party partners collect data from this app?** → **Yes.**

Three types, and no others:

| Data type | Where it is in the questionnaire | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| **Email Address** | Contact Info | **Yes** | No | App Functionality |
| **Audio Data** | User Content | **Yes** | No | App Functionality |
| **Other User Content** | User Content | **Yes** | No | App Functionality |

Everything else — identifiers, usage data, diagnostics, location, contacts,
photos, purchases, search history, browsing history, sensitive info, health,
financial — is **not collected**. There is no analytics SDK, no crash reporter,
no ad network, and no third-party SDK of any kind in the app.

**Tracking: No.** `NSPrivacyTracking` is false and the tracking-domains list is
empty, so App Tracking Transparency does not apply and no ATT prompt is shown.

What each one actually is, in case review asks:

- **Email Address** — the account identifier for cloud sync. Used to send the
  one-time sign-in code and to own the rows. Linked by definition.
- **Audio Data** — samples recorded with the drum sampler's REC. They are stored
  in the project; they leave the device only when a project carrying one is
  saved to the **cloud** (`getShareState(true)` base64s them into the payload).
  A save to the **device** transmits nothing.
- **Other User Content** — the projects themselves: patterns, songs, sound
  settings.

**All three are true only with cloud sync switched on.** With `CLOUD_URL` blank
the app makes no network requests at all and collects nothing. The beta ships
with it on, so all three are declared. If the cloud ever comes out, all three
come out of the manifest, this page and `privacy.html` together — declaring
collection that does not happen is its own kind of wrong.

---

## App Information

- **Name**: Loud Light
- **Bundle ID**: `co.loudlight.sequencer` (permanent, already set)
- **Primary category**: Music. **Secondary**: Entertainment, or leave blank.
- **Age rating**: **4+**. Nothing in it rates: no user-to-user communication,
  no web browsing, no purchases, no content of any kind beyond the sounds in the
  box. The microphone records onto a drum pad; it does not publish anything.
- **Export compliance**: already answered in the binary.
  `ITSAppUsesNonExemptEncryption` is `false` in `Info.plist`, so the upload
  never asks. It is the correct answer: the only cryptography is HTTPS to
  Supabase, which is the standard exemption.

### Content rights — **your call, and worth making before external review**

App Store Connect asks whether the app contains third-party content. It ships
two sample kits (`samples/808-kit`, `samples/vp-kit`), and **I do not know where
those came from.** If they are from a pack whose licence permits redistribution
inside a product, the answer is straightforward. If they are not — or if the
licence is one of the common "for use in your music, not for resale as sounds"
kinds — that is a real exposure for a paid app, and much cheaper to settle now
than after a takedown.

Check the licence, and if it is unclear, either replace the kits or ship with
the synthesized voices as the default. Nothing else in the app is anyone else's:
React, lamejs and DM Sans are all permissively licensed and credited in
`vendor/`.

---

## After the first external build

- **Builds expire after 90 days** — they stop launching, without warning.
- **Beta App Review is per version string**, not per build. Bump
  `MARKETING_VERSION` in `ios/Config/LoudLight.xcconfig` and the next build
  needs review again; keep the version and later builds go straight to testers.
- **The public link** (TestFlight ▸ your external group ▸ Enable Public Link)
  takes up to 10,000 testers with no invitations to manage. It can be turned off
  again, and it can be capped.
- **Every upload notifies your testers.** Ship when there is something to hear.

---

## What is still unverified

Stated plainly, because the copy above describes behaviour that has not been
observed on hardware:

- **The audio engine has never run on a device.** Everything "What to Test"
  asks about in points 1–4 is a claim from a test suite, not from a phone.
- **Background and lock-screen audio** are reasoned from how AVAudioEngine
  works, and the Now Playing transport from documented iOS behaviour. If
  background playback does not hold, `UIBackgroundModes: audio` must come out of
  `Info.plist` before external review — declaring a background mode the app does
  not use is itself a rejection reason.
- **The microphone in a WKWebView.** `NSMicrophoneUsageDescription` is now
  present (without it iOS terminates the app at the request) and the WKUIDelegate
  grants the capture ask, but whether `getUserMedia` is exposed at all under the
  `loudlight://app` custom scheme is untested. If it is not, `navigator
  .mediaDevices` is simply absent and the app shows "MIC UNSUPPORTED" rather
  than failing — a feature that does not work, not a crash. Check REC on the
  device before "What to Test" tells testers to try it.
