import expense

rows = [("2026-09-01", "餐飲", 100), ("2026-09-02", "餐飲", 50), ("2026-10-01", "交通", 30)]
c, m = expense.summarize(rows)
assert c == {"餐飲": 150, "交通": 30}
assert m == {"2026-09": 150, "2026-10": 30}
assert "總支出: 180" in expense.report(rows)
print("所有測試通過")
