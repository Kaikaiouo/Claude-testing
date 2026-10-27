import Foundation
import SwiftData

/// 物品類別
enum ItemCategory: String, CaseIterable, Identifiable {
    case vegetable = "蔬菜"
    case fruit = "水果"
    case meat = "肉類"
    case dairy = "乳製品"
    case drink = "飲料"
    case seasoning = "調味料"
    case medicine = "藥品"
    case skincare = "保養品"
    case household = "日用品"
    case other = "其他"

    var id: String { rawValue }
}

/// 存放位置
enum StorageLocation: String, CaseIterable, Identifiable {
    case fridge = "冷藏"
    case freezer = "冷凍"
    case room = "常溫"
    case cabinet = "櫃子"
    case medicineBox = "藥箱"

    var id: String { rawValue }

    /// 建議的預設存放溫度(°C),沒有則為 nil
    var defaultTempC: Double? {
        switch self {
        case .fridge: return 4
        case .freezer: return -18
        default: return nil
        }
    }
}

/// 一筆會到期的物品
@Model
final class Item {
    var uid: UUID
    var name: String
    var categoryRaw: String
    var locationRaw: String
    var quantity: Int
    var mfgDate: Date?          // 製造日期(可空)
    var expiryDate: Date        // 到期日
    var isEstimated: Bool       // 到期日是否為估算值
    var purchaseDate: Date      // 購買日
    var storageTempC: Double?   // 存放溫度
    var notes: String
    var isDone: Bool            // 已吃完/已處理
    var createdAt: Date

    init(name: String,
         category: ItemCategory = .other,
         location: StorageLocation = .fridge,
         quantity: Int = 1,
         mfgDate: Date? = nil,
         expiryDate: Date,
         isEstimated: Bool = false,
         purchaseDate: Date = Date(),
         storageTempC: Double? = nil,
         notes: String = "") {
        self.uid = UUID()
        self.name = name
        self.categoryRaw = category.rawValue
        self.locationRaw = location.rawValue
        self.quantity = quantity
        self.mfgDate = mfgDate
        self.expiryDate = expiryDate
        self.isEstimated = isEstimated
        self.purchaseDate = purchaseDate
        self.storageTempC = storageTempC
        self.notes = notes
        self.isDone = false
        self.createdAt = Date()
    }

    var category: ItemCategory {
        get { ItemCategory(rawValue: categoryRaw) ?? .other }
        set { categoryRaw = newValue.rawValue }
    }

    var location: StorageLocation {
        get { StorageLocation(rawValue: locationRaw) ?? .room }
        set { locationRaw = newValue.rawValue }
    }

    /// 距離到期還有幾天(今天到期為 0,已過期為負數)
    var daysLeft: Int {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let expiry = cal.startOfDay(for: expiryDate)
        return cal.dateComponents([.day], from: today, to: expiry).day ?? 0
    }
}
