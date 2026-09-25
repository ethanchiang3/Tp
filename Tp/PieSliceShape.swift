import SwiftUI

/// A single donut-style wedge: the ring segment between `innerRadius`
/// and `outerRadius`, spanning `startAngle` to `endAngle`. Angles are
/// measured clockwise from straight up (12 o'clock), matching how the
/// pie menu lays its slices out.
struct PieSliceShape: Shape {
    var startAngle: Angle
    var endAngle: Angle
    var innerRadius: CGFloat
    var outerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        // SwiftUI's `Angle` for arcs is measured counter-clockwise from
        // the 3 o'clock position, so convert from our "clockwise from
        // 12 o'clock" convention.
        let start = startAngle - .degrees(90)
        let end = endAngle - .degrees(90)

        var path = Path()
        path.addArc(center: center, radius: outerRadius, startAngle: start, endAngle: end, clockwise: false)
        path.addArc(center: center, radius: innerRadius, startAngle: end, endAngle: start, clockwise: true)
        path.closeSubpath()
        return path
    }
}
