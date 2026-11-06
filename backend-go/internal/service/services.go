package service

import (
	"encoding/json"
	"net/url"
	"strings"

	"github.com/boncore/pos-backend/internal/config"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/repository"
	"github.com/boncore/pos-backend/internal/ws"
	"gorm.io/gorm"
)

// Services aggregates all domain services for Clean Architecture dependency injection.
type Services struct {
	Config      *config.Config
	DBManager   *repository.DatabaseManager
	Broadcaster ws.EventBroadcaster
	WSHub       *ws.Hub
	Cache       *ws.CacheManager
	Permissions *PermissionService
}

func NewServices(cfg *config.Config, dbm *repository.DatabaseManager, hub *ws.Hub) *Services {
	var broadcaster ws.EventBroadcaster = hub
	if hub == nil {
		broadcaster = ws.NewNoopBroadcaster()
	}
	var cache *ws.CacheManager
	if hub != nil {
		cache = hub.Cache()
	} else {
		cache = ws.NewCacheManager(nil, false)
	}
	return &Services{
		Config:      cfg,
		DBManager:   dbm,
		Broadcaster: broadcaster,
		WSHub:       hub,
		Cache:       cache,
		Permissions: NewPermissionService(),
	}
}

// PermissionService implements 100% contract-preserving role & tab permission checks
// matching `backend/app/services/permission_service.py`.
type PermissionService struct{}

func NewPermissionService() *PermissionService {
	return &PermissionService{}
}

// NormalizeRoleKey maps Turkish/English role labels to canonical keys:
// manager, cashier, kitchen, courier, waiter.
func (ps *PermissionService) NormalizeRoleKey(rawRole string) string {
	if strings.TrimSpace(rawRole) == "" {
		return "waiter"
	}
	decoded, err := url.QueryUnescape(rawRole)
	if err != nil {
		decoded = rawRole
	}
	r := strings.ToLower(strings.TrimSpace(decoded))
	switch r {
	case "admin", "müdür", "mudur", "manager":
		return "manager"
	case "kasa", "kasiyer", "cashier":
		return "cashier"
	case "mutfak", "kitchen":
		return "kitchen"
	case "kurye", "courier":
		return "courier"
	case "garson", "waiter":
		return "waiter"
	default:
		return r
	}
}

// ResolveOperatorRole inspects the `X-User-Role` header first, then falls back to `operator_name` in `staff_users`.
func (ps *PermissionService) ResolveOperatorRole(db *gorm.DB, headerRole string, operatorName string) string {
	if strings.TrimSpace(headerRole) != "" {
		return ps.NormalizeRoleKey(headerRole)
	}
	cleanName := strings.TrimSpace(operatorName)
	if cleanName != "" && db != nil {
		var staff models.StaffUser
		if err := db.Where("name = ? AND is_active = ?", cleanName, true).First(&staff).Error; err == nil && staff.Role != "" {
			return ps.NormalizeRoleKey(staff.Role)
		}
		if strings.Contains(strings.ToLower(cleanName), "garson") {
			return "waiter"
		}
	}
	return ""
}

type rolePermissionEntry struct {
	ID    string          `json:"id"`
	Roles map[string]bool `json:"roles"`
}

// CheckRolePermission evaluates whether `roleKey` has any of `permIDs` enabled in `restaurant_settings.role_permissions`.
func (ps *PermissionService) CheckRolePermission(db *gorm.DB, roleKey string, permIDs []string, defaultValue bool) bool {
	if roleKey == "manager" {
		return true
	}
	if db == nil {
		return defaultValue
	}

	var setting models.RestaurantSetting
	if err := db.Where("key = ?", "role_permissions").First(&setting).Error; err != nil || setting.Value == "" {
		return defaultValue
	}

	var perms []rolePermissionEntry
	if err := json.Unmarshal([]byte(setting.Value), &perms); err != nil {
		return defaultValue
	}

	permSet := make(map[string]struct{}, len(permIDs))
	for _, id := range permIDs {
		permSet[id] = struct{}{}
	}

	matchedAny := false
	for _, p := range perms {
		if _, ok := permSet[p.ID]; ok {
			matchedAny = true
			if p.Roles != nil && p.Roles[roleKey] {
				return true
			}
		}
	}

	if matchedAny {
		return false
	}
	return defaultValue
}
