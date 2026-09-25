import SwiftUI

/// The radial ("pie") menu itself: a donut of up to a handful of wedges
/// around a dead-center cancel hub. Hosted inside a borderless
/// `NSWindow` by `PieMenuController`.
struct PieMenuView: View {
    let zone: HotZone
    let items: [PieMenuItem]
    let onSelect: (PieMenuItem) -> Void
    let onCancel: () -> Void

    @State private var hoveredID: PieMenuItem.ID?

    private let outerRadius: CGFloat = 130
    private let innerRadius: CGFloat = 48
    private let sliceGap: Angle = .degrees(3)

    var body: some View {
        ZStack {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: outerRadius * 2 + 24, height: outerRadius * 2 + 24)
                .shadow(radius: 20)

            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                slice(for: item, at: index)
            }

            centerHub
        }
        .frame(width: outerRadius * 2 + 24, height: outerRadius * 2 + 24)
    }

    private var sliceAngle: Angle {
        .degrees(360.0 / Double(max(items.count, 1)))
    }

    private func slice(for item: PieMenuItem, at index: Int) -> some View {
        let start = sliceAngle * Double(index) + sliceGap / 2
        let end = sliceAngle * Double(index + 1) - sliceGap / 2
        let isHovered = hoveredID == item.id
        let shape = PieSliceShape(startAngle: start, endAngle: end, innerRadius: innerRadius, outerRadius: outerRadius)

        return ZStack {
            shape
                .fill(isHovered ? Color.accentColor.opacity(0.85) : Color.primary.opacity(0.08))
            shape
                .stroke(Color.primary.opacity(0.15), lineWidth: 1)
        }
        .contentShape(shape)
        .onHover { hovering in
            hoveredID = hovering ? item.id : (hoveredID == item.id ? nil : hoveredID)
        }
        .onTapGesture { onSelect(item) }
        .overlay(label(for: item, start: start, end: end, isHovered: isHovered))
    }

    private func label(for item: PieMenuItem, start: Angle, end: Angle, isHovered: Bool) -> some View {
        let mid = (start.degrees + end.degrees) / 2
        let radius = (innerRadius + outerRadius) / 2
        let radians = (mid - 90) * .pi / 180
        let x = radius * cos(radians)
        let y = radius * sin(radians)

        return VStack(spacing: 4) {
            Image(systemName: item.symbolName)
                .font(.system(size: 18, weight: .medium))
            Text(item.label)
                .font(.caption2)
                .lineLimit(1)
        }
        .foregroundStyle(isHovered ? Color.white : Color.primary)
        .frame(width: 74)
        .offset(x: x, y: y)
        .allowsHitTesting(false)
    }

    private var centerHub: some View {
        Circle()
            .fill(Color.primary.opacity(0.06))
            .overlay(Circle().stroke(Color.primary.opacity(0.2), lineWidth: 1))
            .frame(width: innerRadius * 2, height: innerRadius * 2)
            .overlay(
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.secondary)
            )
            .contentShape(Circle())
            .onTapGesture { onCancel() }
    }
}
