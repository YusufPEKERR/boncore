package middleware

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/pbkdf2"
)

const (
	PBKDF2Iterations = 200000
	ContextTenantKey = "tenant_code"
	ContextUserClaims = "user_claims"
)

// TokenClaims matches the exact JSON payload signed by Python's `create_access_token` in `backend/app/security.py`.
type TokenClaims struct {
	Sub  int    `json:"sub"`
	Role string `json:"role"`
	RC   string `json:"rc"`
	RID  *int   `json:"rid"`
	Exp  int64  `json:"exp"`
}

// HashPassword generates a `pbkdf2_sha256$200000$<salt_hex>$<digest_hex>` password hash
// 100% compatible with Python's `hash_password` in `backend/app/security.py`.
func HashPassword(password string) *string {
	saltBytes := make([]byte, 16)
	_, _ = rand.Read(saltBytes)
	saltHex := hex.EncodeToString(saltBytes)
	derived := pbkdf2.Key([]byte(password), []byte(saltHex), PBKDF2Iterations, 32, sha256.New)
	derivedHex := hex.EncodeToString(derived)
	formatted := fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", PBKDF2Iterations, saltHex, derivedHex)
	return &formatted
}

// VerifyPassword verifies a plaintext password against `pbkdf2_sha256$200000$<salt>$<hex_digest>`.
func VerifyPassword(password string, storedHash *string) bool {
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
	salt := parts[2]
	expectedHex := parts[3]

	derived := pbkdf2.Key([]byte(password), []byte(salt), iterations, 32, sha256.New)
	derivedHex := hex.EncodeToString(derived)
	return hmac.Equal([]byte(derivedHex), []byte(expectedHex))
}

// CreateAccessToken generates a 100% compatible `<base64url_payload>.<base64url_hmac_sha256>` token.
func CreateAccessToken(cfg *config.Config, userID int, role string, remember bool, restaurantCode string, restaurantID *int) (string, int64) {
	ttl := cfg.TokenTTLSeconds
	if remember {
		ttl = cfg.RememberTTLSeconds
	}
	exp := time.Now().Unix() + ttl
	claims := TokenClaims{
		Sub:  userID,
		Role: role,
		RC:   restaurantCode,
		RID:  restaurantID,
		Exp:  exp,
	}
	payloadJSON, _ := json.Marshal(claims)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	mac := hmac.New(sha256.New, cfg.SecretKey)
	mac.Write([]byte(payloadB64))
	sigB64 := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", payloadB64, sigB64), exp
}

// DecodeAccessToken validates the HMAC-SHA256 signature and expiration timestamp.
func DecodeAccessToken(cfg *config.Config, token string) (*TokenClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid token format")
	}
	payloadB64, sigB64 := parts[0], parts[1]

	mac := hmac.New(sha256.New, cfg.SecretKey)
	mac.Write([]byte(payloadB64))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sigB64), []byte(expectedSig)) {
		return nil, fmt.Errorf("invalid token signature")
	}

	rawJSON, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, err
	}

	var claims TokenClaims
	if err := json.Unmarshal(rawJSON, &claims); err != nil {
		return nil, err
	}
	if claims.Exp < time.Now().Unix() {
		return nil, fmt.Errorf("token expired")
	}
	return &claims, nil
}

// ResolveTenantCodeFromRequest resolves tenant code safely:
// 1. If the caller already has HMAC-verified tenant claims (non-master), ALWAYS lock to claims.RC so headers cannot spoof another tenant.
// 2. Otherwise (unauthenticated public/QR/WS/login or master_admin), check Header -> Cookie -> Query Param -> fallback.
func ResolveTenantCodeFromRequest(c *fiber.Ctx, fallback string, verifiedClaims *TokenClaims) string {
	// 1. Authenticated non-master tenant claim takes strict precedence over client headers
	if verifiedClaims != nil && verifiedClaims.RC != "" {
		roleLow := strings.ToLower(strings.TrimSpace(verifiedClaims.Role))
		if roleLow != "master_admin" && roleLow != "superadmin" {
			return repository.CleanTenantCode(verifiedClaims.RC, fallback)
		}
	}

	// 2. Custom Header (for QR, Hardware Agent, or Master Admin inspection)
	hCode := c.Get("X-Restaurant-Code")
	if hCode == "" {
		hCode = c.Get("X-Tenant-Code")
	}
	if hCode != "" {
		return repository.CleanTenantCode(hCode, fallback)
	}

	// 3. Cookie
	cookieCode := c.Cookies("boncore_restaurant_code")
	if cookieCode == "" {
		cookieCode = c.Cookies("restaurant_code")
	}
	if cookieCode != "" {
		return repository.CleanTenantCode(cookieCode, fallback)
	}

	// 4. Query Parameter
	for _, qKey := range []string{"restoran", "restaurant", "restaurant_code", "tenant", "tenant_code"} {
		if qVal := c.Query(qKey); qVal != "" {
			return repository.CleanTenantCode(qVal, fallback)
		}
	}

	return fallback
}

// TenantAndAuthMiddleware verifies Bearer HMAC tokens first and attaches `user_claims` and isolated `tenant_code`.
func TenantAndAuthMiddleware(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var verifiedClaims *TokenClaims
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			token := strings.TrimSpace(authHeader[7:])
			if claims, err := DecodeAccessToken(cfg, token); err == nil {
				verifiedClaims = claims
				c.Locals(ContextUserClaims, claims)
			}
		}

		tenantCode := ResolveTenantCodeFromRequest(c, cfg.DefaultTenantCode, verifiedClaims)
		c.Locals(ContextTenantKey, tenantCode)
		return c.Next()
	}
}

// GetTenantCode retrieves the active tenant code resolved by TenantAndAuthMiddleware.
func GetTenantCode(c *fiber.Ctx) string {
	if val, ok := c.Locals(ContextTenantKey).(string); ok && val != "" {
		return val
	}
	claims := GetUserClaims(c)
	if resolved := ResolveTenantCodeFromRequest(c, "", claims); resolved != "" {
		c.Locals(ContextTenantKey, resolved)
		return resolved
	}
	return "fatihciftligi"
}

// GetUserClaims retrieves the decoded JWT TokenClaims if present.
func GetUserClaims(c *fiber.Ctx) *TokenClaims {
	if claims, ok := c.Locals(ContextUserClaims).(*TokenClaims); ok {
		return claims
	}
	return nil
}
