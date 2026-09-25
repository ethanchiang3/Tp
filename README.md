# Tp

Extends macOS Hot Corners to all eight edge trigger points — the four
corners **and** the midpoint of each screen edge — and replaces the
single fixed action with a customizable radial (pie) menu. Assign a
keyboard shortcut to each pie slice; touching a zone with the cursor
pops the menu open instantly, and clicking a slice sends that shortcut.

## Requirements

- macOS 13 (Ventura) or later
- Xcode 15 or later

## Build & run

1. Open `Tp.xcodeproj` in Xcode.
2. Select the **Tp** scheme and your Mac as the run destination.
3. Build and run (⌘R).

`Tp` runs as a menu-bar-only app (no Dock icon, no main window) — look
for its icon in the menu bar after launch. Click it → **Settings…** to
configure hot zones.

### First launch: grant Accessibility access

Sending keyboard shortcuts requires Accessibility permission. On first
launch, macOS will prompt you, or you can grant it manually:

**System Settings → Privacy & Security → Accessibility** → enable **Tp**.

Without this permission, hot zones still detect cursor position and the
pie menu still opens, but selecting a slice won't send its shortcut.

### Configuring a hot zone

1. Open **Settings…** from the menu bar icon.
2. Pick a zone (e.g. "Top Edge", "Left Edge", a corner) from the sidebar.
3. Toggle it on.
4. Click **Add Slice**, give it a label/SF Symbol name, then click its
   shortcut field and press the key combo you want it to send.
5. Move your cursor to that zone's edge on screen — the pie menu opens
   immediately; click a slice to fire its shortcut, click the center
   or press Escape to dismiss without acting.

## Project layout

```
Tp.xcodeproj/          Xcode project (single "Tp" target, SwiftUI + AppKit)
Tp/
  TpApp.swift           App entry point (SwiftUI App, Settings scene)
  AppDelegate.swift      Menu bar status item, wires detector -> pie menu
  HotZone.swift          The 8 trigger positions (corners + edge midpoints)
  EdgeDetector.swift      Global/local mouse monitor, zone hit-testing
  PieMenuItem.swift       Pie slice + KeyCombo models
  AppConfig.swift         Per-zone config, JSON persistence
  PieMenuController.swift Borderless panel that hosts the pie menu
  PieMenuView.swift       SwiftUI radial menu UI
  PieSliceShape.swift     Donut-wedge Shape used by the radial menu
  KeystrokeSimulator.swift  CGEvent-based shortcut synthesis
  AccessibilityPermission.swift  AXIsProcessTrusted wrapper
  SettingsView.swift      Settings window: zone list + status
  ZoneEditorView.swift    Per-zone pie slice editor
  ShortcutRecorderView.swift  AppKit key-combo recorder control
```

Configuration is stored as JSON at
`~/Library/Application Support/Tp/config.json`.

## Distribution notes

This app is unsandboxed by design: reliable global cursor tracking and
synthetic keystrokes are not available (or are heavily restricted)
under the App Sandbox. For distribution outside the Mac App Store,
sign with a Developer ID certificate and notarize the build; Hardened
Runtime is already enabled in the project's build settings.
