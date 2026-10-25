#!/usr/bin/env python3
"""記帳 CSV 統計工具:依類別與月份彙總支出。用法: python3 expense.py 檔案.csv"""
import csv
import sys
from collections import defaultdict


def load(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append((r["日期"].strip(), r["類別"].strip(), float(r["金額"])))
    return rows


def summarize(rows):
    by_cat, by_month = defaultdict(float), defaultdict(float)
    for date, cat, amt in rows:
        by_cat[cat] += amt
        by_month[date[:7]] += amt
    return dict(by_cat), dict(by_month)


def bar(value, total, width=20):
    return "█" * round(width * value / total) if total else ""


def report(rows):
    by_cat, by_month = summarize(rows)
    total = sum(by_cat.values())
    out = [f"總支出: {total:,.0f} 元 ({len(rows)} 筆)", "", "[依類別]"]
    for c, v in sorted(by_cat.items(), key=lambda x: -x[1]):
        out.append(f"{c:<6}{v:>9,.0f} {v/total:>6.1%} {bar(v, total)}")
    out += ["", "[依月份]"]
    for m, v in sorted(by_month.items()):
        out.append(f"{m}{v:>9,.0f} {bar(v, max(by_month.values()))}")
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("用法: python3 expense.py 檔案.csv")
    print(report(load(sys.argv[1])))
