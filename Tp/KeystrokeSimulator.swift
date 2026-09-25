import CoreGraphics
import AppKit

/// Synthesizes keyboard shortcuts via `CGEvent`, as if the user had
/// pressed them. Requires the app to be Accessibility-trusted
/// (see `AccessibilityPermission`).
enum KeystrokeSimulator {
    static func perform(_ combo: KeyCombo) {
        let source = CGEventSource(stateID: .hidSystemState)

        guard
            let keyDown = CGEvent(keyboardEventSource: source, virtualKey: combo.keyCode, keyDown: true),
            let keyUp = CGEvent(keyboardEventSource: source, virtualKey: combo.keyCode, keyDown: false)
        else { return }

        let cgFlags = cgEventFlags(from: combo.modifierFlags)
        keyDown.flags = cgFlags
        keyUp.flags = cgFlags

        keyDown.post(tap: .cghidEventTap)
        keyUp.post(tap: .cghidEventTap)
    }

    private static func cgEventFlags(from modifiers: NSEvent.ModifierFlags) -> CGEventFlags {
        var flags: CGEventFlags = []
        if modifiers.contains(.command) { flags.insert(.maskCommand) }
        if modifiers.contains(.option) { flags.insert(.maskAlternate) }
        if modifiers.contains(.control) { flags.insert(.maskControl) }
        if modifiers.contains(.shift) { flags.insert(.maskShift) }
        return flags
    }
}
