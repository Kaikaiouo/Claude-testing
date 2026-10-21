#!/usr/bin/env python3
"""密碼產生器與強度檢查工具(僅使用標準函式庫)。"""
import argparse
import math
import secrets
import string

WORDS = ["apple", "river", "cloud", "tiger", "maple", "ocean", "stone", "light",
         "forest", "piano", "rocket", "silver", "garden", "winter", "bridge",
         "falcon", "lemon", "comet", "harbor", "violet", "thunder", "pebble",
         "meadow", "island", "candle", "dragon", "breeze", "canyon", "button", "cactus"]
COMMON = {"password", "123456", "12345678", "qwerty", "abc123", "111111", "iloveyou", "admin"}


def generate(length=16, symbols=True):
    pools = [string.ascii_lowercase, string.ascii_uppercase, string.digits]
    if symbols:
        pools.append("!@#$%^&*()-_=+")
    length = max(length, len(pools))
    chars = [secrets.choice(p) for p in pools]  # 每類至少一個
    allc = "".join(pools)
    chars += [secrets.choice(allc) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def passphrase(n=4, sep="-"):
    return sep.join(secrets.choice(WORDS) for _ in range(n))


def check(pw):
    pool = 0
    if any(c.islower() for c in pw): pool += 26
    if any(c.isupper() for c in pw): pool += 26
    if any(c.isdigit() for c in pw): pool += 10
    if any(not c.isalnum() for c in pw): pool += 32
    bits = len(pw) * math.log2(pool) if pool else 0
    if pw.lower() in COMMON:
        bits = min(bits, 10)
    if bits < 40: level = "弱"
    elif bits < 60: level = "普通"
    elif bits < 80: level = "強"
    else: level = "非常強"
    return bits, level


def main():
    ap = argparse.ArgumentParser(description="密碼產生器與強度檢查")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gen", help="產生隨機密碼")
    g.add_argument("-l", "--length", type=int, default=16)
    g.add_argument("-n", "--count", type=int, default=3)
    g.add_argument("--no-symbols", action="store_true")
    p = sub.add_parser("phrase", help="產生單字密語")
    p.add_argument("-w", "--words", type=int, default=4)
    c = sub.add_parser("check", help="檢查密碼強度")
    c.add_argument("password")
    a = ap.parse_args()
    if a.cmd == "gen":
        for _ in range(a.count):
            pw = generate(a.length, not a.no_symbols)
            bits, lv = check(pw)
            print(f"{pw}  ({bits:.0f} bits, {lv})")
    elif a.cmd == "phrase":
        print(passphrase(a.words))
    else:
        bits, lv = check(a.password)
        print(f"熵約 {bits:.1f} bits,強度:{lv}")


if __name__ == "__main__":
    main()
