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
///    `WebAppViewController.exclusiveAudio` is the switch. Keeping the mix
///    option means you can still jam over a reference track; taking it means
///    Loud Light owns the lock screen and interrupts whatever else is playing.
///    That is a product decision, so it is a one-line constant rather than a
///    choice made here.
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
    private var title = "Loud Light"

    // MARK: - Commands

    func activate() {
        guard !registered else { return }
        registered = true

        let c = MPRemoteCommandCenter.shared()
        // Only the three the app actually has. Everything else is disabled so
        // the lock screen does not draw a skip button that does nothing —
        // a dead control is worse than an absent one.
        for unused in [c.nextTrackCommand, c.previousTrackCommand,
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

    func update(playing: Bool, title: String?) {
        isPlaying = playing
        if let t = title, !t.isEmpty { self.title = t }
        publish()
    }

    /// A sequencer loops — it has no duration, no elapsed time and nothing to
    /// scrub. `isLiveStream` is how you say that: the lock screen then shows a
    /// transport and no progress bar, instead of a bar pinned at zero.
    private func publish() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: "Loud Light",
            MPNowPlayingInfoPropertyIsLiveStream: true,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        if let art = Self.artwork { info[MPMediaItemPropertyArtwork] = art }

        let centre = MPNowPlayingInfoCenter.default()
        centre.nowPlayingInfo = info
        centre.playbackState = isPlaying ? .playing : .paused
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
