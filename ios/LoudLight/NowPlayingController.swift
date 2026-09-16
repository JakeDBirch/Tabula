import UIKit
import MediaPlayer
import WebKit

/// Lock-screen and Control-Centre transport.
///
/// The web layer owns the transport — it has the scheduler, the song position
/// and every reason a play might be refused (an export in flight, an audio
/// session iOS has not given back). So this class does not start or stop
/// anything itself: it turns a remote command into a call to the page's
/// `window.__LL_REMOTE`, and it publishes whatever state the page reports back
/// through the `transport` message handler. One direction each way, no second
/// copy of "is it playing" to drift.
///
/// Two things to know before trusting it on a device:
///
///  • **It needs the app to be the system's Now Playing app**, and an audio
///    session with `.mixWithOthers` generally is not eligible — a mixable app
///    is a secondary source, and iOS gives the lock screen to the primary one.
///    `WebAppViewController.exclusiveAudio` is the switch, and it defaults to
///    exclusive so these controls appear. Keeping the mix option instead means
///    you can jam over a reference track and this whole class is inert. There
///    is no setting that gives both, so it is the user's choice, made in the
///    app (PROJECT ▸ AUDIO ROUTE) rather than decided here.
///  • **It needs audio that survives the screen locking**, which is the core in
///    AVAudioEngine (`CoreAudioHost`), not Web Audio. Lock-screen controls over
///    a WebKit AudioContext would be a dead UI — the context is suspended the
///    moment the app backgrounds.
final class NowPlayingController {

    weak var webView: WKWebView?

    /// Registered once; MPRemoteCommandCenter targets accumulate if you add
    /// them twice and the handler then runs twice per press.
    private var registered = false
    private var isPlaying = false
    /// Held, as opposed to stopped. Both report "not playing", but the lock
    /// screen should not offer to carry on with a performance that has been
    /// rewound — `.paused` and `.stopped` are different states to iOS and the
    /// page is the only thing that knows which one this is.
    private var isPaused = false
    private var title = "Loud Light"

    // MARK: - Commands

    func activate() {
        guard !registered else { return }
        registered = true

        let c = MPRemoteCommandCenter.shared()
        // Only what the app actually has. Everything else is disabled so the
        // lock screen does not draw a control that does nothing — a dead
        // button is worse than an absent one.
        for unused in [c.nextTrackCommand,
                       c.seekForwardCommand, c.seekBackwardCommand,
                       c.skipForwardCommand, c.skipBackwardCommand,
                       c.changePlaybackPositionCommand] {
            unused.isEnabled = false
        }

        c.playCommand.isEnabled = true
        c.playCommand.addTarget { [weak self] _ in
            self?.send("play"); return .success
        }
        c.pauseCommand.isEnabled = true
        c.pauseCommand.addTarget { [weak self] _ in
            self?.send("pause"); return .success
        }
        c.togglePlayPauseCommand.isEnabled = true
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.send("toggle"); return .success
        }
        c.stopCommand.isEnabled = true
        c.stopCommand.addTarget { [weak self] _ in
            self?.send("stop"); return .success
        }

        // ⏮ IS THE STOP BUTTON, and that is a deliberate trade.
        //
        // The Now Playing transport has three fixed slots — ⏮ · ▶/❙❙ · ⏭ — and
        // **stop is never one of them**: iOS draws ■ only as a SUBSTITUTE for
        // the play/pause button, and the one way to ask for that substitution
        // is the live-stream flag, which is exactly what used to deny the lock
        // screen a pause (see `publish()` below). So pause and stop cannot both
        // have the centre slot, there is no API for a fourth button, and the
        // only place a third control can go is one of the flanking slots.
        //
        // `stopCommand` above stays registered and draws nothing; it is how
        // Siri and hardware stop controls reach the transport. This is what
        // puts a stop on the SCREEN, and the glyph says skip-back rather than
        // stop. It is the honest reading here: this app has no tracks to skip
        // to, and "back to the start" is what stop does — it rewinds. The cost,
        // stated plainly, is that a headphone double-press or a Siri "previous
        // track" now rewinds the song rather than doing nothing. One line to
        // undo if it reads wrong on the phone.
        //
        // `nextTrackCommand` stays disabled: there is nothing forward of the
        // song's top to go to, so the right slot would be the dead button this
        // block exists to avoid.
        c.previousTrackCommand.isEnabled = true
        c.previousTrackCommand.addTarget { [weak self] _ in
            self?.send("stop"); return .success
        }
    }

    /// Hand a command to the page. `evaluateJavaScript` must run on the main
    /// thread; remote command targets are not guaranteed to.
    private func send(_ command: String) {
        let js = "window.__LL_REMOTE && window.__LL_REMOTE('\(command)')"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js) { _, error in
                if let error = error {
                    NSLog("[LoudLight] remote '%@' failed: %@", command, error.localizedDescription)
                }
            }
        }
    }

    // MARK: - State published by the page

    func update(playing: Bool, paused: Bool, title: String?) {
        isPlaying = playing
        isPaused = paused
        if let t = title, !t.isEmpty { self.title = t }
        publish()
    }

    /// **Do not set `MPNowPlayingInfoPropertyIsLiveStream` here.** It was set,
    /// for a good reason that stopped being good: a sequencer loops, so it has
    /// no duration and nothing to scrub, and the live-stream flag is how you
    /// say that — the lock screen then draws no progress bar instead of one
    /// pinned at zero.
    ///
    /// The cost was not obvious and is the whole point of this comment: iOS
    /// treats a live stream as something that CANNOT BE PAUSED, so the Now
    /// Playing UI substitutes a **stop** button for the play/pause one. The
    /// `pauseCommand` registered above stayed registered and stayed unreachable
    /// — there was simply no pause on the lock screen to press, which is
    /// exactly how it was reported, twice.
    ///
    /// So the flag is gone and the trade is taken the other way round: a
    /// transport you can actually pause is worth more than a tidy absence of
    /// progress furniture. Duration and elapsed time are still deliberately
    /// NOT published — without them there is no meaningful bar to draw — and
    /// `changePlaybackPositionCommand` is disabled, so nothing here is
    /// draggable either way.
    private func publish() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: "Loud Light",
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        if let art = Self.artwork { info[MPMediaItemPropertyArtwork] = art }

        let centre = MPNowPlayingInfoCenter.default()
        centre.nowPlayingInfo = info
        centre.playbackState = isPlaying ? .playing : (isPaused ? .paused : .stopped)
    }

    /// The app icon out of the web payload — the same file the home screen and
    /// the page header use, so the lock screen is not the one place showing a
    /// different mark. Loaded once; a miss just means no artwork.
    private static let artwork: MPMediaItemArtwork? = {
        guard let url = Bundle.main.url(forResource: "icon", withExtension: "png", subdirectory: "www"),
              let data = try? Data(contentsOf: url),
              let image = UIImage(data: data) else { return nil }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }()
}
