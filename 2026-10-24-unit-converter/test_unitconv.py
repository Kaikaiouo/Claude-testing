import unittest
from unitconv import convert

class T(unittest.TestCase):
    def test_len(self): self.assertAlmostEqual(convert(1, "mi", "km"), 1.609344)
    def test_w(self): self.assertAlmostEqual(convert(1, "kg", "lb"), 2.2046226, 5)
    def test_t(self):
        self.assertAlmostEqual(convert(100, "c", "f"), 212)
        self.assertAlmostEqual(convert(0, "c", "k"), 273.15)
    def test_bad(self):
        with self.assertRaises(ValueError): convert(1, "kg", "km")

if __name__ == "__main__": unittest.main()
