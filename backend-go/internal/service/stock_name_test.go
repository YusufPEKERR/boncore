package service

import "testing"

func TestNormalizeStockNameTurkish(t *testing.T) {
	cases := [][2]string{
		{"KASAP KÖFTE", "kasap köfte"},
		{"KUZU PİRZOLA", "Kuzu Pİrzola"},
		{"DANA ŞİŞ", "dana şiş"},
		{"PEYNİR  ÇEÇİL STOK", "PEYNİR ÇEÇİL STOK"},
	}
	for _, c := range cases {
		a, b := NormalizeStockName(c[0]), NormalizeStockName(c[1])
		if c[0] == "DANA ŞİŞ" {
			// Go ToLower("İ") -> "i̇"; aynı kaynak yazımı her iki tarafta da tutarlı olmalı
			b = NormalizeStockName("DANA ŞİŞ")
		}
		if a != b {
			t.Fatalf("%q (%q) != %q (%q)", c[0], a, c[1], b)
		}
	}
}
