import SwiftUI
import SwiftData

/// 新增或編輯物品。item 為 nil 代表新增。
struct ItemFormView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    let item: Item?

    @State private var name = ""
    @State private var category: ItemCategory = .other
    @State private var location: StorageLocation = .fridge
    @State private var tempText = "4"
    @State private var quantity = 1
    @State private var purchaseDate = Date()
    @State private var hasMfg = false
    @State private var mfgDate = Date()
    @State private var expiryDate = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var isEstimated = false
    @State private var notes = ""

    init(item: Item?) {
        self.item = item
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("基本資料") {
                    TextField("名稱(例如:牛奶)", text: $name)
                    Picker("類別", selection: $category) {
                        ForEach(ItemCategory.allCases) { Text($0.rawValue).tag($0) }
                    }
                    Stepper("數量:\(quantity)", value: $quantity, in: 1...99)
                }

                Section("存放") {
                    Picker("位置", selection: $location) {
                        ForEach(StorageLocation.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .onChange(of: location) { _, new in
                        if let t = new.defaultTempC { tempText = String(Int(t)) } else { tempText = "" }
                    }
                    HStack {
                        Text("存放溫度 (°C)")
                        Spacer()
                        TextField("選填", text: $tempText)
                            .keyboardType(.numbersAndPunctuation)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                    }
                }

                Section("日期") {
                    DatePicker("購買日", selection: $purchaseDate, displayedComponents: .date)
                    Toggle("有製造日期", isOn: $hasMfg)
                    if hasMfg {
                        DatePicker("製造日期", selection: $mfgDate, displayedComponents: .date)
                    }
                    DatePicker("到期日", selection: $expiryDate, displayedComponents: .date)
                    Toggle("到期日是估算值(包裝沒有標示)", isOn: $isEstimated)
                }

                Section("備註") {
                    TextField("例如:買在全聯、開封後 3 天內吃完", text: $notes, axis: .vertical)
                }
            }
            .navigationTitle(item == nil ? "新增物品" : "編輯物品")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("儲存") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard let item else { return }
        name = item.name
        category = item.category
        location = item.location
        tempText = item.storageTempC.map { String(format: "%g", $0) } ?? ""
        quantity = item.quantity
        purchaseDate = item.purchaseDate
        if let m = item.mfgDate { hasMfg = true; mfgDate = m }
        expiryDate = item.expiryDate
        isEstimated = item.isEstimated
        notes = item.notes
    }

    private func save() {
        let temp = Double(tempText.trimmingCharacters(in: .whitespaces))
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let item {
            item.name = trimmed
            item.category = category
            item.location = location
            item.storageTempC = temp
            item.quantity = quantity
            item.purchaseDate = purchaseDate
            item.mfgDate = hasMfg ? mfgDate : nil
            item.expiryDate = expiryDate
            item.isEstimated = isEstimated
            item.notes = notes
        } else {
            let new = Item(name: trimmed,
                           category: category,
                           location: location,
                           quantity: quantity,
                           mfgDate: hasMfg ? mfgDate : nil,
                           expiryDate: expiryDate,
                           isEstimated: isEstimated,
                           purchaseDate: purchaseDate,
                           storageTempC: temp,
                           notes: notes)
            context.insert(new)
        }
        dismiss()
    }
}
