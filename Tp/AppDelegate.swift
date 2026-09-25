import AppKit

/// Menu-bar-only app lifecycle: sets up the status item, wires the
/// `EdgeDetector` to the `PieMenuController`, and requests Accessibility
/// permission on first launch.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private let edgeDetector = EdgeDetector()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        setupStatusItem()
        observeWindowClosures()

        PieMenuController.shared.edgeDetector = edgeDetector
        edgeDetector.onTrigger = { [weak self] zone, point in
            self?.presentPieMenu(for: zone, at: point)
        }
        edgeDetector.start()

        if !AccessibilityPermission.isGranted {
            AccessibilityPermission.requestIfNeeded()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        edgeDetector.stop()
    }

    private func presentPieMenu(for zone: HotZone, at point: CGPoint) {
        let zoneConfig = ConfigStore.shared.zoneConfig(for: zone)
        guard zoneConfig.isEnabled, !zoneConfig.items.isEmpty else { return }
        PieMenuController.shared.show(zone: zone, items: zoneConfig.items, at: point)
    }

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "square.on.circle", accessibilityDescription: "Tp")

        let menu = NSMenu()
        let settingsEntry = menu.addItem(withTitle: "Settings…", action: #selector(openSettings), keyEquivalent: ",")
        settingsEntry.target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Tp", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        item.menu = menu
        statusItem = item
    }

    /// The Settings scene needs `.regular` activation policy to reliably
    /// gain focus; drop back to `.accessory` (no Dock icon) once it and
    /// every other window has closed.
    private func observeWindowClosures() {
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: nil,
            queue: .main
        ) { _ in
            DispatchQueue.main.async {
                if NSApp.windows.allSatisfy({ !$0.isVisible }) {
                    NSApp.setActivationPolicy(.accessory)
                }
            }
        }
    }

    @objc private func openSettings() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}
