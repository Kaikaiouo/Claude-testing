import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("reminderDays") private var reminderDays = 3
    @AppStorage("reminderHour") private var reminderHour = 9

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("提醒"),
                        footer: Text("到期當天一定會提醒。設為 0 代表只在當天提醒。")) {
                    Stepper("到期前 \(reminderDays) 天提醒", value: $reminderDays, in: 0...60)
                    Picker("提醒時間", selection: $reminderHour) {
                        ForEach(0..<24, id: \.self) { Text(String(format: "%02d:00", $0)).tag($0) }
                    }
                }
            }
            .navigationTitle("設定")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                }
            }
        }
    }
}
