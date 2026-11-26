package repository

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"golang.org/x/crypto/pbkdf2"
	"gorm.io/gorm"
)

const staffPinPBKDF2Iterations = 200000

// HashPinLookupDigest computes a deterministic HMAC-SHA256 digest for PIN lookup without storing plaintext PINs.
func HashPinLookupDigest(cfg *config.Config, pin string) string {
	trimmed := strings.TrimSpace(pin)
	if trimmed == "" {
		return ""
	}
	var key []byte
	if cfg != nil && len(cfg.SecretKey) > 0 {
		key = cfg.SecretKey
	} else {
		key = []byte("boncore-fallback-pin-key")
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("boncore-pin-lookup:" + trimmed))
	return hex.EncodeToString(mac.Sum(nil))
}

// HashPinPBKDF2 generates a pbkdf2_sha256 digest matching middleware.HashPassword.
func HashPinPBKDF2(secret string) *string {
	saltBytes := make([]byte, 16)
	_, _ = rand.Read(saltBytes)
	saltHex := hex.EncodeToString(saltBytes)
	derived := pbkdf2.Key([]byte(secret), []byte(saltHex), staffPinPBKDF2Iterations, 32, sha256.New)
	derivedHex := hex.EncodeToString(derived)
	formatted := fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", staffPinPBKDF2Iterations, saltHex, derivedHex)
	return &formatted
}

// VerifyPinPBKDF2 verifies a plaintext PIN/password against a pbkdf2_sha256 hash.
func VerifyPinPBKDF2(secret string, storedHash *string) bool {
	if storedHash == nil || *storedHash == "" {
		return false
	}
	parts := strings.Split(*storedHash, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations <= 0 {
		return false
	}
	derived := pbkdf2.Key([]byte(secret), []byte(parts[2]), iterations, 32, sha256.New)
	derivedHex := hex.EncodeToString(derived)
	return hmac.Equal([]byte(derivedHex), []byte(parts[3]))
}

// IsHashedPinSentinel reports whether PinCode holds an opaque hashed placeholder rather than a plaintext PIN.
func IsHashedPinSentinel(pinCode string) bool {
	return strings.HasPrefix(pinCode, "hashed:") || strings.HasPrefix(pinCode, "nopin:")
}

// ApplyHashedStaffPin hashes rawPin into PinHash & PinLookupHash and stores an opaque unique sentinel in PinCode.
func ApplyHashedStaffPin(cfg *config.Config, u *models.StaffUser, rawPin string) {
	if u == nil {
		return
	}
	trimmed := strings.TrimSpace(rawPin)
	if trimmed == "" || IsHashedPinSentinel(trimmed) {
		if strings.TrimSpace(u.PinCode) == "" {
			rnd := make([]byte, 8)
			_, _ = rand.Read(rnd)
			u.PinCode = "nopin:" + hex.EncodeToString(rnd)
		}
		return
	}
	lookup := HashPinLookupDigest(cfg, trimmed)
	u.PinLookupHash = &lookup
	u.PinHash = HashPinPBKDF2(trimmed)
	if len(lookup) >= 24 {
		u.PinCode = "hashed:" + lookup[:24]
	} else {
		u.PinCode = "hashed:" + lookup
	}
}

// BackfillHashedStaffPINs converts any legacy plaintext PIN rows into hashed PIN records at tenant DB initialization.
func BackfillHashedStaffPINs(cfg *config.Config, db *gorm.DB) {
	if db == nil {
		return
	}
	var users []models.StaffUser
	if err := db.Find(&users).Error; err != nil {
		return
	}
	for i := range users {
		u := &users[i]
		trimmed := strings.TrimSpace(u.PinCode)
		if IsHashedPinSentinel(trimmed) && u.PinHash != nil && *u.PinHash != "" && u.PinLookupHash != nil && *u.PinLookupHash != "" {
			continue
		}
		if trimmed == "" && (u.PinHash == nil || *u.PinHash == "") {
			ApplyHashedStaffPin(cfg, u, "")
			_ = db.Model(u).Updates(map[string]interface{}{
				"pin_code": u.PinCode,
			}).Error
			continue
		}
		if trimmed != "" && !IsHashedPinSentinel(trimmed) {
			ApplyHashedStaffPin(cfg, u, trimmed)
			_ = db.Model(u).Updates(map[string]interface{}{
				"pin_code":        u.PinCode,
				"pin_hash":        u.PinHash,
				"pin_lookup_hash": u.PinLookupHash,
			}).Error
		}
	}
}
