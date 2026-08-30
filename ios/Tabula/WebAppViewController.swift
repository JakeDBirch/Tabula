import UIKit
import WebKit
import AVFoundation

/// The whole app: one full-bleed WKWebView running the bundled Tabula payload,
/// plus the handful of things a web page on iOS cannot do for itself — own the
/// audio session, hand a finished export to the share sheet, and keep the system
/// edge gestures out of the way of the grid.
final class WebAppViewController: UIViewController {

    private var webView: WKWebView!
    private let schemeHandler = BundleSchemeHandler()

    /// Shown instead of a white screen when the payload fails to load. A blank
    /// launch on a device you can't attach a debugger to is indistinguishable
    /// from a hang; the message says which of the two it is.
    private lazy var failureLabel: UILabel = {
        let l = UILabel()
        l.numberOfLines = 0
        l.textAlignment = .center
        l.textColor = UIColor(red: 0.91, green: 0.88, blue: 0.84, alpha: 1)
        l.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        l.isHidden = true
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.102, green: 0.094, blue: 0.078, alpha: 1) // #1a1814
        configureAudioSession()
        buildWebView()
        webView.load(URLRequest(url: BundleSchemeHandler.indexURL))

        // The audio session is deactivated out from under us by interruptions
        // (a phone call, another app taking the route). Re-arm on every return
        // to the foreground rather than only at launch.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(configureAudioSession),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    // Light glyphs on the near-black canvas.
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // Dim the home indicator — this is a full-screen instrument and a bright
    // white bar sitting over the bottom row of the grid is a distraction.
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    // Require a second swipe from the bottom edge before the system takes it.
    // Tabula's transport row and drum grid run right to the bottom of the
    // screen, and a drag that starts there should be a drag, not a trip home.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom] }

    // MARK: - Web view

    private func buildWebView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: BundleSchemeHandler.scheme)

        // Persistent store — this is where localStorage lives, and localStorage
        // is where autosave and the entire project library live. A non-persistent
        // store here would quietly discard the user's work on every quit.
        config.websiteDataStore = .default()

        // Web Audio and sample playback must start from the app's own logic, not
        // from a synthesised user gesture per element.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let controller = WKUserContentController()
        controller.add(self, name: "saveFile")
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor

        // The page is position:fixed with overflow:hidden and manages its own
        // paging, so any scrolling here is rubber-banding the user did not ask
        // for — and on a drag-driven grid it reads as the app slipping.
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Safari Web Inspector. Off in Release unless the plist opts in, because
        // an inspectable production build hands anyone with a cable a debugger.
        // To inspect a TestFlight build, add TBWebInspectorEnabled = YES to
        // Info.plist for that build and connect via Safari ▸ Develop.
        if #available(iOS 16.4, *) {
            #if DEBUG
            webView.isInspectable = true
            #else
            webView.isInspectable =
                Bundle.main.object(forInfoDictionaryKey: "TBWebInspectorEnabled") as? Bool ?? false
            #endif
        }

        view.addSubview(webView)
        view.addSubview(failureLabel)

        // Pinned to the view's edges, NOT the safe area. The page already reads
        // env(safe-area-inset-*) — it is the same layout the home-screen PWA
        // renders — so insetting the web view here would apply the notch and
        // home-indicator padding twice.
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            failureLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            failureLabel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            failureLabel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
        ])
    }

    private func showFailure(_ message: String) {
        failureLabel.text = "Tabula could not start.\n\n\(message)"
        failureLabel.isHidden = false
        webView.isHidden = true
        NSLog("[Tabula] load failed: %@", message)
    }

    // MARK: - Audio

    /// Claim a playback audio session so the sequencer behaves like an instrument
    /// rather than like a web page: it keeps sounding with the ring/silent switch
    /// on silent, and (with the `audio` background mode declared in Info.plist)
    /// keeps running when the screen locks.
    ///
    /// Caveat worth knowing before you trust it: WKWebView manages an audio
    /// session of its own and does not always honour the category the host app
    /// sets. Treat this as the app asking politely, and verify the actual
    /// behaviour on a device — silent switch, lock screen, and a phone call
    /// interrupting playback — rather than assuming it took.
    @objc private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            // .mixWithOthers so Tabula plays over whatever is already running
            // instead of stopping it — you should be able to jam along with a
            // reference track. Drop the option to make Tabula exclusive.
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            // Not fatal: audio still routes through WebKit's own session. Log so
            // a silent app on a device has somewhere to start.
            NSLog("[Tabula] audio session setup failed: %@", error.localizedDescription)
        }
    }
}

// MARK: - Navigation

extension WebAppViewController: WKNavigationDelegate, WKUIDelegate {

    /// Keep the app on its own payload. Anything else — a cloud-sync auth link,
    /// a support URL — opens in Safari, so a stray navigation can never strand
    /// the user in a chromeless web view with no way back.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == BundleSchemeHandler.scheme {
            decisionHandler(.allow)
        } else if url.scheme == "http" || url.scheme == "https" || url.scheme == "mailto" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.cancel)
        }
    }

    /// `window.open` has no home in a single-web-view app; route it out to Safari
    /// rather than dropping it on the floor.
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, navigationAction.targetFrame == nil {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFailure(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure(error.localizedDescription)
    }

    /// A web-content crash leaves a live but permanently blank web view. Reload
    /// rather than leave the user staring at nothing.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[Tabula] web content process terminated — reloading")
        webView.load(URLRequest(url: BundleSchemeHandler.indexURL))
    }
}

// MARK: - Export bridge

extension WebAppViewController: WKScriptMessageHandler {

    /// `downloadBlob` in the web app posts finished MIDI / MP3 exports here,
    /// because an <a download> for a blob: URL does nothing in a WKWebView.
    /// Writing the file out and presenting the share sheet is the iOS-native
    /// equivalent: Save to Files, AirDrop it to a Mac, mail it to yourself.
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "saveFile",
              let body = message.body as? [String: Any],
              let name = body["name"] as? String,
              let b64 = body["b64"] as? String,
              let data = Data(base64Encoded: b64) else {
            NSLog("[Tabula] saveFile: malformed message")
            return
        }

        // Sanitise: the filename decides a path on disk, and it arrives from the
        // web layer. Keep the leaf component only.
        let safeName = (name as NSString).lastPathComponent
        guard !safeName.isEmpty, safeName != ".", safeName != ".." else {
            NSLog("[Tabula] saveFile: refused filename %@", name)
            return
        }

        // A fresh directory per export so two bounces of the same name don't
        // collide, and the URL handed to the share sheet stays valid until the
        // sheet is done with it.
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("export-\(UUID().uuidString)", isDirectory: true)
        let url = dir.appendingPathComponent(safeName)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
        } catch {
            NSLog("[Tabula] saveFile: write failed: %@", error.localizedDescription)
            return
        }

        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: dir)
        }
        // iPad presents this as a popover and requires an anchor.
        if let pop = sheet.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        present(sheet, animated: true)
    }
}
