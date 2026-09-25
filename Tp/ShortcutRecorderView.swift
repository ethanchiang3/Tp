import AppKit
import SwiftUI

/// A self-contained AppKit control that records a keyboard shortcut:
/// click it, then press a key combo. Escape cancels, Delete clears.
final class ShortcutRecorderNSView: NSView {
    var keyCombo: KeyCombo? {
        didSet { updateDisplay() }
    }
    var onChange: ((KeyCombo?) -> Void)?

    private var isRecording = false {
        didSet { updateDisplay() }
    }

    private let label: NSTextField = {
        let field = NSTextField(labelWithString: "")
        field.alignment = .center
        field.font = .systemFont(ofSize: 11)
        field.lineBreakMode = .byTruncatingTail
        return field
    }()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.cornerRadius = 6
        layer?.borderWidth = 1
        addSubview(label)
        updateDisplay()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func layout() {
        super.layout()
        label.frame = bounds.insetBy(dx: 6, dy: 2)
    }

    override var acceptsFirstResponder: Bool { true }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        isRecording = true
    }

    @discardableResult
    override func resignFirstResponder() -> Bool {
        isRecording = false
        return super.resignFirstResponder()
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard isRecording else { return false }
        capture(event)
        return true
    }

    override func keyDown(with event: NSEvent) {
        guard isRecording else {
            super.keyDown(with: event)
            return
        }
        capture(event)
    }

    private func capture(_ event: NSEvent) {
        if event.keyCode == 53 { // Escape cancels without changing the value.
            isRecording = false
            return
        }
        if event.keyCode == 51 { // Delete/Backspace clears the shortcut.
            keyCombo = nil
            isRecording = false
            onChange?(nil)
            return
        }
        let flags = event.modifierFlags.intersection([.command, .option, .control, .shift])
        let combo = KeyCombo(keyCode: event.keyCode, modifierFlags: flags)
        keyCombo = combo
        isRecording = false
        onChange?(combo)
    }

    private func updateDisplay() {
        label.stringValue = isRecording
            ? "Press keys… (Esc to cancel)"
            : (keyCombo?.displayString ?? "Click to record")
        layer?.borderColor = (isRecording ? NSColor.controlAccentColor : NSColor.separatorColor).cgColor
        layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
    }
}

struct ShortcutRecorderView: NSViewRepresentable {
    @Binding var keyCombo: KeyCombo?

    func makeNSView(context: Context) -> ShortcutRecorderNSView {
        let view = ShortcutRecorderNSView(frame: .zero)
        view.keyCombo = keyCombo
        view.onChange = { keyCombo = $0 }
        return view
    }

    func updateNSView(_ nsView: ShortcutRecorderNSView, context: Context) {
        if nsView.keyCombo != keyCombo {
            nsView.keyCombo = keyCombo
        }
        nsView.onChange = { keyCombo = $0 }
    }
}
