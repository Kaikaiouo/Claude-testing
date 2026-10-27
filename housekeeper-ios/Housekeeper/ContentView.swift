import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Item.expiryDate) private var allItems: [Item]

    @AppStorage("reminderDays") private var reminderDays = 3
    @AppStorage("reminderHour") private var reminderHour = 9

    @State private var editingItem: Item?
    @State private var showingNew = false
    @State private var showingSettings = false

    private var activeItems: [Item] { allItems.filter { !$0.isDone } }

    /// 用來偵測「會影響提醒的資料」是否改變
    private var reminderSignature: String {
        allItems.map { "\($0.uid)\($0.expiryDate.timeIntervalSince1970)\($0.isDone)\($0.name)" }
            .joined() + "\(reminderDays)-\(reminderHour)"
    }

    var body: some View {
        NavigationStack {
            Group {
                if activeItems.isEmpty {
                    ContentUnavailableView("還沒有物品",
                                           systemImage: "refrigerator",
                                           description: Text("點右上角 + 新增第一個會到期的東西"))
                } else {
                    List {
                        ForEach(activeItems) { item in
                            ItemRow(item: item)
                                .contentShape(Rectangle())
                                .onTapGesture { editingItem = item }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        context.delete(item)
                                    } label: { Label("刪除", systemImage: "trash") }
                                }
                                .swipeActions(edge: .leading) {
                                    Button {
                                        item.isDone = true
                                    } label: { Label("吃完", systemImage: "checkmark") }
                                    .tint(.green)
                                }
                        }
                    }
                }
            }
            .navigationTitle("housekeeper")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showingSettings = true } label: { Image(systemName: "gearshape") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingNew = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingNew) { ItemFormView(item: nil) }
            .sheet(item: $editingItem) { item in ItemFormView(item: item) }
            .sheet(isPresented: $showingSettings) { SettingsView() }
        }
        .task {
            await NotificationManager.shared.requestAuthorization()
            reschedule()
        }
        .onChange(of: reminderSignature) { _, _ in reschedule() }
    }

    private func reschedule() {
        NotificationManager.shared.rescheduleAll(items: allItems,
                                                 daysBefore: reminderDays,
                                                 hour: reminderHour)
    }
}

struct ItemRow: View {
    let item: Item

    private var color: Color {
        switch item.daysLeft {
        case ..<0: return .red
        case 0...3: return .orange
        case 4...7: return .yellow
        default: return .green
        }
    }

    private var statusText: String {
        let d = item.daysLeft
        if d < 0 { return "已過期 \(-d) 天" }
        if d == 0 { return "今天到期" }
        return "還有 \(d) 天"
    }

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(color).frame(width: 12, height: 12)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.headline)
                Text("\(item.category.rawValue) · \(item.location.rawValue)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(statusText).font(.subheadline).foregroundStyle(color)
                Text(item.expiryDate.formatted(date: .abbreviated, time: .omitted)
                     + (item.isEstimated ? "(估)" : ""))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
