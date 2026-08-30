import Foundation
import WebKit

/// Serves the bundled web app to the WKWebView over a custom `tabula://` scheme.
///
/// Why not `loadFileURL` / `file://`: WebKit gives `file://` documents an opaque,
/// per-load origin, so `localStorage` is unreliable there and has historically
/// been dropped between launches. Tabula's autosave and its whole project
/// library live in `localStorage`, so losing it means losing the user's work.
/// A custom scheme gives the app one stable origin (`tabula://app`) for the life
/// of the install, which is the same reason Capacitor and modern Cordova serve
/// from a scheme rather than from files.
///
/// Everything served is read from `www/` inside the app bundle. Nothing here
/// touches the network — see `build.mjs --ios`, which asserts the payload has no
/// remote references left in it.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "tabula"
    static let host = "app"
    static var indexURL: URL { URL(string: "\(scheme)://\(host)/index.html")! }

    /// `www/` as a resolved, symlink-free path, so the containment check below
    /// compares like with like.
    private let root: URL

    /// WebKit may call `stop` on a task while we are still reading the file off
    /// disk. Replying to a stopped task raises an Objective-C exception that
    /// takes the app down, and there is no way to ask a task whether it is still
    /// live — so track it ourselves. Guarded by a lock because file reads run
    /// off the main thread.
    private var stopped = Set<ObjectIdentifier>()
    private let lock = NSLock()

    override init() {
        guard let dir = Bundle.main.url(forResource: "www", withExtension: nil) else {
            // The web payload is the app. A build that shipped without it would
            // launch to a blank screen and look like a rendering bug, so fail
            // loudly and at the point the cause is still obvious.
            fatalError("www/ is missing from the app bundle — run `npm run build:ios` before building.")
        }
        root = dir.resolvingSymlinksInPath()
        super.init()
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        guard let url = task.request.url else {
            finish(task, id: id, with: .failure(URLError(.badURL)))
            return
        }

        // Map the URL path onto a file under www/. A request for the directory
        // root is the app entry point.
        var rel = url.path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "index.html" }

        let file = root.appendingPathComponent(rel).standardizedFileURL.resolvingSymlinksInPath()

        // Containment check. The payload is ours and the scheme is not reachable
        // from outside the app, so this is belt-and-braces rather than a live
        // threat — but `..` in a path is exactly the kind of thing that stops
        // being hypothetical the moment the app loads anything user-supplied.
        guard file.path == root.path || file.path.hasPrefix(root.path + "/") else {
            finish(task, id: id, with: .failure(URLError(.noPermissionsToReadFile)))
            return
        }

        // Off the main thread: the drum kits are several megabytes of WAV and
        // blocking the main thread on them would show up as dropped frames in
        // the sequencer grid.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result: Result<(Data, String), Error>
            do {
                let data = try Data(contentsOf: file, options: .mappedIfSafe)
                result = .success((data, Self.mimeType(for: file.pathExtension)))
            } catch {
                result = .failure(error)
            }
            DispatchQueue.main.async {
                switch result {
                case .success(let (data, mime)):
                    self.finish(task, id: id, with: .success((url, data, mime)))
                case .failure(let error):
                    self.finish(task, id: id, with: .failure(error))
                }
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        lock.lock()
        stopped.insert(ObjectIdentifier(task))
        lock.unlock()
    }

    private func finish(_ task: WKURLSchemeTask,
                        id: ObjectIdentifier,
                        with result: Result<(URL, Data, String), Error>) {
        lock.lock()
        let isStopped = stopped.remove(id) != nil
        lock.unlock()
        guard !isStopped else { return }

        switch result {
        case .success(let (url, data, mime)):
            // An HTTPURLResponse rather than a bare URLResponse so the document
            // carries real headers. Content-Type is what makes WebKit treat the
            // entry point as HTML instead of offering to download it.
            let headers = [
                "Content-Type": mime,
                "Content-Length": String(data.count),
                // The payload is local and immutable for the life of the build;
                // there is no revalidation to do.
                "Cache-Control": "no-cache",
            ]
            guard let response = HTTPURLResponse(url: url,
                                                 statusCode: 200,
                                                 httpVersion: "HTTP/1.1",
                                                 headerFields: headers) else {
                task.didFailWithError(URLError(.cannotParseResponse))
                return
            }
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        case .failure(let error):
            task.didFailWithError(error)
        }
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs":   return "text/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "svg":         return "image/svg+xml"
        case "png":         return "image/png"
        case "woff2":       return "font/woff2"
        case "woff":        return "font/woff"
        case "wav":         return "audio/wav"
        case "aif", "aiff": return "audio/aiff"
        case "mp3":         return "audio/mpeg"
        default:            return "application/octet-stream"
        }
    }
}
