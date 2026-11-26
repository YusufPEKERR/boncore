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
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/pbkdf2"
)

const (
	PBKDF2Iterations  = 200000
	ContextTenantKey  = "tenant_code"
	ContextUserClaims = "user_claims"
)

// TokenClaims holds the signed HMAC claims for tenant staff or master platform sessions.
type TokenClaims struct {
	Sub  int    `json:"sub"`
	Role string `json:"role"`
	RC   string `json:"rc"`
	RID  *int   `json:"rid"`
	Aud  string `json:"aud,omitempty"`
	Exp  int64  `json:"exp"`
}

// IsMasterClaims validates that a token is genuinely issued for the SaaS Master Platform.
func IsMasterClaims(claims *TokenClaims) bool {
	if claims == nil {
		return false
	}
	if claims.Aud != "master_platform" || claims.RC != "master" {
		return false
	}
	r := strings.ToLower(strings.TrimSpace(claims.Role))
	return r == "master_admin" || r == "superadmin"
}

// HashPinLookup computes a deterministic HMAC-SHA256 digest of a PIN for O(1) lookup without storing plaintext PINs.
func HashPinLookup(cfg *config.Config, pin string) string {
	if cfg == nil {
		return ""
	}
	mac := hmac.New(sha256.New, cfg.SecretKey)
	mac.Write([]byte("boncore-pin-lookup:" + strings.TrimSpace(pin)))
	return hex.EncodeToString(mac.Sum(nil))
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

// CreateAccessToken generates a signed `<base64url_payload>.<base64url_hmac_sha256>` tenant staff token.
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
		Aud:  "tenant",
		Exp:  exp,
	}
	return signTokenClaims(cfg, claims), exp
}

// CreateMasterAccessToken generates an isolated Master SaaS Platform token.
func CreateMasterAccessToken(cfg *config.Config, userID int, remember bool) (string, int64) {
	ttl := cfg.TokenTTLSeconds
	if remember {
		ttl = cfg.RememberTTLSeconds
	}
	exp := time.Now().Unix() + ttl
	claims := TokenClaims{
		Sub:  userID,
		Role: "master_admin",
		RC:   "master",
		RID:  nil,
		Aud:  "master_platform",
		Exp:  exp,
	}
	return signTokenClaims(cfg, claims), exp
}

// CreateWSTicket generates a short-lived (60s) WebSocket connection ticket bound to the authenticated claims.
func CreateWSTicket(cfg *config.Config, base *TokenClaims) (string, int64) {
	exp := time.Now().Unix() + 60
	claims := TokenClaims{
		Sub:  base.Sub,
		Role: base.Role,
		RC:   base.RC,
		RID:  base.RID,
		Aud:  "ws_ticket",
		Exp:  exp,
	}
	return signTokenClaims(cfg, claims), exp
}

func signTokenClaims(cfg *config.Config, claims TokenClaims) string {
	payloadJSON, _ := json.Marshal(claims)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	mac := hmac.New(sha256.New, cfg.SecretKey)
	mac.Write([]byte(payloadB64))
	sigB64 := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", payloadB64, sigB64)
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
	if verifiedClaims != nil && verifiedClaims.RC != "" && !IsMasterClaims(verifiedClaims) {
		return repository.CleanTenantCode(verifiedClaims.RC, fallback)
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

// isPublicAPIRoute lists endpoints accessible without a staff/master JWT.
func isPublicAPIRoute(method, path string) bool {
	if method == fiber.MethodOptions {
		return true
	}
	switch {
	case path == "/api/auth/login" || path == "/api/auth/login-pin":
		return true
	case path == "/api/master/login":
		return true
	case method == fiber.MethodPost && path == "/api/master/leads":
		return true
	case strings.HasPrefix(path, "/api/qr/"):
		return true
	case method == fiber.MethodPost && strings.HasPrefix(path, "/api/tables/") && strings.HasSuffix(path, "/call-waiter"):
		return true
	case method == fiber.MethodGet && (path == "/api/scale/agent/version" || path == "/api/scale/setup"):
		return true
	default:
		return false
	}
}

// isHardwareAgentRoute identifies hardware bridge polling/reporting routes that accept a per-tenant X-Agent-Key.
func isHardwareAgentRoute(path string) bool {
	return path == "/api/scale/agent/heartbeat" ||
		path == "/api/scale/agent/poll" ||
		path == "/api/scale/agent/report"
}

// verifyTenantAgentKey validates X-Agent-Key against the tenant's configured hardware agent key.
func verifyTenantAgentKey(dm *repository.DatabaseManager, tenantCode, providedKey string) bool {
	providedKey = strings.TrimSpace(providedKey)
	if providedKey == "" || dm == nil {
		return false
	}
	tdb, err := dm.GetTenantDB(tenantCode)
	if err != nil || tdb == nil {
		return false
	}
	var row models.RestaurantSetting
	if err := tdb.Where("key = ?", "agent_api_key").First(&row).Error; err != nil {
		return false
	}
	stored := strings.Trim(strings.TrimSpace(row.Value), `"`)
	if stored == "" {
		return false
	}
	return hmac.Equal([]byte(providedKey), []byte(stored))
}

// RequireAuthMiddleware enforces default-deny authentication on all /api/* routes except the explicit public allowlist.
func RequireAuthMiddleware(dm *repository.DatabaseManager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()
		method := c.Method()
		if isPublicAPIRoute(method, path) {
			return c.Next()
		}
		if claims := GetUserClaims(c); claims != nil && claims.Aud != "ws_ticket" {
			return c.Next()
		}
		if isHardwareAgentRoute(path) {
			agentKey := c.Get("X-Agent-Key")
			if agentKey == "" {
				agentKey = c.Query("agent_key")
			}
			tenantCode := GetTenantCode(c)
			if verifyTenantAgentKey(dm, tenantCode, agentKey) {
				return c.Next()
			}
		}
		return fiber.NewError(fiber.StatusUnauthorized, "Bu işlem için geçerli bir oturum açmanız gerekmektedir.")
	}
}
