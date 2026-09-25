import ServiceManagement
import SwiftUI

/// The app's Settings window: Accessibility permission status, launch
/// at login, and the list of eight hot zones drilling into their
/// individual pie-menu editors.
struct SettingsView: View {
    @ObservedObject private var store = ConfigStore.shared
    @State private var isAccessibilityGranted = AccessibilityPermission.isGranted
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled

    private let permissionTimer = Timer.publish(every: 2, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationSplitView {
            List {
                Section("Status") {
                    accessibilityRow
                    Toggle("Launch at Login", isOn: $launchAtLogin)
                        .onChange(of: launchAtLogin) { _, newValue in setLaunchAtLogin(newValue) }
                }
                Section("Hot Zones") {
                    ForEach(HotZone.allCases) { zone in
                        NavigationLink(value: zone) {
                            zoneRow(zone)
                        }
                    }
                }
            }
            .navigationDestination(for: HotZone.self) { zone in
                ZoneEditorView(zone: zone)
            }
            .listStyle(.sidebar)
            .navigationTitle("Tp")
        } detail: {
            Text("Select a hot zone to configure its pie menu.")
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 560, minHeight: 420)
        .onReceive(permissionTimer) { _ in
            isAccessibilityGranted = AccessibilityPermission.isGranted
        }
    }

    private var accessibilityRow: some View {
        HStack {
            Image(systemName: isAccessibilityGranted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(isAccessibilityGranted ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text("Accessibility Access")
                Text(isAccessibilityGranted ? "Granted — shortcuts can be sent." : "Required to send keyboard shortcuts.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if !isAccessibilityGranted {
                Button("Grant…") {
                    AccessibilityPermission.requestIfNeeded()
                    AccessibilityPermission.openSystemSettings()
                }
            }
        }
    }

    private func zoneRow(_ zone: HotZone) -> some View {
        let zoneConfig = store.zoneConfig(for: zone)
        return HStack {
            Image(systemName: zone.symbolName)
                .frame(width: 20)
            Text(zone.displayName)
            Spacer()
            if !zoneConfig.items.isEmpty {
                Text("\(zoneConfig.items.count)")
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .background(Capsule().fill(Color.secondary.opacity(0.15)))
            }
            Toggle("", isOn: Binding(
                get: { zoneConfig.isEnabled },
                set: { newValue in store.updateZone(zone) { $0.isEnabled = newValue } }
            ))
            .labelsHidden()
            .toggleStyle(.switch)
        }
    }

    private func setLaunchAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }
}
