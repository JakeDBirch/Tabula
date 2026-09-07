import UIKit

/// Process-level entry point only. The window belongs to `SceneDelegate`, which
/// the `UIApplicationSceneManifest` in Info.plist names; see that file for why
/// the app is single-scene rather than single-window-by-avoiding-scenes.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        true
    }
}
