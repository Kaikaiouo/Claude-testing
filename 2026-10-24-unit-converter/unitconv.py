#!/usr/bin/env python3
"""單位換算工具:長度、重量、溫度、容量。用法: python3 unitconv.py 10 km mi"""
import sys

# 各類別以基準單位表示 (長度=公尺, 重量=公克, 容量=公升)
FACTORS = {
    "長度": {"mm": 0.001, "cm": 0.01, "m": 1, "km": 1000, "in": 0.0254,
             "ft": 0.3048, "yd": 0.9144, "mi": 1609.344, "台尺": 10 / 33},
    "重量": {"mg": 0.001, "g": 1, "kg": 1000, "oz": 28.349523125,
             "lb": 453.59237, "台斤": 600},
    "容量": {"ml": 0.001, "l": 1, "gal": 3.785411784, "cup": 0.2365882365},
}
TEMPS = {"c", "f", "k"}


def convert_temp(v, src, dst):
    c = {"c": v, "f": (v - 32) * 5 / 9, "k": v - 273.15}[src]
    return {"c": c, "f": c * 9 / 5 + 32, "k": c + 273.15}[dst]


def convert(value, src, dst):
    s, d = src.lower(), dst.lower()
    if s in TEMPS and d in TEMPS:
        return convert_temp(value, s, d)
    for table in FACTORS.values():
        if s in table and d in table:
            return value * table[s] / table[d]
    raise ValueError(f"無法從 {src} 換算到 {dst}(單位未知或類別不同)")


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        print("支援單位:")
        for k, t in FACTORS.items():
            print(f"  {k}: {', '.join(t)}")
        print("  溫度: c, f, k")
        return 1
    try:
        v = float(argv[0])
        r = convert(v, argv[1], argv[2])
    except ValueError as e:
        print(f"錯誤: {e}")
        return 1
    print(f"{v:g} {argv[1]} = {r:.4f}".rstrip("0").rstrip(".") + f" {argv[2]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
