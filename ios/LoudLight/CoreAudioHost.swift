import AVFoundation
import UIKit
import WebKit
import os

/// Hosts the DSP core (core/) in AVAudioEngine — the second of its two hosts.
///
/// The web page inside the WKWebView is the controller: it posts the same
/// messages to `webkit.messageHandlers.core` that it would post to the
/// AudioWorklet on the web (binary as base64), and this class applies them to
/// the core and pulls stereo blocks out of it in an `AVAudioSourceNode` render
/// block. Because the sequencer runs INSIDE that render block, the music keeps
/// going when the screen locks or the app is switched away from — which Web
/// Audio in a WKWebView never could, and is the reason the shell exists.
///
/// Threads: the render block runs on Core Audio's real-time thread and every
/// message arrives on the main thread. The core is single-threaded C, so a
/// single `os_unfair_lock` guards every call into it. The render holds it for
/// one block (a millisecond or two); a message holds it for microseconds — the
/// one large copy, a sample's frames, is done OUTSIDE the lock, into a region
/// that is private until `ll_sample_commit`.
final class CoreAudioHost: NSObject {

    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private let lock: UnsafeMutablePointer<os_unfair_lock_s>
    private(set) var sampleRate: Double
    private var eventTimer: Timer?
    private var eventBuf = [Int32](repeating: 0, count: 1024)
    private var started = false
    weak var webView: WKWebView?

    override init() {
        lock = UnsafeMutablePointer<os_unfair_lock_s>.allocate(capacity: 1)
        lock.initialize(to: os_unfair_lock_s())
        // Valid once the session has been activated (WebAppViewController does
        // that before creating the host). The core is initialised at this rate
        // and the engine converts if the route's rate differs.
        var sr = AVAudioSession.sharedInstance().sampleRate
        if sr < 8000 { sr = 48000 }
        sampleRate = sr
        super.init()
        ll_init(Float(sr))
    }

    deinit {
        lock.deallocate()
    }

    /// Register the message channel and tell the page which rate the engine
    /// runs at, before any of its scripts run.
    func attach(to controller: WKUserContentController) {
        controller.add(self, name: "core")
        let script = WKUserScript(
            source: "window.__LL_NATIVE_SR=\(Int(sampleRate));",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        controller.addUserScript(script)
    }

    // MARK: - Engine

    private func locked(_ body: () -> Void) {
        os_unfair_lock_lock(lock)
        body()
        os_unfair_lock_unlock(lock)
    }

    /// Bring the engine up on first use — first play, first audition — rather
    /// than at launch, so a launch never fails on audio.
    private func start() {
        if started { resume(); return }
        started = true
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2)!
        let lock = self.lock
        let node = AVAudioSourceNode(format: format) { _, _, frameCount, abl -> OSStatus in
            let buffers = UnsafeMutableAudioBufferListPointer(abl)
            guard buffers.count >= 2, let l = buffers[0].mData, let r = buffers[1].mData else { return noErr }
            os_unfair_lock_lock(lock)
            ll_render(l.assumingMemoryBound(to: Float.self), r.assumingMemoryBound(to: Float.self), Int32(frameCount))
            os_unfair_lock_unlock(lock)
            return noErr
        }
        source = node
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        resume()
        eventTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            self?.drainEvents()
        }
    }

    /// (Re)start the engine — after an interruption, on return to the
    /// foreground. Idempotent; a running engine is left alone.
    func resume() {
        guard started, !engine.isRunning else { return }
        do {
            try engine.start()
        } catch {
            NSLog("[LoudLight] core: engine start failed: %@", error.localizedDescription)
        }
    }

    // MARK: - Events back to the page

    /// The core reports what it is sounding (steps, the playing pattern, song
    /// position, pulse, drum hits). Handed to the page as one array per tick;
    /// dropped while the app is not active, since the page's JS may be
    /// suspended and the audio does not need it.
    private func drainEvents() {
        var n: Int32 = 0
        locked { n = ll_events(&eventBuf, Int32(eventBuf.count)) }
        guard n > 0 else { return }
        guard UIApplication.shared.applicationState == .active, let webView = webView else { return }
        let list = eventBuf[0..<Int(n)].map { String($0) }.joined(separator: ",")
        webView.evaluateJavaScript("window.__LL_CORE_HOST&&window.__LL_CORE_HOST.onNativeEvents([\(list)])") { _, error in
            if let error = error { NSLog("[LoudLight] core: events failed: %@", error.localizedDescription) }
        }
    }
}

// MARK: - Messages from the page

extension CoreAudioHost: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "core",
              let m = message.body as? [String: Any],
              let t = m["t"] as? String else { return }
        let num = { (k: String) -> Double in (m[k] as? NSNumber)?.doubleValue ?? 0 }
        let f = { (k: String) -> Float in Float(num(k)) }
        let i = { (k: String) -> Int32 in Int32(num(k)) }

        switch t {
        case "set":
            locked { ll_set(i("id"), f("v")) }
        case "layer":
            locked { ll_set_layer(i("l"), i("id"), f("v")) }
        case "drum":
            locked { ll_set_drum(i("d"), i("id"), f("v")) }
        case "freqs":
            guard let arr = m["f"] as? [NSNumber], arr.count == 16 else { return }
            let hz = arr.map { Float($0.doubleValue) }
            hz.withUnsafeBufferPointer { p in locked { ll_set_freqs(p.baseAddress) } }
        case "pat":
            guard let b64 = m["b64"] as? String, let data = Data(base64Encoded: b64) else { return }
            let slot = i("slot")
            locked {
                guard let dst = ll_scratch(Int32(data.count)) else { return }
                data.copyBytes(to: dst, count: data.count)
                let rc = ll_pattern_load(slot, Int32(data.count))
                if rc != 0 { NSLog("[LoudLight] core: pattern %d rejected (%d)", slot, rc) }
            }
        case "patclear":
            locked { ll_pattern_clear(i("slot")) }
        case "song":
            let ids = ((m["ids"] as? [NSNumber]) ?? []).map { Int32($0.intValue) }
            ids.withUnsafeBufferPointer { p in locked { ll_song_set(p.baseAddress, Int32(p.count)) } }
        case "play":
            start()
            locked { ll_play() }
        case "stop":
            locked { ll_stop() }
        case "note":
            start()
            locked { ll_audition_note(i("l"), f("hz"), f("sec")) }
        case "hit":
            start()
            locked { ll_audition_drum(i("d"), i("vel")) }
        case "flush":
            locked { ll_flush() }
        case "samples_clear":
            locked { ll_samples_clear() }
        case "sample":
            // Float32 little-endian frames as base64. Allocate under the lock,
            // copy outside it: the region is private until the commit.
            guard let b64 = m["b64"] as? String, let data = Data(base64Encoded: b64) else { return }
            let frames = Int32(data.count / 4)
            var dst: UnsafeMutablePointer<Float>?
            locked { dst = ll_sample_alloc(i("d"), i("kind"), i("slot"), frames, f("sr")) }
            guard let out = dst else {
                NSLog("[LoudLight] core: sample arena full (voice %d)", i("d"))
                return
            }
            data.copyBytes(to: UnsafeMutableRawPointer(out).assumingMemoryBound(to: UInt8.self), count: Int(frames) * 4)
        case "sample_commit":
            locked { ll_sample_commit(i("d"), i("kind"), i("n")) }
        case "ping":
            var playing: Int32 = 0
            var frame: Double = 0
            locked { playing = ll_playing(); frame = ll_frame() }
            let js = "window.__LL_CORE_HOST&&window.__LL_CORE_HOST.onNativePong({native:true,playing:\(playing),coreFrame:\(frame),sr:\(Int(sampleRate)),running:\(engine.isRunning)})"
            webView?.evaluateJavaScript(js, completionHandler: nil)
        default:
            NSLog("[LoudLight] core: unknown message %@", t)
        }
    }
}
