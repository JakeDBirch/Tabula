import UIKit

/// Owns the app's single window.
///
/// Loud Light adopts the UIScene lifecycle but **not** multiple windows —
/// `UIApplicationSupportsMultipleScenes` is false in Info.plist. Those are two
/// different things, and conflating them is why this app spent a while on the
/// legacy `UIApplicationDelegate` lifecycle: the concern was that two windows
/// would mean two schedulers writing the same `localStorage` key, which is a
/// data-loss bug waiting to be filed. That concern is real, and declaring a
/// single scene answers it exactly, without opting out of the lifecycle UIKit
/// is about to require.
///
/// Required, not tidiness: iOS 26 warns that "`UIScene` lifecycle will soon be
/// required", and building against the iOS 27 SDK makes it an assert that fires
/// *before* any app-delegate method — the app fails to launch at all.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebAppViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}
