package models

import "encoding/json"

// ============================================================================
// STANDART HATA & DURUM YANITLARI (FastAPI %100 Uyumlu)
// ============================================================================

// FastAPIErrorResponse matches `(await res.json()).detail` expected by frontend/src/services/api.ts
type FastAPIErrorResponse struct {
	Detail string `json:"detail"`
}

type StatusMessageResponse struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// ============================================================================
// 1. AUTH & STAFF DTOs
// ============================================================================

type PinAuthRequest struct {
	PinCode string `json:"pin_code"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Remember bool   `json:"remember"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type StaffUserResponse struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Role        string  `json:"role"`
	IsActive    bool    `json:"is_active"`
	Username    *string `json:"username"`
	AccessToken *string `json:"access_token,omitempty"`
	LastLoginAt *string `json:"last_login_at,omitempty"`
	CreatedAt   *string `json:"created_at,omitempty"`
	PinCode     *string `json:"pin_code,omitempty"`
}

type StaffUserCreate struct {
	Name     string  `json:"name"`
	FullName string  `json:"full_name,omitempty"` // Fallback alias
	Username *string `json:"username"`
	Password *string `json:"password"`
	Role     string  `json:"role"`
	PinCode  string  `json:"pin_code"`
	IsActive *bool   `json:"is_active"`
}

func (s *StaffUserCreate) ResolvedName() string {
	if s.Name != "" {
		return s.Name
	}
	return s.FullName
}

type StaffUserUpdate struct {
	Name     *string `json:"name"`
	Username *string `json:"username"`
	Password *string `json:"password"`
	Role     *string `json:"role"`
	PinCode  *string `json:"pin_code"`
	IsActive *bool   `json:"is_active"`
}

// ============================================================================
// 2. TABLES & FLOOR DTOs
// ============================================================================

type AreaCreate struct {
	Name       string `json:"name"`
	OrderIndex *int   `json:"order_index"`
}

type AreaReorderRequest struct {
	AreaIDs []int `json:"area_ids"`
}

type TableCreateSchema struct {
	AreaID     int     `json:"area_id"`
	Name       string  `json:"name"`
	Seats      *int    `json:"seats"`
	Shape      *string `json:"shape"`
	OrderIndex *int    `json:"order_index"`
}

type TableUpdateSchema struct {
	AreaID     *int    `json:"area_id"`
	Name       *string `json:"name"`
	Seats      *int    `json:"seats"`
	Shape      *string `json:"shape"`
	OrderIndex *int    `json:"order_index"`
}

type TableReorderRequest struct {
	AreaID   *int  `json:"area_id"`
	TableIDs []int `json:"table_ids"`
}

type TableBulkCreateSchema struct {
	AreaID   int    `json:"area_id"`
	Prefix   string `json:"prefix"`
	StartNum int    `json:"start_num"`
	Count    int    `json:"count"`
	Seats    int    `json:"seats"`
	Shape    string `json:"shape"`
}

type TablePositionUpdate struct {
	ID         int      `json:"id"`
	X          float64  `json:"x"`
	Y          float64  `json:"y"`
	Width      *float64 `json:"width"`
	Height     *float64 `json:"height"`
	Shape      *string  `json:"shape"`
	OrderIndex *int     `json:"order_index"`
}

type TableMoveRequest struct {
	SourceTableID int    `json:"source_table_id"`
	TargetTableID int    `json:"target_table_id"`
	OperatorName  string `json:"operator_name"`
}

type TableMergeRequest struct {
	SourceTableID int    `json:"source_table_id"`
	TargetTableID int    `json:"target_table_id"`
	OperatorName  string `json:"operator_name"`
}

type TableItemTransferRequest struct {
	SourceTableID int    `json:"source_table_id"`
	TargetTableID int    `json:"target_table_id"`
	OrderItemIDs  []int  `json:"order_item_ids"`
	OperatorName  string `json:"operator_name"`
}

type TableKuverRequest struct {
	KuverCount   int    `json:"kuver_count"`
	OperatorName string `json:"operator_name"`
}

type WaiterCallRequest struct {
	Reason string `json:"reason"`
}

type ActiveOrderSummaryDTO struct {
	ID             int     `json:"id"`
	OrderNo        string  `json:"order_no"`
	Status         string  `json:"status"`
	GrandTotal     float64 `json:"grand_total"`
	PaidTotal      float64 `json:"paid_total"`
	RemainingTotal float64 `json:"remaining_total"`
	Subtotal       float64 `json:"subtotal"`
	DiscountAmount float64 `json:"discount_amount"`
	KuverCount     int     `json:"kuver_count"`
	WaiterName     string  `json:"waiter_name"`
	ItemsCount     int     `json:"items_count"`
	CreatedAt      *string `json:"created_at"`
}

type TableWithActiveOrderDTO struct {
	ID               int                    `json:"id"`
	AreaID           int                    `json:"area_id"`
	Name             string                 `json:"name"`
	Shape            string                 `json:"shape"`
	OrderIndex       int                    `json:"order_index"`
	X                float64                `json:"x"`
	Y                float64                `json:"y"`
	Width            float64                `json:"width"`
	Height           float64                `json:"height"`
	Seats            int                    `json:"seats"`
	Status           string                 `json:"status"`
	OpenedAt         *string                `json:"opened_at"`
	DurationMinutes  int                    `json:"duration_minutes"`
	KuverCount       int                    `json:"kuver_count"`
	WaiterName       *string                `json:"waiter_name"`
	ReservationName  *string                `json:"reservation_name"`
	ReservationTime  *string                `json:"reservation_time"`
	WaiterCallReason *string                `json:"waiter_call_reason"`
	IsMergedTo       *int                   `json:"is_merged_to"`
	ActiveOrder      *ActiveOrderSummaryDTO `json:"active_order"`
}

type AreaWithTablesDTO struct {
	ID         int                       `json:"id"`
	Name       string                    `json:"name"`
	OrderIndex int                       `json:"order_index"`
	Tables     []TableWithActiveOrderDTO `json:"tables"`
}

// ============================================================================
// 3. PRODUCTS, CATEGORIES & MENU DTOs
// ============================================================================

type RecipeBOMItemDTO struct {
	IngredientID    int     `json:"ingredient_id"`
	IngredientName  string  `json:"ingredient_name"`
	Amount          float64 `json:"amount"`
	Unit            string  `json:"unit"`
	CurrentStock    float64 `json:"current_stock"`
	ProducibleCount int     `json:"producible_count"`
}

type ProductMenuDTO struct {
	ID                 int                `json:"id"`
	CategoryID         int                `json:"category_id"`
	Name               string             `json:"name"`
	Description        *string            `json:"description"`
	BasePrice          float64            `json:"base_price"`
	PluCode            *string            `json:"plu_code"`
	Barcode            *string            `json:"barcode"`
	VatRate            float64            `json:"vat_rate"`
	Station            string             `json:"station"`
	OrderIndex         int                `json:"order_index"`
	Unit               string             `json:"unit"`
	StockQuantity      float64            `json:"stock_quantity"`
	HasRecipe          bool               `json:"has_recipe"`
	RecipeItems        []RecipeBOMItemDTO `json:"recipe_items"`
	MissingIngredients []RecipeBOMItemDTO `json:"missing_ingredients"`
	ImageURL           *string            `json:"image_url"`
	Calories           *int               `json:"calories"`
	Allergens          []string           `json:"allergens"`
	IsVegan            bool               `json:"is_vegan"`
	IsSpicy            bool               `json:"is_spicy"`
	AllowNegativeStock bool               `json:"allow_negative_stock"`
	IsAvailable        bool               `json:"is_available"`
	ShowInPos          bool               `json:"show_in_pos"`
	Variants           []ProductVariant   `json:"variants"`
	ModifierGroups     []ModifierGroup    `json:"modifier_groups"`
}

type CategoryWithProductsDTO struct {
	ID            int              `json:"id"`
	Name          string           `json:"name"`
	Icon          string           `json:"icon"`
	Color         string           `json:"color"`
	OrderIndex    int              `json:"order_index"`
	TargetStation string           `json:"target_station"`
	ShowInPos     bool             `json:"show_in_pos"`
	Products      []ProductMenuDTO `json:"products"`
}

// ============================================================================
// 4. ORDERS, DISCOUNTS, TREATS & KDS DTOs
// ============================================================================

type SelectedModifier struct {
	Group string  `json:"group"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
}

type OrderItemInput struct {
	ProductID         int                `json:"product_id"`
	VariantName       *string            `json:"variant_name"`
	UnitPrice         *float64           `json:"unit_price"`
	Quantity          float64            `json:"quantity"`
	SelectedModifiers []SelectedModifier `json:"selected_modifiers"`
	NegativeModifiers []string           `json:"negative_modifiers"`
	KitchenNote       *string            `json:"kitchen_note"`
	CourseStage       int                `json:"course_stage"`
	IsHold            bool               `json:"is_hold"`
	AddedBy           *string            `json:"added_by"`
}

type CreateOrderRequest struct {
	TableID       *int             `json:"table_id"`
	OrderType     string           `json:"order_type"`
	Items         []OrderItemInput `json:"items"`
	WaiterName    string           `json:"waiter_name"`
	Notes         *string          `json:"notes"`
	KuverCount    *int             `json:"kuver_count"`
	ServiceCharge *float64         `json:"service_charge"`
}

type AddItemsRequest struct {
	Items      []OrderItemInput `json:"items"`
	WaiterName string           `json:"waiter_name"`
}

type HoldFireToggleRequest struct {
	OrderItemIDs []int  `json:"order_item_ids"`
	Action       string `json:"action"` // "fire" or "hold"
}

type VoidItemRequest struct {
	OrderItemID  int     `json:"order_item_id"`
	ReasonCode   string  `json:"reason_code"`
	ReasonText   *string `json:"reason_text"`
	OperatorName string  `json:"operator_name"`
	ManagerPin   *string `json:"manager_pin"`
}

type CancelOrderRequest struct {
	OperatorName string  `json:"operator_name"`
	ReasonCode   string  `json:"reason_code"`
	ReasonText   string  `json:"reason_text"`
	ManagerPin   *string `json:"manager_pin"`
}

type ApplyDiscountRequest struct {
	DiscountType string  `json:"discount_type"` // "percentage" or "fixed"
	Value        float64 `json:"value"`
	Reason       string  `json:"reason"`
	OperatorName string  `json:"operator_name"`
	ManagerPin   *string `json:"manager_pin"`
}

type ApplyItemDiscountRequest struct {
	DiscountType string  `json:"discount_type"`
	Value        float64 `json:"value"`
	Reason       string  `json:"reason"`
	OperatorName string  `json:"operator_name"`
	ManagerPin   *string `json:"manager_pin"`
}

type BatchItemDiscountRequest struct {
	ItemIDs      []int   `json:"item_ids"`
	DiscountType string  `json:"discount_type"`
	Value        float64 `json:"value"`
	Reason       string  `json:"reason"`
	OperatorName string  `json:"operator_name"`
	ManagerPin   *string `json:"manager_pin"`
}

type ApplyTreatRequest struct {
	OrderItemIDs []int   `json:"order_item_ids"`
	Reason       string  `json:"reason"`
	OperatorName string  `json:"operator_name"`
	ManagerPin   *string `json:"manager_pin"`
}

// ============================================================================
// 5. PAYMENTS & CASHIER DTOs
// ============================================================================

type SinglePaymentItem struct {
	Method        string  `json:"method"`
	PaymentMethod string  `json:"payment_method,omitempty"`
	Amount        float64 `json:"amount"`
	Tip           float64 `json:"tip"`
}

func (s *SinglePaymentItem) ResolvedMethod() string {
	if s.Method != "" {
		return s.Method
	}
	if s.PaymentMethod != "" {
		return s.PaymentMethod
	}
	return "cash"
}

type SettlePaymentRequest struct {
	OrderID     int                 `json:"order_id"`
	Payments    []SinglePaymentItem `json:"payments"`
	Rounding    float64             `json:"rounding"`
	CashierName string              `json:"cashier_name"`
	CloseTable  *bool               `json:"close_table"`
}

type SplitEqualRequest struct {
	OrderID     int `json:"order_id"`
	PersonCount int `json:"person_count"`
}

type SplitItemizedPaymentRequest struct {
	OrderID         int                 `json:"order_id"`
	SelectedItemIDs []int               `json:"selected_item_ids"`
	Payments        []SinglePaymentItem `json:"payments"`
	CashierName     string              `json:"cashier_name"`
}

type OpenRegisterRequest struct {
	OpeningFloat float64 `json:"opening_float"`
	OpenedBy     string  `json:"opened_by"`
}

type CashExpenseRequest struct {
	Category    string  `json:"category"`
	Amount      float64 `json:"amount"`
	ExpenseType string  `json:"expense_type"`
	Description string  `json:"description"`
	CreatedBy   string  `json:"created_by"`
}

type CloseRegisterRequest struct {
	ClosedBy   string  `json:"closed_by"`
	ManagerPin *string `json:"manager_pin"`
	ForceClose bool    `json:"force_close"`
}

// ============================================================================
// 6. INVENTORY & DELIVERY DTOs (with Pydantic alias support)
// ============================================================================

type StockTransferRequest struct {
	IngredientID      int     `json:"ingredient_id"`
	SourceWarehouseID int     `json:"source_warehouse_id"`
	FromWarehouseID   int     `json:"from_warehouse_id,omitempty"`
	TargetWarehouseID int     `json:"target_warehouse_id"`
	ToWarehouseID     int     `json:"to_warehouse_id,omitempty"`
	Amount            float64 `json:"amount"`
	Quantity          float64 `json:"quantity,omitempty"`
	Notes             *string `json:"notes"`
	CreatedBy         string  `json:"created_by"`
}

func (s *StockTransferRequest) NormalizeAliases() {
	if s.Amount == 0 && s.Quantity != 0 {
		s.Amount = s.Quantity
	}
	if s.SourceWarehouseID == 0 && s.FromWarehouseID != 0 {
		s.SourceWarehouseID = s.FromWarehouseID
	}
	if s.TargetWarehouseID == 0 && s.ToWarehouseID != 0 {
		s.TargetWarehouseID = s.ToWarehouseID
	}
	if s.CreatedBy == "" {
		s.CreatedBy = "Müdür"
	}
}

type PurchaseInvoiceItem struct {
	IngredientID      int      `json:"ingredient_id"`
	Quantity          float64  `json:"quantity"`
	UnitPrice         *float64 `json:"unit_price"`
	UnitCost          *float64 `json:"unit_cost"`
	TargetWarehouseID int      `json:"target_warehouse_id"`
}

func (p *PurchaseInvoiceItem) ResolvedUnitPrice() float64 {
	if p.UnitPrice != nil {
		return *p.UnitPrice
	}
	if p.UnitCost != nil {
		return *p.UnitCost
	}
	return 0.0
}

type PurchaseInvoiceRequest struct {
	SupplierName  *string               `json:"supplier_name"`
	SupplierTitle *string               `json:"supplier_title"`
	InvoiceNo     string                `json:"invoice_no"`
	Items         []PurchaseInvoiceItem `json:"items"`
	CreatedBy     string                `json:"created_by"`
	WarehouseID   *int                  `json:"warehouse_id"`
}

func (p *PurchaseInvoiceRequest) ResolvedSupplier() string {
	if p.SupplierName != nil && *p.SupplierName != "" {
		return *p.SupplierName
	}
	if p.SupplierTitle != nil && *p.SupplierTitle != "" {
		return *p.SupplierTitle
	}
	return "Tedarikçi"
}

type AssignCourierRequest struct {
	DeliveryOrderID int `json:"delivery_order_id"`
	CourierID       int `json:"courier_id"`
}

type CourierMutabakatRequest struct {
	CourierID     int     `json:"courier_id"`
	CollectedCash float64 `json:"collected_cash"`
	CollectedCard float64 `json:"collected_card"`
	CashierName   string  `json:"cashier_name"`
}

type OnlineOrderItem struct {
	ProductID   *int     `json:"product_id"`
	Name        *string  `json:"name"`
	ProductName *string  `json:"product_name"`
	UnitPrice   float64  `json:"unit_price"`
	Quantity    float64  `json:"quantity"`
	TotalPrice  *float64 `json:"total_price"`
	KitchenNote *string  `json:"kitchen_note"`
}

type OnlineOrderIngestRequest struct {
	Platform        *string           `json:"platform"`
	Channel         *string           `json:"channel"`
	CustomerName    string            `json:"customer_name"`
	CustomerPhone   string            `json:"customer_phone"`
	DeliveryAddress string            `json:"delivery_address"`
	Items           []OnlineOrderItem `json:"items"`
	PaymentType     string            `json:"payment_type"`
	Notes           *string           `json:"notes"`
}

// ============================================================================
// 7. WEBSOCKET MESSAGE ENVELOPES
// ============================================================================

type WSChannelEnvelope struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp string      `json:"timestamp"`
}

type WSTableEnvelope struct {
	Type    string      `json:"type"`
	Data    interface{} `json:"data"`
	TableID int         `json:"table_id"`
}

// MarshalJSONBytes helper for zero-allocation / fast serialization
func MustMarshalJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}
