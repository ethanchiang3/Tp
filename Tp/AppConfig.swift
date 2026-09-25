import Foundation
import Combine

/// Per-zone configuration: whether the zone is active, and the list of
/// pie-menu slices assigned to it.
struct ZoneConfig: Codable, Equatable {
    var isEnabled: Bool = false
    var items: [PieMenuItem] = []
}

/// The full persisted app configuration.
///
/// Encodes `zones` keyed by the zone's raw string name (rather than
/// relying on `JSONEncoder`'s alternating-array fallback for non-String
/// dictionary keys) so the config file on disk stays human-readable and
/// hand-editable.
struct AppConfig: Equatable {
    var zones: [HotZone: ZoneConfig] = [:]

    static var empty: AppConfig {
        AppConfig(zones: Dictionary(uniqueKeysWithValues: HotZone.allCases.map { ($0, ZoneConfig()) }))
    }
}

extension AppConfig: Codable {
    private enum CodingKeys: String, CodingKey {
        case zones
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let raw = try container.decodeIfPresent([String: ZoneConfig].self, forKey: .zones) ?? [:]
        var zones: [HotZone: ZoneConfig] = [:]
        for (key, value) in raw {
            if let zone = HotZone(rawValue: key) {
                zones[zone] = value
            }
        }
        self.zones = zones
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        let raw = Dictionary(uniqueKeysWithValues: zones.map { ($0.key.rawValue, $0.value) })
        try container.encode(raw, forKey: .zones)
    }
}

/// Loads, saves, and publishes the app's configuration. Backed by a JSON
/// file in Application Support so it survives app updates and is easy to
/// back up or hand-edit.
final class ConfigStore: ObservableObject {
    static let shared = ConfigStore()

    @Published var config: AppConfig {
        didSet { save() }
    }

    private let fileURL: URL
    private var isLoading = false

    private init() {
        let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Tp", isDirectory: true)
        try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true)
        self.fileURL = supportDir.appendingPathComponent("config.json")

        if let data = try? Data(contentsOf: fileURL),
           let decoded = try? JSONDecoder().decode(AppConfig.self, from: data) {
            var merged = AppConfig.empty
            for (zone, zoneConfig) in decoded.zones {
                merged.zones[zone] = zoneConfig
            }
            self.config = merged
        } else {
            self.config = .empty
        }
    }

    func zoneConfig(for zone: HotZone) -> ZoneConfig {
        config.zones[zone] ?? ZoneConfig()
    }

    func updateZone(_ zone: HotZone, _ transform: (inout ZoneConfig) -> Void) {
        var zoneConfig = config.zones[zone] ?? ZoneConfig()
        transform(&zoneConfig)
        config.zones[zone] = zoneConfig
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(config) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
