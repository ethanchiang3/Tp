import SwiftUI

/// Editor for a single hot zone: enable/disable it and manage the list
/// of pie-menu slices (icon, label, keyboard shortcut) assigned to it.
struct ZoneEditorView: View {
    let zone: HotZone
    @ObservedObject private var store = ConfigStore.shared

    private let maxItems = 8

    private var zoneConfig: ZoneConfig { store.zoneConfig(for: zone) }

    var body: some View {
        Form {
            Section {
                Toggle("Enable \(zone.displayName)", isOn: Binding(
                    get: { zoneConfig.isEnabled },
                    set: { newValue in store.updateZone(zone) { $0.isEnabled = newValue } }
                ))
            }

            Section("Pie Menu Slices") {
                if zoneConfig.items.isEmpty {
                    Text("No slices yet. Add one below, then click its shortcut field and press a key combo.")
                        .foregroundStyle(.secondary)
                }
                ForEach(zoneConfig.items) { item in
                    itemRow(item)
                }
                Button {
                    addItem()
                } label: {
                    Label("Add Slice", systemImage: "plus.circle")
                }
                .disabled(zoneConfig.items.count >= maxItems)
            }
        }
        .formStyle(.grouped)
        .navigationTitle(zone.displayName)
        .frame(minWidth: 460)
    }

    private func itemRow(_ item: PieMenuItem) -> some View {
        HStack {
            Image(systemName: item.symbolName)
                .frame(width: 18)
            TextField("SF Symbol", text: binding(for: item, keyPath: \.symbolName))
                .frame(width: 100)
                .textFieldStyle(.roundedBorder)
            TextField("Label", text: binding(for: item, keyPath: \.label))
                .textFieldStyle(.roundedBorder)
            ShortcutRecorderView(keyCombo: keyComboBinding(for: item))
                .frame(width: 150, height: 26)
            Button(role: .destructive) {
                remove(item)
            } label: {
                Image(systemName: "trash")
            }
            .buttonStyle(.borderless)
        }
    }

    private func binding(for item: PieMenuItem, keyPath: WritableKeyPath<PieMenuItem, String>) -> Binding<String> {
        Binding(
            get: { store.zoneConfig(for: zone).items.first(where: { $0.id == item.id })?[keyPath: keyPath] ?? "" },
            set: { newValue in
                store.updateZone(zone) { config in
                    guard let index = config.items.firstIndex(where: { $0.id == item.id }) else { return }
                    config.items[index][keyPath: keyPath] = newValue
                }
            }
        )
    }

    private func keyComboBinding(for item: PieMenuItem) -> Binding<KeyCombo?> {
        Binding(
            get: { store.zoneConfig(for: zone).items.first(where: { $0.id == item.id })?.keyCombo },
            set: { newValue in
                store.updateZone(zone) { config in
                    guard let index = config.items.firstIndex(where: { $0.id == item.id }) else { return }
                    config.items[index].keyCombo = newValue
                }
            }
        )
    }

    private func addItem() {
        store.updateZone(zone) { config in
            config.items.append(PieMenuItem(label: "New", symbolName: "star", keyCombo: nil))
        }
    }

    private func remove(_ item: PieMenuItem) {
        store.updateZone(zone) { config in
            config.items.removeAll { $0.id == item.id }
        }
    }
}
