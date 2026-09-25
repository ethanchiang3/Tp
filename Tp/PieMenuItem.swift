import AppKit
import Foundation

/// A recorded keyboard shortcut, stored as a raw virtual key code plus
/// modifier flags so it can be re-synthesized later with `CGEvent`.
struct KeyCombo: Codable, Equatable, Hashable {
    var keyCode: UInt16
    var rawModifierFlags: UInt

    var modifierFlags: NSEvent.ModifierFlags {
        NSEvent.ModifierFlags(rawValue: rawModifierFlags)
    }

    init(keyCode: UInt16, modifierFlags: NSEvent.ModifierFlags) {
        self.keyCode = keyCode
        self.rawModifierFlags = modifierFlags.rawValue
    }

    /// Human-readable form, e.g. "⌘⇧4".
    var displayString: String {
        var result = ""
        let flags = modifierFlags
        if flags.contains(.control) { result += "⌃" }
        if flags.contains(.option) { result += "⌥" }
        if flags.contains(.shift) { result += "⇧" }
        if flags.contains(.command) { result += "⌘" }
        result += KeyCombo.keyCodeName(for: keyCode)
        return result
    }

    static func keyCodeName(for keyCode: UInt16) -> String {
        Self.keyCodeNames[keyCode] ?? "Key \(keyCode)"
    }

    /// Minimal keycode -> label table covering the common keys used in
    /// shortcuts. Falls back to "Key <code>" for anything not listed.
    private static let keyCodeNames: [UInt16: String] = [
        0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X",
        8: "C", 9: "V", 11: "B", 12: "Q", 13: "W", 14: "E", 15: "R",
        16: "Y", 17: "T", 18: "1", 19: "2", 20: "3", 21: "4", 22: "6",
        23: "5", 24: "=", 25: "9", 26: "7", 27: "-", 28: "8", 29: "0",
        30: "]", 31: "O", 32: "U", 33: "[", 34: "I", 35: "P", 37: "L",
        38: "J", 39: "'", 40: "K", 41: ";", 42: "\\", 43: ",", 44: "/",
        45: "N", 46: "M", 47: ".", 50: "`",
        36: "Return", 48: "Tab", 49: "Space", 51: "Delete", 53: "Escape",
        123: "←", 124: "→", 125: "↓", 126: "↑",
        122: "F1", 120: "F2", 99: "F3", 118: "F4", 96: "F5", 97: "F6",
        98: "F7", 100: "F8", 101: "F9", 109: "F10", 103: "F11", 111: "F12",
    ]
}

/// A single wedge in the pie menu: a label, an SF Symbol, and the
/// keyboard shortcut it should synthesize when chosen.
struct PieMenuItem: Codable, Identifiable, Equatable, Hashable {
    var id: UUID = UUID()
    var label: String
    var symbolName: String
    var keyCombo: KeyCombo?

    var isConfigured: Bool { keyCombo != nil }
}
