import UIKit

/// Deliberately not a scene-based app. Tabula is one full-screen instrument with
/// one audio engine and one autosave; multiple windows would mean two schedulers
/// writing the same localStorage key, which is a data-loss bug waiting to be
/// filed. A plain window-based delegate keeps that impossible.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebAppViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
