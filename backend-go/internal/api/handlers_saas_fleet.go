package api

import (
	"strings"
	"time"

	"github.com/boncore/pos-backend/internal/api/middleware"
	"github.com/boncore/pos-backend/internal/models"
	"github.com/boncore/pos-backend/internal/service"
	"github.com/gofiber/fiber/v2"
)

// RegisterSaaSFleetRoutes mounts R2 Live Fleet Monitoring & Heartbeat routes
func RegisterSaaSFleetRoutes(masterGroup fiber.Router, rootApi fiber.Router, svc *service.Services) {
	// POST /api/heartbeat - Record device heartbeat and refresh live operational pulse
	rootApi.Post("/heartbeat", func(c *fiber.Ctx) error {
		var payload struct {
			DeviceID    string `json:"device_id"`
			DeviceType  string `json:"device_type"`
			DeviceName  string `json:"device_name"`
			AppVersion  string `json:"app_version"`
			IPAddress   string `json:"ip_address"`
			TenantCode  string `json:"tenant_code"`
		}
		if err := c.BodyParser(&payload); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Geçersiz heartbeat verisi: "+err.Error())
		}

		tenantCode := payload.TenantCode
		if tenantCode == "" {
			tenantCode = middleware.GetTenantCode(c)
		}
		if tenantCode == "" {
			tenantCode = "fatihciftligi"
		}

		if payload.DeviceID == "" {
			payload.DeviceID = "dev-" + c.IP()
		}
		if payload.DeviceName == "" {
			payload.DeviceName = "Terminal (" + payload.DeviceID + ")"
		}
		if payload.DeviceType == "" {
			payload.DeviceType = "pos"
		}
		if payload.IPAddress == "" {
			payload.IPAddress = c.IP()
		}

		mdb := svc.DBManager.MasterGorm
		now := time.Now()

		// 1. Upsert into fleet_heartbeats in Master DB
		var heartbeat models.FleetHeartbeat
		err := mdb.Where("tenant_code = ? AND device_id = ?", tenantCode, payload.DeviceID).First(&heartbeat).Error
		if err == nil {
			heartbeat.DeviceName = payload.DeviceName
			heartbeat.DeviceType = payload.DeviceType
			heartbeat.IPAddress = payload.IPAddress
			heartbeat.AppVersion = payload.AppVersion
			heartbeat.Status = "online"
			heartbeat.LastHeartbeatAt = now
			mdb.Save(&heartbeat)
		} else {
			heartbeat = models.FleetHeartbeat{
				TenantCode:      tenantCode,
				DeviceID:        payload.DeviceID,
				DeviceName:      payload.DeviceName,
				DeviceType:      payload.DeviceType,
				IPAddress:       payload.IPAddress,
				AppVersion:      payload.AppVersion,
				Status:          "online",
				LastHeartbeatAt: now,
			}
			mdb.Create(&heartbeat)
		}

		// 2. Compute connected device counts in Master DB (active within last 2 minutes)
		activeWindow := now.Add(-2 * time.Minute)
		var tabletCount int64
		var handheldCount int64
		var kdsCount int64
		var posCount int64

		mdb.Model(&models.FleetHeartbeat{}).
			Where("tenant_code = ? AND device_type = ? AND last_heartbeat_at >= ?", tenantCode, "tablet", activeWindow).
			Count(&tabletCount)
		mdb.Model(&models.FleetHeartbeat{}).
			Where("tenant_code = ? AND device_type IN (?, ?) AND last_heartbeat_at >= ?", tenantCode, "handheld", "pos_handheld", activeWindow).
			Count(&handheldCount)
		mdb.Model(&models.FleetHeartbeat{}).
			Where("tenant_code = ? AND device_type = ? AND last_heartbeat_at >= ?", tenantCode, "kds", activeWindow).
			Count(&kdsCount)
		mdb.Model(&models.FleetHeartbeat{}).
			Where("tenant_code = ? AND device_type IN (?, ?, ?) AND last_heartbeat_at >= ?", tenantCode, "pos", "pos_terminal", "kiosk", activeWindow).
			Count(&posCount)

		// 3. Query tenant operational pulse from tenant DB (revenue, active tables, active orders)
		var liveRevenue float64 = 0.0
		var activeOrdersCount int64 = 0
		var activeTablesCount int64 = 0
		var todayOrdersCount int64 = 0

		if tdb, tErr := svc.DBManager.GetTenantDB(tenantCode); tErr == nil && tdb != nil {
			// Query today's payments
			var revResult struct {
				Total float64
			}
			tdb.Raw("SELECT COALESCE(SUM(amount), 0.0) as total FROM payments WHERE DATE(created_at) = CURRENT_DATE").Scan(&revResult)
			liveRevenue = revResult.Total

			// Query active orders
			tdb.Model(&models.Order{}).
				Where("status IN (?, ?, ?, ?)", "open", "active", "new", "preparing").
				Count(&activeOrdersCount)

			// Query today's total orders
			tdb.Raw("SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE").Scan(&todayOrdersCount)

			// Query occupied tables
			tdb.Model(&models.Table{}).
				Where("status != ? AND status != ?", "empty", "available").
				Count(&activeTablesCount)
		}

		// 4. Resolve tenant name for Master DB metrics
		tenantName := tenantCode
		var tenant models.RestaurantTenant
		if err := mdb.Where("code = ?", tenantCode).First(&tenant).Error; err == nil {
			tenantName = tenant.Name
			// Update tenant last seen
			mdb.Model(&tenant).Update("updated_at", now)
		}

		// 5. Upsert TenantLiveMetric
		var metric models.TenantLiveMetric
		if mErr := mdb.Where("tenant_code = ?", tenantCode).First(&metric).Error; mErr == nil {
			metric.TenantName = tenantName
			metric.IsOnline = true
			metric.LastSeenAt = now
			metric.ConnectedTablets = int(tabletCount)
			metric.ConnectedHandhelds = int(handheldCount)
			metric.ConnectedKDS = int(kdsCount)
			metric.ActiveTablesCount = int(activeTablesCount)
			metric.ActiveOrdersCount = int(activeOrdersCount)
			metric.TodayRevenue = liveRevenue
			metric.TodayOrdersCount = int(todayOrdersCount)
			mdb.Save(&metric)
		} else {
			metric = models.TenantLiveMetric{
				TenantCode:         tenantCode,
				TenantName:         tenantName,
				IsOnline:           true,
				LastSeenAt:         now,
				ConnectedTablets:   int(tabletCount),
				ConnectedHandhelds: int(handheldCount),
				ConnectedKDS:       int(kdsCount),
				ActiveTablesCount:  int(activeTablesCount),
				ActiveOrdersCount:  int(activeOrdersCount),
				TodayRevenue:       liveRevenue,
				TodayOrdersCount:   int(todayOrdersCount),
			}
			mdb.Create(&metric)
		}

		return c.JSON(fiber.Map{
			"status":       "ok",
			"tenant_code":  tenantCode,
			"device_id":    payload.DeviceID,
			"recorded_at":  now,
			"is_online":    true,
			"live_metrics": metric,
		})
	})

	// GET /api/master/fleet - Fleet radar & health monitor for all tenants
	masterGroup.Get("/fleet", func(c *fiber.Ctx) error {
		if err := requireMasterAdmin(c, svc); err != nil {
			return err
		}
		mdb := svc.DBManager.MasterGorm
		var tenants []models.RestaurantTenant
		if err := mdb.Order("name asc").Find(&tenants).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "İşletmeler yüklenemedi: "+err.Error())
		}

		now := time.Now()
		activeWindow := now.Add(-2 * time.Minute)

		var heartbeats []models.FleetHeartbeat
		mdb.Where("last_heartbeat_at >= ?", activeWindow).Find(&heartbeats)

		// Group active devices by tenant
		type deviceCounter struct {
			total     int
			tablets   int
			handhelds int
			kds       int
			pos       int
		}
		tenantDevices := make(map[string]*deviceCounter)
		for _, hb := range heartbeats {
			dc, ok := tenantDevices[hb.TenantCode]
			if !ok {
				dc = &deviceCounter{}
				tenantDevices[hb.TenantCode] = dc
			}
			dc.total++
			dType := strings.ToLower(hb.DeviceType)
			switch {
			case dType == "tablet":
				dc.tablets++
			case dType == "handheld" || dType == "pos_handheld":
				dc.handhelds++
			case dType == "kds":
				dc.kds++
			default:
				dc.pos++
			}
		}

		// Load live metrics
		var metrics []models.TenantLiveMetric
		mdb.Find(&metrics)
		metricMap := make(map[string]models.TenantLiveMetric)
		for _, m := range metrics {
			metricMap[m.TenantCode] = m
		}

		res := make([]fiber.Map, 0, len(tenants))
		for _, t := range tenants {
			m, hasMetric := metricMap[t.Code]
			dc, hasDevices := tenantDevices[t.Code]
			if !hasDevices {
				dc = &deviceCounter{}
			}

			// Determine online status
			isOnline := false
			var lastSeen time.Time
			if hasMetric && !m.LastSeenAt.IsZero() {
				lastSeen = m.LastSeenAt
				isOnline = m.LastSeenAt.After(activeWindow)
			} else if !t.UpdatedAt.IsZero() {
				lastSeen = t.UpdatedAt
				isOnline = t.UpdatedAt.After(activeWindow)
			}

			// If no cached metric or metric is stale, fetch directly from tenant DB if online
			liveRev := 0.0
			activeOrders := 0
			activeTables := 0
			todayOrders := 0
			if hasMetric {
				liveRev = m.TodayRevenue
				activeOrders = m.ActiveOrdersCount
				activeTables = m.ActiveTablesCount
				todayOrders = m.TodayOrdersCount
			} else {
				if tdb, tErr := svc.DBManager.GetTenantDB(t.Code); tErr == nil && tdb != nil {
					var revResult struct {
						Total float64
					}
					tdb.Raw("SELECT COALESCE(SUM(amount), 0.0) as total FROM payments WHERE DATE(created_at) = CURRENT_DATE").Scan(&revResult)
					liveRev = revResult.Total

					var aOrders int64
					tdb.Model(&models.Order{}).Where("status IN (?, ?, ?, ?)", "open", "active", "new", "preparing").Count(&aOrders)
					activeOrders = int(aOrders)

					var aTables int64
					tdb.Model(&models.Table{}).Where("status != ? AND status != ?", "empty", "available").Count(&aTables)
					activeTables = int(aTables)

					var tOrders int64
					tdb.Raw("SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE").Scan(&tOrders)
					todayOrders = int(tOrders)
				}
			}

			healthStatus := "healthy"
			if !isOnline {
				healthStatus = "offline"
			} else if t.ReadOnlyMode || strings.EqualFold(t.Status, "read_only") || strings.EqualFold(t.Status, "suspended") {
				healthStatus = "warning"
			}

			res = append(res, fiber.Map{
				"id":             t.ID,
				"code":           t.Code,
				"name":           t.Name,
				"city":           t.City,
				"plan":           t.Plan,
				"plan_code":      t.PlanCode,
				"status":         t.Status,
				"read_only_mode": t.ReadOnlyMode,
				"is_online":      isOnline,
				"last_seen_at":   lastSeen,
				"health_status":  healthStatus,
				"devices": fiber.Map{
					"total":     dc.total,
					"tablets":   dc.tablets,
					"handhelds": dc.handhelds,
					"kds":       dc.kds,
					"pos":       dc.pos,
				},
				"metrics": fiber.Map{
					"live_revenue":  liveRev,
					"active_orders": activeOrders,
					"active_tables": activeTables,
					"today_orders":  todayOrders,
				},
			})
		}

		return c.JSON(res)
	})
}
