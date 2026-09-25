import AppKit
import Foundation

/// Watches global cursor movement and fires a callback the instant the
/// pointer touches one of the eight hot zones (four corners + four edge
/// midpoints) of whichever screen it's on.
///
/// Uses a global monitor (for when another app is frontmost) plus a local
/// monitor (for when this app itself is frontmost, e.g. its Settings
/// window is focused) since `NSEvent`'s global monitor never fires for
/// events destined for the monitoring app's own windows.
final class EdgeDetector {
    /// Distance in points the cursor must be from the physical screen
    /// edge for a zone to be considered "touched".
    private let edgeThreshold: CGFloat = 4
    /// How far, in points, a zone's activation band extends from its
    /// anchor point along the edge.
    private let cornerBandRadius: CGFloat = 44
    private let centerBandRadius: CGFloat = 70
    /// How far outside a zone's band the cursor must move before that
    /// zone can be re-triggered (prevents rapid re-firing while sitting
    /// at the edge).
    private let rearmMargin: CGFloat = 24

    var onTrigger: ((HotZone, CGPoint) -> Void)?

    /// While true, incoming mouse-moved events are ignored (used while
    /// the pie menu itself is on screen).
    var isPaused = false

    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var armedZone: HotZone?

    func start() {
        guard globalMonitor == nil else { return }
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] event in
            self?.handleMouseMoved()
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved]) { [weak self] event in
            self?.handleMouseMoved()
            return event
        }
    }

    func stop() {
        if let globalMonitor { NSEvent.removeMonitor(globalMonitor) }
        if let localMonitor { NSEvent.removeMonitor(localMonitor) }
        globalMonitor = nil
        localMonitor = nil
        armedZone = nil
    }

    private func handleMouseMoved() {
        guard !isPaused else { return }

        let location = NSEvent.mouseLocation
        guard let screen = EdgeDetector.screen(containing: location) else {
            armedZone = nil
            return
        }

        if let hit = zone(at: location, on: screen) {
            if armedZone != hit {
                armedZone = hit
                if isZoneEnabled(hit) {
                    onTrigger?(hit, location)
                }
            }
        } else if let armed = armedZone {
            // Only clear the arm once the cursor has moved comfortably
            // clear of that zone's band, so it can be re-triggered.
            if distanceOutsideBand(for: armed, location: location, screen: screen) > rearmMargin {
                armedZone = nil
            }
        }
    }

    private func isZoneEnabled(_ zone: HotZone) -> Bool {
        let zoneConfig = ConfigStore.shared.zoneConfig(for: zone)
        return zoneConfig.isEnabled && !zoneConfig.items.isEmpty
    }

    private func zone(at location: CGPoint, on screen: NSScreen) -> HotZone? {
        let frame = screen.frame
        let nearLeft = location.x - frame.minX <= edgeThreshold
        let nearRight = frame.maxX - location.x <= edgeThreshold
        let nearTop = frame.maxY - location.y <= edgeThreshold
        let nearBottom = location.y - frame.minY <= edgeThreshold

        for candidate in HotZone.allCases {
            let anchor = candidate.anchor(in: frame)
            let band = bandRadius(for: candidate)

            switch candidate {
            case .topLeft:
                guard nearTop, nearLeft else { continue }
            case .topRight:
                guard nearTop, nearRight else { continue }
            case .bottomLeft:
                guard nearBottom, nearLeft else { continue }
            case .bottomRight:
                guard nearBottom, nearRight else { continue }
            case .topCenter:
                guard nearTop, abs(location.x - anchor.x) <= band else { continue }
            case .bottomCenter:
                guard nearBottom, abs(location.x - anchor.x) <= band else { continue }
            case .centerLeft:
                guard nearLeft, abs(location.y - anchor.y) <= band else { continue }
            case .centerRight:
                guard nearRight, abs(location.y - anchor.y) <= band else { continue }
            }

            if [.topLeft, .topRight, .bottomLeft, .bottomRight].contains(candidate) {
                if hypot(location.x - anchor.x, location.y - anchor.y) > band { continue }
            }

            return candidate
        }
        return nil
    }

    private func bandRadius(for zone: HotZone) -> CGFloat {
        switch zone {
        case .topLeft, .topRight, .bottomLeft, .bottomRight:
            return cornerBandRadius
        case .topCenter, .bottomCenter, .centerLeft, .centerRight:
            return centerBandRadius
        }
    }

    private func distanceOutsideBand(for zone: HotZone, location: CGPoint, screen: NSScreen) -> CGFloat {
        let anchor = zone.anchor(in: screen.frame)
        let band = bandRadius(for: zone)
        let distance = hypot(location.x - anchor.x, location.y - anchor.y)
        return max(0, distance - band)
    }

    private static func screen(containing point: CGPoint) -> NSScreen? {
        NSScreen.screens.first { $0.frame.contains(point) }
    }
}
