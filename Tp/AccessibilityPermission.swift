import AppKit
import ApplicationServices

/// Wraps the Accessibility (`AXIsProcessTrusted`) permission check.
/// Global mouse monitoring works without it, but synthesizing keystrokes
/// via `CGEvent.post` requires it.
enum AccessibilityPermission {
    static var isGranted: Bool {
        AXIsProcessTrusted()
    }

    /// Prompts the system's "Tp would like to control this computer"
    /// dialog if permission hasn't been granted yet. The dialog links
    /// directly to System Settings > Privacy & Security > Accessibility.
    @discardableResult
    static func requestIfNeeded() -> Bool {
        let options: [String: Any] = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true]
        return AXIsProcessTrustedWithOptions(options as CFDictionary)
    }

    static func openSystemSettings() {
        let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!
        NSWorkspace.shared.open(url)
    }
}
