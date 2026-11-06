package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

// ============================================================================
// JSONB GENERIC HELPERS (PostgreSQL JSONB & SQLite JSON 100% Uyumlu)
// ============================================================================

// StringSlice maps a JSON array of strings (e.g. allergens, negative_modifiers) to PostgreSQL JSONB.
type StringSlice []string

func (s StringSlice) Value() (driver.Value, error) {
	if s == nil {
		return "[]", nil
	}
	b, err := json.Marshal(s)
	return string(b), err
}

func (s *StringSlice) Scan(value interface{}) error {
	if value == nil {
		*s = []string{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New("failed to scan StringSlice")
	}
	if len(bytes) == 0 {
		*s = []string{}
		return nil
	}
	return json.Unmarshal(bytes, s)
}

// ModifierSlice maps selected_modifiers JSON array to PostgreSQL JSONB.
type ModifierSlice []SelectedModifier

func (m ModifierSlice) Value() (driver.Value, error) {
	if m == nil {
		return "[]", nil
	}
	b, err := json.Marshal(m)
	return string(b), err
}

func (m *ModifierSlice) Scan(value interface{}) error {
	if value == nil {
		*m = []SelectedModifier{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New("failed to scan ModifierSlice")
	}
	if len(bytes) == 0 {
		*m = []SelectedModifier{}
		return nil
	}
	return json.Unmarshal(bytes, m)
}

// JSONMap maps dynamic JSON objects (e.g. AuditLog.details) to PostgreSQL JSONB.
type JSONMap map[string]interface{}

func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return "{}", nil
	}
	b, err := json.Marshal(j)
	return string(b), err
}

func (j *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*j = map[string]interface{}{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return errors.New("failed to scan JSONMap")
	}
	if len(bytes) == 0 {
		*j = map[string]interface{}{}
		return nil
	}
	return json.Unmarshal(bytes, j)
}

// ============================================================================
// 1. TENANT (RESTORAN) VERİTABANI MODELLERİ (22 TABLO)
// ============================================================================

// StaffUser -> table: staff_users
type StaffUser struct {
	ID           int        `gorm:"primaryKey;autoIncrement" json:"id"`
	Name         string     `gorm:"size:100;not null" json:"name"`
	Username     *string    `gorm:"size:50;uniqueIndex" json:"username"`
	PasswordHash *string    `gorm:"size:255" json:"-"`
	PinCode      string     `gorm:"size:10;not null;uniqueIndex" json:"pin_code,omitempty"`
	Role         string     `gorm:"size:50;not null;default:waiter" json:"role"`
	RestaurantID *int       `gorm:"index;default:1" json:"restaurant_id,omitempty"`
	IsActive     bool       `gorm:"default:true" json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

func (StaffUser) TableName() string { return "staff_users" }

// Area -> table: areas
type Area struct {
	ID         int     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name       string  `gorm:"size:50;not null" json:"name"`
	OrderIndex int     `gorm:"default:0" json:"order_index"`
	Tables     []Table `gorm:"foreignKey:AreaID;constraint:OnDelete:CASCADE" json:"tables,omitempty"`
}

func (Area) TableName() string { return "areas" }

// Table -> table: tables
type Table struct {
	ID               int        `gorm:"primaryKey;autoIncrement" json:"id"`
	AreaID           int        `gorm:"not null;index" json:"area_id"`
	Name             string     `gorm:"size:50;not null" json:"name"`
	Shape            string     `gorm:"size:20;default:square" json:"shape"`
	OrderIndex       int        `gorm:"default:0" json:"order_index"`
	X                float64    `gorm:"default:100.0" json:"x"`
	Y                float64    `gorm:"default:100.0" json:"y"`
	Width            float64    `gorm:"default:120.0" json:"width"`
	Height           float64    `gorm:"default:120.0" json:"height"`
	Seats            int        `gorm:"default:4" json:"seats"`
	Status           string     `gorm:"size:30;default:empty;index" json:"status"`
	CurrentOrderID   *int       `json:"current_order_id"`
	OpenedAt         *time.Time `json:"opened_at"`
	KuverCount       int        `gorm:"default:0" json:"kuver_count"`
	WaiterName       *string    `gorm:"size:100" json:"waiter_name"`
	ReservationName  *string    `gorm:"size:100" json:"reservation_name"`
	ReservationTime  *string    `gorm:"size:50" json:"reservation_time"`
	WaiterCallReason *string    `gorm:"size:100" json:"waiter_call_reason"`
	IsMergedTo       *int       `json:"is_merged_to"`

	Area   *Area   `gorm:"foreignKey:AreaID" json:"area,omitempty"`
	Orders []Order `gorm:"foreignKey:TableID" json:"orders,omitempty"`
}

func (Table) TableName() string { return "tables" }

// Category -> table: categories
type Category struct {
	ID            int       `gorm:"primaryKey;autoIncrement" json:"id"`
	Name          string    `gorm:"size:100;not null" json:"name"`
	Icon          string    `gorm:"size:50;default:Utensils" json:"icon"`
	Color         string    `gorm:"size:30;default:#f97316" json:"color"`
	OrderIndex    int       `gorm:"default:0" json:"order_index"`
	TargetStation string    `gorm:"size:50;default:kitchen" json:"target_station"`
	ShowInPos     bool      `gorm:"default:true" json:"show_in_pos"`
	Products      []Product `gorm:"foreignKey:CategoryID;constraint:OnDelete:CASCADE" json:"products,omitempty"`
}

func (Category) TableName() string { return "categories" }

// Product -> table: products
type Product struct {
	ID          int         `gorm:"primaryKey;autoIncrement" json:"id"`
	CategoryID  int         `gorm:"not null;index" json:"category_id"`
	Name        string      `gorm:"size:150;not null" json:"name"`
	Description *string     `gorm:"type:text" json:"description"`
	BasePrice   float64     `gorm:"not null" json:"base_price"`
	PluCode     *string     `gorm:"size:20;index" json:"plu_code"`
	Barcode     *string     `gorm:"size:50;index" json:"barcode"`
	VatRate     float64     `gorm:"default:10.0" json:"vat_rate"`
	Station     string      `gorm:"size:50;default:kitchen;index" json:"station"`
	OrderIndex  int         `gorm:"default:0" json:"order_index"`
	IsAvailable bool        `gorm:"default:true" json:"is_available"`
	ShowInPos   bool        `gorm:"default:true" json:"show_in_pos"`
	ImageURL    *string     `gorm:"size:255" json:"image_url"`
	Calories    *int        `json:"calories"`
	Allergens   StringSlice `gorm:"type:jsonb;default:'[]'" json:"allergens"`
	IsVegan     bool        `gorm:"default:false" json:"is_vegan"`
	IsSpicy     bool        `gorm:"default:false" json:"is_spicy"`

	Category       *Category        `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	Variants       []ProductVariant `gorm:"foreignKey:ProductID;constraint:OnDelete:CASCADE" json:"variants"`
	ModifierGroups []ModifierGroup  `gorm:"foreignKey:ProductID;constraint:OnDelete:CASCADE" json:"modifier_groups"`
	Recipes        []Recipe         `gorm:"foreignKey:ProductID;constraint:OnDelete:CASCADE" json:"recipes,omitempty"`
}

func (Product) TableName() string { return "products" }

// ProductVariant -> table: product_variants
type ProductVariant struct {
	ID         int     `gorm:"primaryKey;autoIncrement" json:"id"`
	ProductID  int     `gorm:"not null;index" json:"product_id,omitempty"`
	Name       string  `gorm:"size:100;not null" json:"name"`
	PriceDelta float64 `gorm:"default:0.0" json:"price_delta"`
	IsDefault  bool    `gorm:"default:false" json:"is_default"`
}

func (ProductVariant) TableName() string { return "product_variants" }

// ModifierGroup -> table: modifier_groups
type ModifierGroup struct {
	ID           int              `gorm:"primaryKey;autoIncrement" json:"id"`
	ProductID    int              `gorm:"not null;index" json:"product_id,omitempty"`
	Name         string           `gorm:"size:100;not null" json:"name"`
	IsRequired   bool             `gorm:"default:false" json:"is_required"`
	MinSelection int              `gorm:"default:0" json:"min_selection"`
	MaxSelection int              `gorm:"default:1" json:"max_selection"`
	Options      []ModifierOption `gorm:"foreignKey:GroupID;constraint:OnDelete:CASCADE" json:"options"`
}

func (ModifierGroup) TableName() string { return "modifier_groups" }

// ModifierOption -> table: modifier_options
type ModifierOption struct {
	ID      int     `gorm:"primaryKey;autoIncrement" json:"id"`
	GroupID int     `gorm:"not null;index" json:"group_id,omitempty"`
	Name    string  `gorm:"size:100;not null" json:"name"`
	Price   float64 `gorm:"default:0.0" json:"price"`
}

func (ModifierOption) TableName() string { return "modifier_options" }

// Ingredient -> table: ingredients
type Ingredient struct {
	ID            int     `gorm:"primaryKey;autoIncrement" json:"id"`
	ProductCode   string  `gorm:"size:50;default:''" json:"product_code"`
	CategoryName  string  `gorm:"size:100;default:'DİĞER'" json:"category_name"`
	Name          string  `gorm:"size:150;not null;index" json:"name"`
	KitchenGroup  string  `gorm:"size:100;default:'MUTFAK'" json:"kitchen_group"`
	RevenueCenter string  `gorm:"size:100;default:'Ana Kanal'" json:"revenue_center"`
	Unit          string  `gorm:"size:30;default:'Adet'" json:"unit"`
	CostPerUnit   float64 `gorm:"default:0.0" json:"cost_per_unit"`
	CurrentStock  float64 `gorm:"default:0.0" json:"current_stock"`
	MinStockAlert float64 `gorm:"default:0.0" json:"min_stock_alert"`
	WarehouseID   int     `gorm:"default:1" json:"warehouse_id"`
}

func (Ingredient) TableName() string { return "ingredients" }

// Recipe -> table: recipes
type Recipe struct {
	ID              int         `gorm:"primaryKey;autoIncrement" json:"id"`
	ProductID       int         `gorm:"not null;index" json:"product_id"`
	IngredientID    int         `gorm:"not null;index" json:"ingredient_id"`
	Amount          float64     `gorm:"not null" json:"amount"`
	WastePercentage float64     `gorm:"default:0.0" json:"waste_percentage"`
	Ingredient      *Ingredient `gorm:"foreignKey:IngredientID" json:"ingredient,omitempty"`
}

func (Recipe) TableName() string { return "recipes" }

// Warehouse -> table: warehouses
type Warehouse struct {
	ID     int              `gorm:"primaryKey;autoIncrement" json:"id"`
	Name   string           `gorm:"size:100;not null" json:"name"`
	Code   string           `gorm:"size:20;uniqueIndex" json:"code"`
	IsMain bool             `gorm:"default:false" json:"is_main"`
	Stocks []WarehouseStock `gorm:"foreignKey:WarehouseID;constraint:OnDelete:CASCADE" json:"stocks,omitempty"`
}

func (Warehouse) TableName() string { return "warehouses" }

// WarehouseStock -> table: warehouse_stocks
type WarehouseStock struct {
	ID            int     `gorm:"primaryKey;autoIncrement" json:"id"`
	WarehouseID   int     `gorm:"not null;index" json:"warehouse_id"`
	IngredientID  int     `gorm:"not null;index" json:"ingredient_id"`
	Quantity      float64 `gorm:"default:0.0" json:"quantity"`
	MinAlertLevel float64 `gorm:"default:100.0" json:"min_alert_level"`
}

func (WarehouseStock) TableName() string { return "warehouse_stocks" }

// StockMovement -> table: stock_movements
type StockMovement struct {
	ID                int       `gorm:"primaryKey;autoIncrement" json:"id"`
	MovementType      string    `gorm:"size:50;not null;index" json:"movement_type"`
	IngredientID      int       `gorm:"not null;index" json:"ingredient_id"`
	SourceWarehouseID *int      `json:"source_warehouse_id"`
	TargetWarehouseID *int      `json:"target_warehouse_id"`
	Amount            float64   `gorm:"not null" json:"amount"`
	Unit              string    `gorm:"size:20;default:'gr'" json:"unit"`
	CostPrice         float64   `gorm:"default:0.0" json:"cost_price"`
	ReferenceNo       *string   `gorm:"size:100" json:"reference_no"`
	Notes             *string   `gorm:"type:text" json:"notes"`
	CreatedBy         string    `gorm:"size:100;default:'Sistem'" json:"created_by"`
	CreatedAt         time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (StockMovement) TableName() string { return "stock_movements" }

// Order -> table: orders
type Order struct {
	ID             int        `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderNo        string     `gorm:"size:50;uniqueIndex" json:"order_no"`
	TableID        *int       `gorm:"index" json:"table_id"`
	OrderType      string     `gorm:"size:30;default:dine_in;index" json:"order_type"`
	Status         string     `gorm:"size:30;default:open;index" json:"status"`
	Subtotal       float64    `gorm:"default:0.0" json:"subtotal"`
	DiscountAmount float64    `gorm:"default:0.0" json:"discount_amount"`
	DiscountRate   float64    `gorm:"default:0.0" json:"discount_rate"`
	DiscountReason *string    `gorm:"size:100" json:"discount_reason"`
	TreatAmount    float64    `gorm:"default:0.0" json:"treat_amount"`
	TreatReason    *string    `gorm:"size:100" json:"treat_reason"`
	KuverCount     int        `gorm:"default:0" json:"kuver_count"`
	KuverTotal     float64    `gorm:"default:0.0" json:"kuver_total"`
	ServiceCharge  float64    `gorm:"default:0.0" json:"service_charge"`
	TaxTotal       float64    `gorm:"default:0.0" json:"tax_total"`
	GrandTotal     float64    `gorm:"default:0.0" json:"grand_total"`
	PaidTotal      float64    `gorm:"default:0.0" json:"paid_total"`
	RemainingTotal float64    `gorm:"default:0.0" json:"remaining_total"`
	WaiterName     string     `gorm:"size:100;default:Garson" json:"waiter_name"`
	CashierName    *string    `gorm:"size:100" json:"cashier_name"`
	Notes          *string    `gorm:"type:text" json:"notes"`
	CreatedAt      time.Time  `gorm:"autoCreateTime;index" json:"created_at"`
	ClosedAt       *time.Time `gorm:"index" json:"closed_at"`

	Table    *Table      `gorm:"foreignKey:TableID" json:"table,omitempty"`
	Items    []OrderItem `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE" json:"items"`
	Payments []Payment   `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE" json:"payments"`
}

func (Order) TableName() string { return "orders" }

// OrderItem -> table: order_items
type OrderItem struct {
	ID                int           `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderID           int           `gorm:"not null;index" json:"order_id"`
	ProductID         int           `gorm:"not null;index" json:"product_id"`
	ProductName       string        `gorm:"size:150;not null" json:"product_name"`
	VariantName       *string       `gorm:"size:100" json:"variant_name"`
	UnitPrice         float64       `gorm:"not null" json:"unit_price"`
	Quantity          float64       `gorm:"default:1.0" json:"quantity"`
	TotalPrice        float64       `gorm:"not null" json:"total_price"`
	SelectedModifiers ModifierSlice `gorm:"type:jsonb;default:'[]'" json:"selected_modifiers"`
	NegativeModifiers StringSlice   `gorm:"type:jsonb;default:'[]'" json:"negative_modifiers"`
	KitchenNote       *string       `gorm:"size:255" json:"kitchen_note"`
	CourseStage       int           `gorm:"default:1" json:"course_stage"`
	IsHold            bool          `gorm:"default:false" json:"is_hold"`
	FiredAt           *time.Time    `json:"fired_at,omitempty"`
	Status            string        `gorm:"size:30;default:pending;index" json:"status"`
	Station           string        `gorm:"size:50;default:kitchen;index" json:"station"`
	AddedBy           string        `gorm:"size:100;default:Garson" json:"added_by"`
	CreatedAt         time.Time     `gorm:"autoCreateTime" json:"created_at"`
	ReadyAt           *time.Time    `json:"ready_at,omitempty"`
	ServedAt          *time.Time    `json:"served_at,omitempty"`
	IsVoided          bool          `gorm:"default:false;index" json:"is_voided"`
	VoidReason        *string       `gorm:"size:255" json:"void_reason"`
	VoidedBy          *string       `gorm:"size:100" json:"voided_by,omitempty"`
	IsTreat           bool          `gorm:"default:false" json:"is_treat"`
	DiscountAmount    float64       `gorm:"default:0.0" json:"discount_amount"`
	DiscountRate      float64       `gorm:"default:0.0" json:"discount_rate"`
	DiscountReason    *string       `gorm:"size:100" json:"discount_reason"`

	Order *Order `gorm:"foreignKey:OrderID" json:"-"`
}

func (OrderItem) TableName() string { return "order_items" }

// Payment -> table: payments
type Payment struct {
	ID             int       `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderID        int       `gorm:"not null;index" json:"order_id"`
	Amount         float64   `gorm:"not null" json:"amount"`
	PaymentMethod  string    `gorm:"size:50;not null;index" json:"method"`
	TipAmount      float64   `gorm:"default:0.0" json:"tip"`
	RoundingAmount float64   `gorm:"default:0.0" json:"rounding"`
	CashierName    string    `gorm:"size:100;default:Kasiyer" json:"cashier_name,omitempty"`
	ReceiptNo      *string   `gorm:"size:50" json:"receipt_no,omitempty"`
	CreatedAt      time.Time `gorm:"autoCreateTime;index" json:"created_at"`
	Notes          *string   `gorm:"type:text" json:"notes,omitempty"`
}

func (Payment) TableName() string { return "payments" }

// CashRegister -> table: cash_registers
type CashRegister struct {
	ID             int        `gorm:"primaryKey;autoIncrement" json:"id"`
	Status         string     `gorm:"size:30;default:open;index" json:"status"`
	OpeningFloat   float64    `gorm:"default:500.0" json:"opening_float"`
	TotalCash      float64    `gorm:"default:0.0" json:"total_cash"`
	TotalCard      float64    `gorm:"default:0.0" json:"total_card"`
	TotalSodexo    float64    `gorm:"default:0.0" json:"total_sodexo"`
	TotalMultinet  float64    `gorm:"default:0.0" json:"total_multinet"`
	TotalTicket    float64    `gorm:"default:0.0" json:"total_ticket"`
	TotalOther     float64    `gorm:"default:0.0" json:"total_other"`
	TotalExpenses  float64    `gorm:"default:0.0" json:"total_expenses"`
	TotalDiscounts float64    `gorm:"default:0.0" json:"total_discounts"`
	TotalTreats    float64    `gorm:"default:0.0" json:"total_treats"`
	TotalVat1      float64    `gorm:"column:total_vat_1;default:0.0" json:"total_vat_1"`
	TotalVat10     float64    `gorm:"column:total_vat_10;default:0.0" json:"total_vat_10"`
	TotalVat20     float64    `gorm:"column:total_vat_20;default:0.0" json:"total_vat_20"`
	TotalRevenue   float64    `gorm:"default:0.0" json:"total_revenue"`
	OpenedBy       string     `gorm:"size:100;default:Kasiyer" json:"opened_by"`
	ClosedBy       *string    `gorm:"size:100" json:"closed_by"`
	OpenedAt       time.Time  `gorm:"autoCreateTime;index" json:"opened_at"`
	ClosedAt       *time.Time `json:"closed_at"`
	ZReportNo      *string    `gorm:"size:50;index" json:"z_report_no"`
}

func (CashRegister) TableName() string { return "cash_registers" }

// CashExpense -> table: cash_expenses
type CashExpense struct {
	ID          int       `gorm:"primaryKey;autoIncrement" json:"id"`
	Category    string    `gorm:"size:100;not null" json:"category"`
	Amount      float64   `gorm:"not null" json:"amount"`
	ExpenseType string    `gorm:"size:20;default:out" json:"expense_type"`
	Description string    `gorm:"type:text;not null" json:"description"`
	CreatedBy   string    `gorm:"size:100;default:Kasiyer" json:"created_by"`
	CreatedAt   time.Time `gorm:"autoCreateTime;index" json:"created_at"`
}

func (CashExpense) TableName() string { return "cash_expenses" }

// Courier -> table: couriers
type Courier struct {
	ID                 int     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name               string  `gorm:"size:100;not null" json:"name"`
	Phone              string  `gorm:"size:20;not null" json:"phone"`
	VehiclePlate       *string `gorm:"size:20" json:"vehicle_plate"`
	IsActive           bool    `gorm:"default:true" json:"is_active"`
	CashCollected      float64 `gorm:"default:0.0" json:"cash_collected"`
	CardSlipsCollected float64 `gorm:"default:0.0" json:"card_slips_collected"`
}

func (Courier) TableName() string { return "couriers" }

// DeliveryOrder -> table: delivery_orders
type DeliveryOrder struct {
	ID              int        `gorm:"primaryKey;autoIncrement" json:"id"`
	OrderID         int        `gorm:"not null;index" json:"order_id"`
	Platform        string     `gorm:"size:50;default:phone" json:"platform"`
	PlatformOrderID *string    `gorm:"size:100" json:"platform_order_id"`
	CustomerName    string     `gorm:"size:100;not null" json:"customer_name"`
	CustomerPhone   string     `gorm:"size:20;not null;index" json:"customer_phone"`
	DeliveryAddress string     `gorm:"type:text;not null" json:"delivery_address"`
	AddressZone     *string    `gorm:"size:100" json:"address_zone"`
	CourierID       *int       `gorm:"index" json:"courier_id"`
	CourierStatus   string     `gorm:"size:50;default:unassigned" json:"courier_status"`
	DispatchedAt    *time.Time `json:"dispatched_at"`
	DeliveredAt     *time.Time `json:"delivered_at"`
	PaymentType     string     `gorm:"size:50;default:kapida_nakit" json:"payment_type"`
	Notes           *string    `gorm:"type:text" json:"notes"`

	Order   *Order   `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Courier *Courier `gorm:"foreignKey:CourierID" json:"courier,omitempty"`
}

func (DeliveryOrder) TableName() string { return "delivery_orders" }

// AuditLog -> table: audit_logs
type AuditLog struct {
	ID           int       `gorm:"primaryKey;autoIncrement" json:"id"`
	ActionType   string    `gorm:"size:50;not null;index" json:"action_type"`
	OperatorName string    `gorm:"size:100;not null" json:"operator_name"`
	OperatorRole string    `gorm:"size:50;default:waiter" json:"operator_role"`
	TargetRef    *string   `gorm:"size:100" json:"target_ref"`
	ReasonCode   *string   `gorm:"size:100" json:"reason_code"`
	ReasonText   *string   `gorm:"type:text" json:"reason_text"`
	Details      JSONMap   `gorm:"type:jsonb" json:"details"`
	Timestamp    time.Time `gorm:"autoCreateTime;index" json:"timestamp"`
}

func (AuditLog) TableName() string { return "audit_logs" }

// RestaurantSetting -> table: restaurant_settings
type RestaurantSetting struct {
	ID    int    `gorm:"primaryKey;autoIncrement" json:"id"`
	Key   string `gorm:"size:100;uniqueIndex;not null" json:"key"`
	Value string `gorm:"type:text;not null" json:"value"`
}

func (RestaurantSetting) TableName() string { return "restaurant_settings" }

// ============================================================================
// 2. MASTER SAAS VERİTABANI MODELLERİ (3 TABLO)
// ============================================================================

// RestaurantTenant -> table: restaurant_tenants
type RestaurantTenant struct {
	ID            int        `gorm:"primaryKey;autoIncrement" json:"id"`
	Code          string     `gorm:"size:50;uniqueIndex;not null" json:"code"`
	Name          string     `gorm:"size:150;not null" json:"name"`
	OwnerName     *string    `gorm:"size:100" json:"owner_name"`
	Phone         *string    `gorm:"size:50" json:"phone"`
	Email         *string    `gorm:"size:100" json:"email"`
	City          string     `gorm:"size:50;default:'İstanbul'" json:"city"`
	TaxNumber     *string    `gorm:"size:50" json:"tax_number"`
	TaxOffice     *string    `gorm:"size:100" json:"tax_office"`
	Address       *string    `gorm:"size:255" json:"address"`
	Plan          string     `gorm:"size:50;default:pro" json:"plan"`
	MonthlyPrice  float64    `gorm:"default:1490.0" json:"monthly_price"`
	BillingCycle  string     `gorm:"size:20;default:monthly" json:"billing_cycle"`
	Status        string     `gorm:"size:30;default:active;index" json:"status"`
	TrialEndsAt   *time.Time `json:"trial_ends_at"`
	RenewalDate   *time.Time `json:"renewal_date"`
	PaymentMethod string     `gorm:"size:50;default:credit_card" json:"payment_method"`
	PaymentStatus string     `gorm:"size:30;default:paid" json:"payment_status"`
	Notes         *string    `gorm:"type:text" json:"notes"`
	CreatedAt     time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt     time.Time  `gorm:"autoUpdateTime" json:"updated_at"`

	// R1 Feature Flags & Licensing
	FeatureQRMenu       bool   `gorm:"default:true" json:"feature_qr_menu"`
	FeatureKDS          bool   `gorm:"default:true" json:"feature_kds"`
	FeatureDelivery     bool   `gorm:"default:false" json:"feature_delivery"`
	FeatureIntegrations bool   `gorm:"default:false" json:"feature_integrations"`
	FeatureEInvoice     bool   `gorm:"default:false" json:"feature_e_invoice"`
	FeatureStockRecipe  bool   `gorm:"default:true" json:"feature_stock_recipe"`
	FeatureLoyalty      bool   `gorm:"default:false" json:"feature_loyalty"`
	FeatureHotel        bool   `gorm:"default:true" json:"feature_hotel"`
	FeatureKiosk        bool   `gorm:"default:true" json:"feature_kiosk"`
	FeatureReservations bool   `gorm:"default:true" json:"feature_reservations"`
	FeatureCostProfit   bool   `gorm:"default:true" json:"feature_cost_profit"`
	PlanCode            string `gorm:"size:50;default:pro" json:"plan_code"`

	// R3 Delinquency & Billing Status
	ReadOnlyMode     bool    `gorm:"default:false" json:"read_only_mode"`
	SuspensionReason *string `gorm:"size:255" json:"suspension_reason,omitempty"`

	// R4 Franchise & Multi-Branch Linking
	BrandID       *int    `gorm:"index" json:"brand_id,omitempty"`
	IsBrandMaster bool    `gorm:"default:false" json:"is_brand_master"`
	BranchCode    *string `gorm:"size:50" json:"branch_code,omitempty"`
	BranchName    *string `gorm:"size:100" json:"branch_name,omitempty"`
}

func (RestaurantTenant) TableName() string { return "restaurant_tenants" }

// TenantLead -> table: tenant_leads
type TenantLead struct {
	ID           int       `gorm:"primaryKey;autoIncrement" json:"id"`
	FullName     string    `gorm:"size:100;not null" json:"full_name"`
	Phone        string    `gorm:"size:50;not null" json:"phone"`
	CompanyName  string    `gorm:"size:150;not null" json:"company_name"`
	BusinessType string    `gorm:"size:50;default:restoran" json:"business_type"`
	City         string    `gorm:"size:50;default:'İstanbul'" json:"city"`
	Status       string    `gorm:"size:30;default:yeni;index" json:"status"`
	Notes        *string   `gorm:"type:text" json:"notes"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (TenantLead) TableName() string { return "tenant_leads" }

// TenantInvoice -> table: tenant_invoices
type TenantInvoice struct {
	ID                  int        `gorm:"primaryKey;autoIncrement" json:"id"`
	TenantID            int        `gorm:"not null;index" json:"tenant_id"`
	TenantCode          string     `gorm:"size:50;index" json:"tenant_code"`
	InvoiceNo           string     `gorm:"size:50;uniqueIndex;not null" json:"invoice_no"`
	TenantName          string     `gorm:"size:150;not null" json:"tenant_name"`
	Period              string     `gorm:"size:50;not null" json:"period"`
	Amount              float64    `gorm:"not null" json:"amount"`
	Subtotal            float64    `gorm:"default:0.0" json:"subtotal"`
	TaxAmount           float64    `gorm:"default:0.0" json:"tax_amount"`
	Plan                string     `gorm:"size:50;default:pro" json:"plan"`
	PaymentMethod       string     `gorm:"size:50;default:credit_card" json:"payment_method"`
	GatewayProvider     string     `gorm:"size:50;default:manual" json:"gateway_provider"`
	GatewayPaymentID    *string    `gorm:"size:100" json:"gateway_payment_id,omitempty"`
	Status              string     `gorm:"size:30;default:paid;index" json:"status"`
	DueDate             *time.Time `gorm:"index" json:"due_date,omitempty"`
	PaidAt              *time.Time `json:"paid_at,omitempty"`
	OverdueNoticeSent   bool       `gorm:"default:false" json:"overdue_notice_sent"`
	OverdueNoticeSentAt *time.Time `json:"overdue_notice_sent_at,omitempty"`
	CreatedAt           time.Time  `gorm:"autoCreateTime" json:"created_at"`
}

func (TenantInvoice) TableName() string { return "tenant_invoices" }

// ============================================================================
// MASTER SAAS EXPANSION MODELS (R1 - R7)
// ============================================================================

// SaaSPlan -> table: saas_plans (R1)
type SaaSPlan struct {
	ID              int         `gorm:"primaryKey;autoIncrement" json:"id"`
	Code            string      `gorm:"size:50;uniqueIndex;not null" json:"code"` // starter, pro, enterprise
	Name            string      `gorm:"size:100;not null" json:"name"`
	Description     string      `gorm:"type:text" json:"description"`
	PriceMonthly    float64     `gorm:"not null" json:"price_monthly"`
	PriceYearly     float64     `gorm:"not null" json:"price_yearly"`
	MaxDevices      int         `gorm:"default:3" json:"max_devices"`
	MaxBranches     int         `gorm:"default:1" json:"max_branches"`
	StorageQuotaMB  int         `gorm:"default:500" json:"storage_quota_mb"`
	IncludedModules StringSlice `gorm:"type:jsonb" json:"included_modules"`
	IsActive        bool        `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time   `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time   `gorm:"autoUpdateTime" json:"updated_at"`
}

func (SaaSPlan) TableName() string { return "saas_plans" }

// FleetHeartbeat -> table: fleet_heartbeats (R2)
type FleetHeartbeat struct {
	ID              int       `gorm:"primaryKey;autoIncrement" json:"id"`
	TenantCode      string    `gorm:"size:50;not null;index" json:"tenant_code"`
	DeviceID        string    `gorm:"size:100;not null;index" json:"device_id"`
	DeviceName      string    `gorm:"size:100;not null" json:"device_name"`
	DeviceType      string    `gorm:"size:50;not null;index" json:"device_type"` // tablet, handheld, kds, pos, kiosk
	IPAddress       string    `gorm:"size:50" json:"ip_address"`
	AppVersion      string    `gorm:"size:30" json:"app_version"`
	Status          string    `gorm:"size:30;default:online;index" json:"status"`
	LastHeartbeatAt time.Time `gorm:"index;not null" json:"last_heartbeat_at"`
	CreatedAt       time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (FleetHeartbeat) TableName() string { return "fleet_heartbeats" }

// TenantLiveMetric -> table: tenant_live_metrics (R2)
type TenantLiveMetric struct {
	TenantCode         string    `gorm:"size:50;primaryKey" json:"tenant_code"`
	TenantName         string    `gorm:"size:150;not null" json:"tenant_name"`
	IsOnline           bool      `gorm:"default:false;index" json:"is_online"`
	LastSeenAt         time.Time `gorm:"index" json:"last_seen_at"`
	ConnectedTablets   int       `gorm:"default:0" json:"connected_tablets"`
	ConnectedHandhelds int       `gorm:"default:0" json:"connected_handhelds"`
	ConnectedKDS       int       `gorm:"default:0" json:"connected_kds"`
	ActiveTablesCount  int       `gorm:"default:0" json:"active_tables_count"`
	ActiveOrdersCount  int       `gorm:"default:0" json:"active_orders_count"`
	TodayRevenue       float64   `gorm:"default:0.0" json:"today_revenue"`
	TodayOrdersCount   int       `gorm:"default:0" json:"today_orders_count"`
	UpdatedAt          time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (TenantLiveMetric) TableName() string { return "tenant_live_metrics" }

// VPOSConfig -> table: vpos_configs (R3)
type VPOSConfig struct {
	ID              int       `gorm:"primaryKey;autoIncrement" json:"id"`
	GatewayProvider string    `gorm:"size:50;not null;index" json:"gateway_provider"` // paytr, iyzico
	IsProduction    bool      `gorm:"default:false;index" json:"is_production"`
	MerchantID      string    `gorm:"size:100" json:"merchant_id"`
	APIKey          string    `gorm:"size:255" json:"api_key"`
	APISecret       string    `gorm:"size:255" json:"-"`
	MerchantSalt    string    `gorm:"size:255" json:"-"`
	CallbackURL     string    `gorm:"size:255" json:"callback_url"`
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	Notes           *string   `gorm:"type:text" json:"notes"`
	CreatedAt       time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (VPOSConfig) TableName() string { return "vpos_configs" }

// FranchiseBrand -> table: franchise_brands (R4)
type FranchiseBrand struct {
	ID                  int       `gorm:"primaryKey;autoIncrement" json:"id"`
	Code                string    `gorm:"size:50;uniqueIndex;not null" json:"code"`
	Name                string    `gorm:"size:150;not null" json:"name"`
	TaxNumber           *string   `gorm:"size:50" json:"tax_number"`
	TaxOffice           *string   `gorm:"size:100" json:"tax_office"`
	HeadquartersAddress *string   `gorm:"size:255" json:"headquarters_address"`
	ContactPerson       *string   `gorm:"size:100" json:"contact_person"`
	ContactPhone        *string   `gorm:"size:50" json:"contact_phone"`
	ContactEmail        *string   `gorm:"size:100" json:"contact_email"`
	PrimaryTenantCode   string    `gorm:"size:50" json:"primary_tenant_code"`
	Status              string    `gorm:"size:30;default:active;index" json:"status"`
	CreatedAt           time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt           time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (FranchiseBrand) TableName() string { return "franchise_brands" }

// MenuTemplate -> table: menu_templates (R4)
type MenuTemplate struct {
	ID               int       `gorm:"primaryKey;autoIncrement" json:"id"`
	BrandID          *int      `gorm:"index" json:"brand_id"`
	SourceTenantCode string    `gorm:"size:50;not null" json:"source_tenant_code"`
	Name             string    `gorm:"size:150;not null" json:"name"`
	Description      *string   `gorm:"type:text" json:"description"`
	CategoriesCount  int       `gorm:"default:0" json:"categories_count"`
	ProductsCount    int       `gorm:"default:0" json:"products_count"`
	TemplatePayload  string    `gorm:"type:text" json:"template_payload"`
	CreatedAt        time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt        time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

func (MenuTemplate) TableName() string { return "menu_templates" }

// MenuCloneHistory -> table: menu_clone_history (R4)
type MenuCloneHistory struct {
	ID               int       `gorm:"primaryKey;autoIncrement" json:"id"`
	BrandID          *int      `gorm:"index" json:"brand_id"`
	SourceTenantCode string    `gorm:"size:50;not null" json:"source_tenant_code"`
	TargetTenantCode string    `gorm:"size:50;not null;index" json:"target_tenant_code"`
	CategoriesCopied int       `gorm:"default:0" json:"categories_copied"`
	ProductsCopied   int       `gorm:"default:0" json:"products_copied"`
	ClonedBy         string    `gorm:"size:100;not null" json:"cloned_by"`
	Status           string    `gorm:"size:30;default:completed" json:"status"`
	ErrorMessage     *string   `gorm:"type:text" json:"error_message"`
	ClonedAt         time.Time `gorm:"autoCreateTime" json:"cloned_at"`
}

func (MenuCloneHistory) TableName() string { return "menu_clone_history" }

// BroadcastAnnouncement -> table: broadcast_announcements (R5)
type BroadcastAnnouncement struct {
	ID              int        `gorm:"primaryKey;autoIncrement" json:"id"`
	Title           string     `gorm:"size:200;not null" json:"title"`
	Content         string     `gorm:"type:text;not null" json:"content"`
	BannerType      string     `gorm:"size:50;default:info" json:"banner_type"`
	TargetType      string     `gorm:"size:50;default:all" json:"target_type"`
	TargetTenantIDs string     `gorm:"type:text;default:'[]'" json:"target_tenant_ids"`
	TargetPlans     string     `gorm:"type:text;default:'[]'" json:"target_plans"`
	ShowAsPopup     bool       `gorm:"default:false" json:"show_as_popup"`
	Dismissible     bool       `gorm:"default:true" json:"dismissible"`
	IsActive        bool       `gorm:"default:true;index" json:"is_active"`
	StartsAt        *time.Time `json:"starts_at"`
	ExpiresAt       *time.Time `gorm:"index" json:"expires_at"`
	SentBy          string     `gorm:"size:100;default:master_admin" json:"sent_by"`
	CreatedAt       time.Time  `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt       time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}

func (BroadcastAnnouncement) TableName() string { return "broadcast_announcements" }

// AnnouncementReceipt -> table: announcement_receipts (R5)
type AnnouncementReceipt struct {
	ID              int       `gorm:"primaryKey;autoIncrement" json:"id"`
	AnnouncementID  int       `gorm:"not null;index" json:"announcement_id"`
	TenantCode      string    `gorm:"size:50;not null;index" json:"tenant_code"`
	DismissedAt     time.Time `gorm:"autoCreateTime" json:"dismissed_at"`
	DismissedByUser string    `gorm:"size:100" json:"dismissed_by_user"`
}

func (AnnouncementReceipt) TableName() string { return "announcement_receipts" }

// SupportTicket -> table: support_tickets (R6)
type SupportTicket struct {
	ID              int        `gorm:"primaryKey;autoIncrement" json:"id"`
	TicketNumber    string     `gorm:"size:50;uniqueIndex;not null" json:"ticket_number"`
	TenantCode      string     `gorm:"size:50;not null;index" json:"tenant_code"`
	TenantName      string     `gorm:"size:150;not null" json:"tenant_name"`
	SubmittedByName string     `gorm:"size:100;not null" json:"submitted_by_name"`
	SubmittedByRole string     `gorm:"size:50;default:manager" json:"submitted_by_role"`
	Category        string     `gorm:"size:50;not null;index" json:"category"`
	Priority        string     `gorm:"size:30;default:normal;index" json:"priority"`
	Subject         string     `gorm:"size:200;not null" json:"subject"`
	Description     string     `gorm:"type:text;not null" json:"description"`
	AttachmentURL   *string    `gorm:"size:255" json:"attachment_url"`
	Status          string     `gorm:"size:30;default:new;index" json:"status"`
	AssignedTo      *string    `gorm:"size:100" json:"assigned_to"`
	ResolutionNotes *string    `gorm:"type:text" json:"resolution_notes"`
	ResolvedAt      *time.Time             `json:"resolved_at"`
	CreatedAt       time.Time              `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt       time.Time              `gorm:"autoUpdateTime" json:"updated_at"`
	Messages        []SupportTicketMessage `gorm:"foreignKey:TicketID" json:"messages,omitempty"`
}

func (SupportTicket) TableName() string { return "support_tickets" }

// SupportTicketMessage -> table: support_ticket_messages (R6)
type SupportTicketMessage struct {
	ID            int       `gorm:"primaryKey;autoIncrement" json:"id"`
	TicketID      int       `gorm:"not null;index" json:"ticket_id"`
	SenderType    string    `gorm:"size:50;not null" json:"sender_type"`
	SenderName    string    `gorm:"size:100;not null" json:"sender_name"`
	Message       string    `gorm:"type:text;not null" json:"message"`
	AttachmentURL *string   `gorm:"size:255" json:"attachment_url"`
	CreatedAt     time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (SupportTicketMessage) TableName() string { return "support_ticket_messages" }

// SupportTicketAuditLog -> table: support_ticket_audit_logs (R6)
type SupportTicketAuditLog struct {
	ID          int       `gorm:"primaryKey;autoIncrement" json:"id"`
	TicketID    int       `gorm:"not null;index" json:"ticket_id"`
	Action      string    `gorm:"size:50;not null" json:"action"`
	OldValue    *string   `gorm:"size:100" json:"old_value"`
	NewValue    *string   `gorm:"size:100" json:"new_value"`
	PerformedBy string    `gorm:"size:100;not null" json:"performed_by"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (SupportTicketAuditLog) TableName() string { return "support_ticket_audit_logs" }

// TenantBackup -> table: tenant_backups (R7)
type TenantBackup struct {
	ID             int        `gorm:"primaryKey;autoIncrement" json:"id"`
	TenantCode     string     `gorm:"size:50;not null;index" json:"tenant_code"`
	BackupName     string     `gorm:"size:150;not null" json:"backup_name"`
	FilePath       string     `gorm:"size:255;not null" json:"file_path"`
	FileSizeBytes  int64      `gorm:"not null" json:"file_size_bytes"`
	FileSizeMB     float64    `gorm:"not null" json:"file_size_mb"`
	ChecksumSHA256 *string    `gorm:"size:64" json:"checksum_sha256"`
	BackupType     string     `gorm:"size:50;default:manual" json:"backup_type"`
	Status         string     `gorm:"size:30;default:completed;index" json:"status"`
	CreatedBy      string     `gorm:"size:100;default:master_admin" json:"created_by"`
	CreatedAt      time.Time  `gorm:"autoCreateTime;index" json:"created_at"`
	RestoredAt     *time.Time `json:"restored_at"`
}

func (TenantBackup) TableName() string { return "tenant_backups" }

// TenantStorageQuota -> table: tenant_storage_quotas (R7)
type TenantStorageQuota struct {
	ID               int       `gorm:"primaryKey;autoIncrement" json:"id"`
	TenantCode       string    `gorm:"size:50;uniqueIndex;not null" json:"tenant_code"`
	AllocatedQuotaMB int       `gorm:"default:1024" json:"allocated_quota_mb"`
	UsedDBBytes      int64     `gorm:"default:0" json:"used_db_bytes"`
	UsedMediaBytes   int64     `gorm:"default:0" json:"used_media_bytes"`
	TotalUsedMB      float64   `gorm:"default:0.0" json:"total_used_mb"`
	UsagePercentage  float64   `gorm:"default:0.0" json:"usage_percentage"`
	IsQuotaExceeded  bool      `gorm:"default:false;index" json:"is_quota_exceeded"`
	LastCalculatedAt time.Time `gorm:"autoUpdateTime" json:"last_calculated_at"`
}

func (TenantStorageQuota) TableName() string { return "tenant_storage_quotas" }

