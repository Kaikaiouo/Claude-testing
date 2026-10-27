#!/usr/bin/env python3
"""番茄鐘紀錄器:計時並記錄專注時段到 JSON 檔,可查看統計。"""
import argparse, json, os, sys, time
from datetime import datetime, date, timedelta

LOG = os.environ.get("POMODORO_LOG", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pomodoro_log.json"))

def load():
    if not os.path.exists(LOG):
        return []
    with open(LOG, encoding="utf-8") as f:
        return json.load(f)

def save(rows):
    with open(LOG, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

def add(task, minutes, when=None):
    rows = load()
    rows.append({"time": (when or datetime.now()).strftime("%Y-%m-%d %H:%M"), "task": task, "minutes": minutes})
    save(rows)

def cmd_start(a):
    total = int(a.minutes * 60 / a.speed)
    print(f"開始專注:{a.task}({a.minutes} 分鐘)")
    for left in range(total, 0, -1):
        m, s = divmod(int(left * a.speed), 60)
        sys.stdout.write(f"\r剩餘 {m:02d}:{s:02d}")
        sys.stdout.flush()
        time.sleep(1 if a.speed == 1 else 0.01)
    print("\r完成!               ")
    add(a.task, a.minutes)
    print("已記錄 1 個番茄 🍅")

def cmd_add(a):
    add(a.task, a.minutes)
    print(f"已手動記錄:{a.task} {a.minutes} 分鐘")

def cmd_stats(a):
    rows = load()
    if not rows:
        print("目前沒有紀錄。")
        return
    today = date.today().isoformat()
    week_start = date.today() - timedelta(days=6)
    t_today = sum(r["minutes"] for r in rows if r["time"].startswith(today))
    t_week = sum(r["minutes"] for r in rows if datetime.strptime(r["time"][:10], "%Y-%m-%d").date() >= week_start)
    print(f"總番茄數:{len(rows)}  總分鐘:{sum(r['minutes'] for r in rows)}")
    print(f"今天:{t_today} 分鐘  近 7 天:{t_week} 分鐘")
    by = {}
    for r in rows:
        by[r["task"]] = by.get(r["task"], 0) + r["minutes"]
    print("各任務:")
    for k, v in sorted(by.items(), key=lambda x: -x[1]):
        print(f"  {k:<12} {'█' * (v // 5)} {v} 分")

def main():
    p = argparse.ArgumentParser(description="番茄鐘紀錄器")
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("start", help="開始計時"); s.add_argument("task"); s.add_argument("-m", "--minutes", type=int, default=25)
    s.add_argument("--speed", type=float, default=1, help="加速倍率(測試用)"); s.set_defaults(f=cmd_start)
    s = sp.add_parser("add", help="手動新增紀錄"); s.add_argument("task"); s.add_argument("-m", "--minutes", type=int, default=25); s.set_defaults(f=cmd_add)
    s = sp.add_parser("stats", help="查看統計"); s.set_defaults(f=cmd_stats)
    a = p.parse_args(); a.f(a)

if __name__ == "__main__":
    main()
