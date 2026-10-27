import Foundation
import UserNotifications

/// 負責本機通知。iOS 最多同時排 64 則,所以每次只排最近的 60 則。
final class NotificationManager {
    static let shared = NotificationManager()
    private let maxPending = 60

    func requestAuthorization() async {
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])
    }

    /// 清掉全部舊的,依目前物品重新排程。
    /// - Parameters:
    ///   - items: 所有物品
    ///   - daysBefore: 到期前幾天提醒(另外一定會在到期當天提醒)
    ///   - hour: 每天幾點提醒
    func rescheduleAll(items: [Item], daysBefore: Int, hour: Int) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()

        let cal = Calendar.current
        var requests: [(date: Date, id: String, title: String, body: String)] = []

        for item in items where !item.isDone {
            let day = cal.startOfDay(for: item.expiryDate)
            let offsets = daysBefore > 0 ? [daysBefore, 0] : [0]
            for offset in offsets {
                guard let target = cal.date(byAdding: .day, value: -offset, to: day),
                      let fire = cal.date(bySettingHour: hour, minute: 0, second: 0, of: target),
                      fire > Date() else { continue }
                let body = offset == 0
                    ? "「\(item.name)」今天到期了"
                    : "「\(item.name)」還有 \(offset) 天到期"
                requests.append((fire, "\(item.uid.uuidString)-\(offset)", "housekeeper 提醒", body))
            }
        }

        requests.sort { $0.date < $1.date }
        for r in requests.prefix(maxPending) {
            let content = UNMutableNotificationContent()
            content.title = r.title
            content.body = r.body
            content.sound = .default
            let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: r.date)
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            center.add(UNNotificationRequest(identifier: r.id, content: content, trigger: trigger))
        }
    }
}
