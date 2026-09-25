import Foundation

/// A trigger position along the screen border: the four corners plus the
/// midpoint of each edge. Positions are expressed relative to a screen's
/// own frame so they work correctly across multiple displays.
enum HotZone: String, CaseIterable, Codable, Identifiable, Hashable {
    case topLeft
    case topCenter
    case topRight
    case centerLeft
    case centerRight
    case bottomLeft
    case bottomCenter
    case bottomRight

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .topLeft: return "Top Left"
        case .topCenter: return "Top Edge"
        case .topRight: return "Top Right"
        case .centerLeft: return "Left Edge"
        case .centerRight: return "Right Edge"
        case .bottomLeft: return "Bottom Left"
        case .bottomCenter: return "Bottom Edge"
        case .bottomRight: return "Bottom Right"
        }
    }

    var symbolName: String {
        switch self {
        case .topLeft: return "arrow.up.left.square"
        case .topCenter: return "arrow.up.square"
        case .topRight: return "arrow.up.right.square"
        case .centerLeft: return "arrow.left.square"
        case .centerRight: return "arrow.right.square"
        case .bottomLeft: return "arrow.down.left.square"
        case .bottomCenter: return "arrow.down.square"
        case .bottomRight: return "arrow.down.right.square"
        }
    }

    /// The anchor point for this zone within a screen's own frame
    /// (origin at the screen's bottom-left, matching `NSScreen.frame`
    /// and `NSEvent.mouseLocation`).
    func anchor(in screenFrame: CGRect) -> CGPoint {
        let minX = screenFrame.minX
        let midX = screenFrame.midX
        let maxX = screenFrame.maxX
        let minY = screenFrame.minY
        let midY = screenFrame.midY
        let maxY = screenFrame.maxY

        switch self {
        case .topLeft: return CGPoint(x: minX, y: maxY)
        case .topCenter: return CGPoint(x: midX, y: maxY)
        case .topRight: return CGPoint(x: maxX, y: maxY)
        case .centerLeft: return CGPoint(x: minX, y: midY)
        case .centerRight: return CGPoint(x: maxX, y: midY)
        case .bottomLeft: return CGPoint(x: minX, y: minY)
        case .bottomCenter: return CGPoint(x: midX, y: minY)
        case .bottomRight: return CGPoint(x: maxX, y: minY)
        }
    }
}
