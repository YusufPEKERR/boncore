package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config holds all environment and runtime parameters for the BonCore Go Backend.
type Config struct {
	Env                 string
	AppName             string
	AppVersion          string
	APIV1Prefix         string
	Host                string
	Port                string
	PublicBaseURL       string
	DatabaseURL         string
	MasterDatabaseURL   string
	SQLiteDataDir       string
	RedisURL            string
	SecretKey           []byte
	TokenTTLSeconds     int64
	RememberTTLSeconds  int64
	DefaultKuverPrice   float64
	ManagerOverridePIN  string
	MasterAdminPassword string
	DefaultTenantCode   string
	AllowDemoSeed       bool
	DBMaxConns          int32
	DBMinConns          int32
	PgBouncerMode       bool
}

// Load reads configuration from environment variables with production-ready defaults
// that preserve 100% compatibility with the existing BonCore setup.
func Load() *Config {
	cwd, _ := os.Getwd()
	backendDataDir := filepath.Join(cwd, "..", "backend", "data")
	if _, err := os.Stat(backendDataDir); os.IsNotExist(err) {
		backendDataDir = filepath.Join(cwd, "backend", "data")
	}

	env := strings.ToLower(getEnv("BONCORE_ENV", "development"))
	if env == "production" && strings.TrimSpace(os.Getenv("BONCORE_SECRET_KEY")) == "" {
		log.Fatal("[FATAL] BONCORE_ENV=production iken BONCORE_SECRET_KEY ortam değişkeni zorunludur.")
	}
	secret := loadOrGenerateSecret(cwd)

	masterPwd := strings.TrimSpace(os.Getenv("BONCORE_MASTER_PASSWORD"))
	if masterPwd == "" {
		if env == "production" {
			log.Fatal("[FATAL] BONCORE_ENV=production iken BONCORE_MASTER_PASSWORD ortam değişkeni zorunludur.")
		}
		randBytes := make([]byte, 12)
		if _, err := rand.Read(randBytes); err == nil {
			masterPwd = hex.EncodeToString(randBytes)
		} else {
			masterPwd = "dev-ephemeral-master-password"
		}
		log.Printf("[DEV] BONCORE_MASTER_PASSWORD tanımlı değil; geçici geliştirme parolası oluşturuldu: %s", masterPwd)
	}

	return &Config{
		Env:                 env,
		AppName:             getEnv("APP_NAME", "BonCore POS & Restoran Yönetim Sistemi"),
		AppVersion:          getEnv("APP_VERSION", "2.0.0"),
		APIV1Prefix:         getEnv("API_V1_STR", "/api"),
		Host:                getEnv("HOST", "0.0.0.0"),
		Port:                getEnv("PORT", "8000"),
		PublicBaseURL:       strings.TrimRight(getEnv("PUBLIC_BASE_URL", "https://boncoreapp.me"), "/"),
		DatabaseURL:         getEnv("DATABASE_URL", ""),
		MasterDatabaseURL:   getEnv("MASTER_DATABASE_URL", ""),
		SQLiteDataDir:       getEnv("SQLITE_DATA_DIR", backendDataDir),
		RedisURL:            getEnv("REDIS_URL", ""),
		SecretKey:           secret,
		TokenTTLSeconds:     getEnvInt64("BONCORE_TOKEN_TTL", 12*60*60),
		RememberTTLSeconds:  7 * 24 * 60 * 60,
		DefaultKuverPrice:   getEnvFloat("DEFAULT_KUVER_PRICE", 35.0),
		ManagerOverridePIN:  getEnv("MANAGER_OVERRIDE_PIN", ""),
		MasterAdminPassword: masterPwd,
		DefaultTenantCode:   getEnv("DEFAULT_TENANT_CODE", "fatihciftligi"),
		AllowDemoSeed:       getEnvBool("BONCORE_ALLOW_DEMO_SEED", false),
		DBMaxConns:          int32(getEnvInt64("DB_MAX_CONNS", 50)),
		DBMinConns:          int32(getEnvInt64("DB_MIN_CONNS", 10)),
		PgBouncerMode:       getEnvBool("PGBOUNCER_MODE", true),
	}
}

func loadOrGenerateSecret(cwd string) []byte {
	if envSecret := strings.TrimSpace(os.Getenv("BONCORE_SECRET_KEY")); envSecret != "" {
		return []byte(envSecret)
	}
	candidates := []string{
		filepath.Join(cwd, "..", "backend", ".auth_secret"),
		filepath.Join(cwd, "backend", ".auth_secret"),
		filepath.Join(cwd, ".auth_secret"),
	}
	for _, p := range candidates {
		if data, err := os.ReadFile(p); err == nil {
			trimmed := strings.TrimSpace(string(data))
			if trimmed != "" {
				return []byte(trimmed)
			}
		}
	}
	// Generate a cryptographically random secret and persist it to .auth_secret
	// so tokens remain valid across server restarts without hardcoded secret keys.
	randBytes := make([]byte, 32)
	if _, err := rand.Read(randBytes); err == nil {
		genSecret := hex.EncodeToString(randBytes)
		persistPath := filepath.Join(cwd, ".auth_secret")
		if _, statErr := os.Stat(filepath.Join(cwd, "..", "backend")); statErr == nil {
			persistPath = filepath.Join(cwd, "..", "backend", ".auth_secret")
		}
		if wErr := os.WriteFile(persistPath, []byte(genSecret), 0600); wErr == nil {
			return []byte(genSecret)
		}
		return []byte(genSecret)
	}
	return []byte("boncore-ephemeral-secret-unavailable")
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
			return parsed
		}
	}
	return fallback
}

func getEnvFloat(key string, fallback float64) float64 {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if parsed, err := strconv.ParseFloat(v, 64); err == nil {
			return parsed
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if parsed, err := strconv.ParseBool(v); err == nil {
			return parsed
		}
	}
	return fallback
}
