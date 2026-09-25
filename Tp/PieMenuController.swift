import AppKit
import SwiftUI

/// Borderless panel that can become key without activating the app,
/// so the pie menu can appear over a full-screen app without yanking
/// focus away from it.
private final class PieMenuPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

/// Owns the single pie-menu panel: positions it at the trigger point,
/// hosts the SwiftUI radial view, and tears itself down on selection,
/// Escape, or an outside click.
final class PieMenuController {
    static let shared = PieMenuController()

    weak var edgeDetector: EdgeDetector?

    private var panel: PieMenuPanel?
    private var keyMonitor: Any?
    private var outsideClickMonitor: Any?
    private var localClickMonitor: Any?

    private let diameter: CGFloat = 284

    func show(zone: HotZone, items: [PieMenuItem], at point: CGPoint) {
        dismiss()
        edgeDetector?.isPaused = true

        let size = CGSize(width: diameter, height: diameter)
        var origin = CGPoint(x: point.x - size.width / 2, y: point.y - size.height / 2)

        let screen = NSScreen.screens.first { $0.frame.contains(point) } ?? NSScreen.main
        if let frame = screen?.visibleFrame {
            origin.x = min(max(origin.x, frame.minX), max(frame.minX, frame.maxX - size.width))
            origin.y = min(max(origin.y, frame.minY), max(frame.minY, frame.maxY - size.height))
        }

        let panel = PieMenuPanel(
            contentRect: NSRect(origin: origin, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isMovableByWindowBackground = false

        let rootView = PieMenuView(
            zone: zone,
            items: items,
            onSelect: { [weak self] item in self?.select(item) },
            onCancel: { [weak self] in self?.dismiss() }
        )
        let hostingView = NSHostingView(rootView: rootView)
        hostingView.frame = NSRect(origin: .zero, size: size)
        panel.contentView = hostingView

        panel.makeKeyAndOrderFront(nil)
        self.panel = panel
        installDismissMonitors()
    }

    func dismiss() {
        removeDismissMonitors()
        panel?.orderOut(nil)
        panel = nil
        edgeDetector?.isPaused = false
    }

    private func select(_ item: PieMenuItem) {
        dismiss()
        guard let combo = item.keyCombo else { return }

        guard AccessibilityPermission.isGranted else {
            AccessibilityPermission.requestIfNeeded()
            return
        }
        // Give the panel a beat to close and return key focus to
        // whatever was frontmost before injecting the keystroke.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            KeystrokeSimulator.perform(combo)
        }
    }

    private func installDismissMonitors() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak self] event in
            guard let self, self.panel != nil else { return event }
            if event.keyCode == 53 { // Escape
                self.dismiss()
                return nil
            }
            return event
        }

        outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.dismiss()
        }

        localClickMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self, let panel = self.panel, event.window !== panel else { return event }
            self.dismiss()
            return event
        }
    }

    private func removeDismissMonitors() {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
        if let outsideClickMonitor { NSEvent.removeMonitor(outsideClickMonitor) }
        if let localClickMonitor { NSEvent.removeMonitor(localClickMonitor) }
        keyMonitor = nil
        outsideClickMonitor = nil
        localClickMonitor = nil
    }
}
