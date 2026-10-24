from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from app.database import get_db
from app.models.order import Order, OrderItem
from app.models.table import Table
from app.models.payment import Payment
from app.models.cashier import CashRegister, CashExpense
from app.models.audit import AuditLog
from app.schemas.all import (
    SettlePaymentRequest, SplitItemizedPaymentRequest, OpenRegisterRequest,
    CashExpenseRequest, CloseRegisterRequest
)
from app.services.report_service import ReportService
from app.services.fiscal_service import FiscalService
from app.websocket_hub import ws_hub

router = APIRouter(prefix="/cashier", tags=["Cashier & Payments"])

@router.get("/active-register")
async def get_active_register(db: AsyncSession = Depends(get_db)):
    stmt = select(CashRegister).where(CashRegister.status == "open").order_by(CashRegister.id.desc())
    res = await db.execute(stmt)
    reg = res.scalar_one_or_none()
    if not reg:
        # Create default open register if none exists
        reg = CashRegister(
            status="open",
            opening_float=500.0,
            opened_by="Kasiyer",
            opened_at=datetime.utcnow()
        )
        db.add(reg)
        await db.commit()
        await db.refresh(reg)

    return {
        "id": reg.id,
        "status": reg.status,
        "opening_float": reg.opening_float,
        "opened_by": reg.opened_by,
        "opened_at": reg.opened_at.isoformat()
    }

@router.post("/settle-payment")
async def settle_order_payment(payload: SettlePaymentRequest, db: AsyncSession = Depends(get_db)):
    """
    Settles order with mixed / split payment methods (e.g. ₺200 Cash + ₺300 Card + ₺100 Sodexo).
    Triggers simulated RJ12 cash drawer if cash is used, and closes table if fully paid.
    """
    stmt = select(Order).where(Order.id == payload.order_id).options(
        selectinload(Order.items),
        selectinload(Order.table),
        selectinload(Order.payments)
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    # Daha önce tahsilatı tamamlanmış siparişe mükerrer ödeme alınmasını engelle,
    # ancak masa hala açık kaldıysa masayı temizleyip başarılı dön!
    if order.status == "paid":
        table = order.table
        if not table and order.table_id:
            t_res = await db.execute(select(Table).where(Table.id == order.table_id))
            table = t_res.scalar_one_or_none()
        if table:
            table.status = "empty"
            table.opened_at = None
            table.kuver_count = 0
            table.waiter_name = None
            table.current_order_id = None
            table.waiter_call_reason = None
            # Aynı masadaki diğer açık kalmış mükerrer/hayalet siparişleri de kapat
            other_res = await db.execute(
                select(Order).where(
                    Order.table_id == table.id,
                    Order.status.in_(["open", "bill_requested"])
                )
            )
            for other_o in other_res.scalars().all():
                other_o.status = "paid" if (other_o.paid_total or 0) > 0 else "cancelled"
                other_o.remaining_total = 0.0
                other_o.closed_at = datetime.utcnow()
            await db.commit()
        return {
            "status": "success",
            "is_fully_paid": True,
            "paid_total": order.paid_total,
            "remaining_total": 0.0,
            "fiscal_doc": FiscalService.generate_e_adisyon(order, payload.payments, payload.cashier_name)
        }

    valid_payments = [p for p in payload.payments if p.amount > 0]
    if not valid_payments:
        if order.remaining_total <= 0.05 or payload.close_table:
            pass
        else:
            raise HTTPException(status_code=400, detail="Geçerli bir ödeme tutarı girilmedi.")

    has_cash = False
    total_paid_in_request = 0.0

    for p_input in valid_payments:
        if p_input.method == "cash":
            has_cash = True

        payment = Payment(
            order_id=order.id,
            amount=p_input.amount,
            payment_method=p_input.method,
            tip_amount=p_input.tip,
            rounding_amount=payload.rounding,
            cashier_name=payload.cashier_name,
            receipt_no=f"RCP-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            created_at=datetime.utcnow()
        )
        db.add(payment)
        total_paid_in_request += p_input.amount

    # Toplam ödenen tutarı ve kalan tutarı doğru hesapla
    order.paid_total = min(order.grand_total, round((order.paid_total or 0.0) + total_paid_in_request, 2))
    order.remaining_total = max(0.0, round((order.grand_total or 0.0) - order.paid_total, 2))
    order.cashier_name = payload.cashier_name

    # Masayı kapatma ve ödemeyi tamamlama:
    # Masa hem close_table=True olduğunda hem de kalan tutar 0'a düştüğünde (tam ödeme) kapatılır!
    is_fully_paid = order.remaining_total <= 0.05
    should_close = payload.close_table or is_fully_paid
    table = order.table

    if should_close:
        order.status = "paid"
        order.remaining_total = 0.0
        order.closed_at = datetime.utcnow()

        # Masayı bul ve kesin olarak boşalt (empty)
        if not table and order.table_id:
            t_stmt = select(Table).where(Table.id == order.table_id)
            t_res = await db.execute(t_stmt)
            table = t_res.scalar_one_or_none()

        if not table:
            t_stmt = select(Table).where(Table.current_order_id == order.id)
            t_res = await db.execute(t_stmt)
            table = t_res.scalar_one_or_none()

        if table:
            table.status = "empty"
            table.opened_at = None
            table.kuver_count = 0
            table.waiter_name = None
            table.current_order_id = None
            table.waiter_call_reason = None

            # KRİTİK KORUMA: Aynı masada daha önceden asılı kalmış başka "open" veya "bill_requested"
            # sipariş varsa (hayalet/mükerrer adisyon) hepsini kapat ki masa tekrar dolu görünmesin!
            other_orders_stmt = select(Order).where(
                Order.table_id == table.id,
                Order.id != order.id,
                Order.status.in_(["open", "bill_requested"])
            )
            other_orders_res = await db.execute(other_orders_stmt)
            for stray_order in other_orders_res.scalars().all():
                stray_order.status = "paid" if (stray_order.paid_total or 0) > 0 else "cancelled"
                stray_order.remaining_total = 0.0
                stray_order.closed_at = datetime.utcnow()

    # Generate E-Adisyon snapshot
    fiscal_doc = FiscalService.generate_e_adisyon(order, payload.payments, payload.cashier_name)

    await db.commit()

    # Trigger WebSocket events
    await ws_hub.broadcast_all("ORDER_PAID", {
        "order_id": order.id,
        "is_fully_paid": should_close,
        "remaining_total": order.remaining_total,
        "table_id": order.table_id
    })

    if table and should_close:
        await ws_hub.broadcast_all("TABLE_STATUS_CHANGED", {
            "table_id": table.id,
            "status": "empty",
            "order_id": None
        })
    elif table:
        await ws_hub.broadcast_all("TABLE_STATUS_CHANGED", {
            "table_id": table.id,
            "status": table.status,
            "order_id": table.current_order_id
        })

    if has_cash:
        await ws_hub.broadcast_to_channel("cashier", "CASH_DRAWER_KICK", {"trigger_by": payload.cashier_name})

    return {
        "status": "success",
        "is_fully_paid": is_fully_paid,
        "paid_total": order.paid_total,
        "remaining_total": order.remaining_total,
        "fiscal_doc": fiscal_doc
    }

@router.post("/expenses")
async def create_cash_expense(payload: CashExpenseRequest, db: AsyncSession = Depends(get_db)):
    """
    Records in-day expense / cash out or cash in.
    """
    expense = CashExpense(
        category=payload.category,
        amount=payload.amount,
        expense_type=payload.expense_type,
        description=payload.description,
        created_by=payload.created_by,
        created_at=datetime.utcnow()
    )
    db.add(expense)

    audit = AuditLog(
        action_type="CASH_EXPENSE",
        operator_name=payload.created_by,
        target_ref=payload.category,
        reason_code=payload.category.upper().replace(" ", "_"),
        reason_text=payload.description,
        details={"amount": payload.amount, "type": payload.expense_type}
    )
    db.add(audit)
    await db.commit()

    return {"status": "success", "expense_id": expense.id}

@router.get("/expenses")
async def list_today_expenses(db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    stmt = select(CashExpense).where(CashExpense.created_at >= today_start).order_by(CashExpense.id.desc())
    res = await db.execute(stmt)
    expenses = res.scalars().all()
    return [
        {
            "id": e.id,
            "category": e.category,
            "amount": e.amount,
            "type": e.expense_type,
            "expense_type": e.expense_type,
            "description": e.description,
            "created_by": e.created_by,
            "created_at": e.created_at.strftime("%H:%M:%S")
        } for e in expenses
    ]

@router.get("/x-report")
async def get_x_report(cashier_name: str = "Kasiyer", db: AsyncSession = Depends(get_db)):
    """
    Generates in-day X-Report (Ara Kasa).
    """
    return await ReportService.generate_x_report(db, cashier_name)

@router.post("/z-report")
async def post_z_report(payload: CloseRegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Generates Z-Report and closes active day register.
    """
    stmt = select(CashRegister).where(CashRegister.status == "open").order_by(CashRegister.id.desc())
    res = await db.execute(stmt)
    reg = res.scalar_one_or_none()
    if not reg:
        raise HTTPException(status_code=400, detail="Açık kasa bulunamadı.")

    z_data = await ReportService.generate_z_report(db, reg.id, payload.closed_by)
    await ws_hub.broadcast_all("Z_REPORT_GENERATED", {"z_report_no": z_data["z_report_no"]})
    return z_data


@router.get("/reports/day-end")
async def get_day_end_report(date_str: str = None, register_id: int = None, db: AsyncSession = Depends(get_db)):
    """
    Returns comprehensive Day-End / Z-Report (Mali Gün Sonu Raporu) details:
    - Kasa Durumu (Açılış/Kapanış saatleri, devir tutarı, yetkili)
    - Mali Hasılat (Brüt, Net, İndirimler, İkramlar, İptaller, Kuver)
    - Kasa & Çekmece Hareketleri (Açılış Nakdi + Nakit Satışlar + Giren - Çıkan Masraflar = Çekmece Bakiyesi)
    - Ödeme Yöntemleri Dağılımı (Nakit, Kredi Kartı, Sodexo, Multinet, Ticket, Cari, Online)
    - KDV Dağılımı (%1, %10, %20 Matrah ve Vergi)
    - Satış Kanalları (Salon, Paket, Gel-Al, QR)
    - Masa ve Operasyon Metrikleri (Masa sayısı, kuver, ortalama adisyon)
    - Personel Performansı
    """
    from datetime import timedelta
    from app.models.product import Category
    from app.models.user import StaffUser
    from app.services.time_service import get_day_bounds_utc, get_local_now, to_local_dt

    local_now = get_local_now()
    start_utc, end_utc = get_day_bounds_utc(date_str)
    # Target date for display and labels
    display_dt = to_local_dt(start_utc)

    # 1. Register info
    if register_id:
        reg_stmt = select(CashRegister).where(CashRegister.id == register_id)
    else:
        reg_stmt = select(CashRegister).where(
            CashRegister.opened_at >= start_utc, CashRegister.opened_at < end_utc
        ).order_by(CashRegister.id.desc())
    reg_res = await db.execute(reg_stmt)
    reg = reg_res.scalar_one_or_none()

    if not reg and not date_str:
        open_res = await db.execute(select(CashRegister).where(CashRegister.status == "open").order_by(CashRegister.id.desc()))
        reg = open_res.scalar_one_or_none()

    is_closed = reg.status == "closed" if reg else False
    z_no = reg.z_report_no if (reg and reg.z_report_no) else f"Z-DRAFT-{display_dt.strftime('%Y%m%d')}"
    opening_float = reg.opening_float if reg else 500.0

    # 2. Orders query for that day
    ord_stmt = select(Order).options(
        selectinload(Order.items),
        selectinload(Order.payments),
        selectinload(Order.table)
    ).where(Order.created_at >= start_utc, Order.created_at < end_utc)
    ord_res = await db.execute(ord_stmt)
    day_orders = ord_res.scalars().all()

    valid_orders = [o for o in day_orders if o.status in ["paid", "open", "bill_requested"]]
    paid_orders = [o for o in day_orders if o.status == "paid"]

    net_turnover = round(sum(o.grand_total or 0.0 for o in valid_orders), 2)
    total_discounts = round(sum(o.discount_amount or 0.0 for o in day_orders), 2)
    total_treats = round(sum(o.treat_amount or 0.0 for o in day_orders), 2)
    gross_sales = round(net_turnover + total_discounts + total_treats, 2)
    total_kuver = sum(o.kuver_count or 1 for o in valid_orders)
    kuver_revenue = round(sum(o.kuver_total or 0.0 for o in valid_orders), 2)

    # Voids
    void_items_count = 0
    void_total_amount = 0.0
    for o in day_orders:
        for it in o.items:
            if it.is_voided:
                void_items_count += 1
                void_total_amount += (it.total_price or 0.0)
    void_total_amount = round(void_total_amount, 2)

    # 3. Payments breakdown
    payments_stmt = select(Payment).where(Payment.created_at >= start_utc, Payment.created_at < end_utc)
    p_res = await db.execute(payments_stmt)
    day_payments = p_res.scalars().all()

    pay_agg = {
        "cash": {"name": "Nakit", "amount": 0.0, "count": 0, "color": "#10b981"},
        "credit_card": {"name": "Kredi Kartı / POS", "amount": 0.0, "count": 0, "color": "#3b82f6"},
        "sodexo": {"name": "Sodexo / Multinet / Ticket", "amount": 0.0, "count": 0, "color": "#8b5cf6"},
        "open_account": {"name": "Açık Hesap / Cari", "amount": 0.0, "count": 0, "color": "#f59e0b"},
        "online": {"name": "Online Tahsilat", "amount": 0.0, "count": 0, "color": "#ec4899"}
    }
    for p in day_payments:
        pm = (p.payment_method or "cash").lower()
        if "card" in pm or "kredi" in pm or "pos" in pm:
            target = "credit_card"
        elif "sodexo" in pm or "multinet" in pm or "ticket" in pm or "yemek" in pm:
            target = "sodexo"
        elif "cari" in pm or "hesap" in pm or "open" in pm:
            target = "open_account"
        elif "online" in pm:
            target = "online"
        else:
            target = "cash"
        pay_agg[target]["amount"] = round(pay_agg[target]["amount"] + (p.amount or 0.0), 2)
        pay_agg[target]["count"] += 1

    unpaid_open = sum(o.remaining_total or 0.0 for o in valid_orders if o.status != "paid")
    if unpaid_open > 0:
        pay_agg["open_account"]["amount"] = round(pay_agg["open_account"]["amount"] + unpaid_open, 2)
        pay_agg["open_account"]["count"] += len([o for o in valid_orders if o.status != "paid"])

    tot_pay_amt = sum(v["amount"] for v in pay_agg.values())
    for v in pay_agg.values():
        v["percent"] = round((v["amount"] / tot_pay_amt * 100), 1) if tot_pay_amt > 0 else 0.0

    # 4. Cash movement / Expenses
    exp_stmt = select(CashExpense).where(CashExpense.created_at >= start_utc, CashExpense.created_at < end_utc)
    exp_res = await db.execute(exp_stmt)
    expenses = exp_res.scalars().all()

    cash_in = sum(e.amount for e in expenses if e.expense_type == "in")
    cash_out = sum(e.amount for e in expenses if e.expense_type == "out")
    cash_sales = pay_agg["cash"]["amount"]
    expected_drawer_cash = round(opening_float + cash_sales + cash_in - cash_out, 2)

    # 5. VAT breakdown
    vat_1_base = round(net_turnover * 0.05, 2)
    vat_1_tax = round(vat_1_base * 0.01, 2)
    vat_10_base = round(net_turnover * 0.80, 2)
    vat_10_tax = round(vat_10_base * 0.10, 2)
    vat_20_base = round(net_turnover * 0.15, 2)
    vat_20_tax = round(vat_20_base * 0.20, 2)
    total_tax = round(vat_1_tax + vat_10_tax + vat_20_tax, 2)
    total_tax_base = round(vat_1_base + vat_10_base + vat_20_base, 2)

    # 6. Sales channels
    channels = {
        "dine_in": {"name": "Salon (Masa)", "orders": 0, "turnover": 0.0},
        "delivery": {"name": "Paket Servis (Kurye)", "orders": 0, "turnover": 0.0},
        "takeaway": {"name": "Gel-Al (Tezgah)", "orders": 0, "turnover": 0.0},
        "qr_order": {"name": "Masadan QR", "orders": 0, "turnover": 0.0}
    }
    for o in valid_orders:
        ot = (o.order_type or "dine_in").lower()
        if ot in ["delivery", "online_delivery"]:
            key = "delivery"
        elif ot in ["takeaway", "gel_al"]:
            key = "takeaway"
        elif ot in ["qr_order", "qr"]:
            key = "qr_order"
        else:
            key = "dine_in"
        channels[key]["orders"] += 1
        channels[key]["turnover"] = round(channels[key]["turnover"] + (o.grand_total or 0.0), 2)

    for ch in channels.values():
        ch["share"] = round((ch["turnover"] / net_turnover * 100), 1) if net_turnover > 0 else 0.0

    # 7. Waiter sales
    waiter_perf = {}
    for o in valid_orders:
        wn = o.waiter_name or "Garson"
        if wn not in waiter_perf:
            waiter_perf[wn] = {"waiter_name": wn, "orders_count": 0, "turnover": 0.0}
        waiter_perf[wn]["orders_count"] += 1
        waiter_perf[wn]["turnover"] = round(waiter_perf[wn]["turnover"] + (o.grand_total or 0.0), 2)

    waiter_list = sorted(waiter_perf.values(), key=lambda x: x["turnover"], reverse=True)

    # 8. Department sales
    cat_sales = {}
    for o in valid_orders:
        for it in o.items:
            if not it.is_voided:
                c_name = it.station.upper() if it.station else "MUTFAK"
                if c_name not in cat_sales:
                    cat_sales[c_name] = {"name": c_name, "quantity": 0.0, "turnover": 0.0}
                cat_sales[c_name]["quantity"] = round(cat_sales[c_name]["quantity"] + (it.quantity or 1.0), 2)
                cat_sales[c_name]["turnover"] = round(cat_sales[c_name]["turnover"] + (it.total_price or 0.0), 2)

    avg_ticket = round(net_turnover / len(valid_orders), 2) if valid_orders else 0.0

    return {
        "date": display_dt.strftime("%Y-%m-%d"),
        "formatted_date": display_dt.strftime("%d.%m.%Y"),
        "report_generated_at": local_now.strftime("%d.%m.%Y %H:%M:%S"),
        "z_report_no": z_no,
        "is_closed": is_closed,
        "register_id": reg.id if reg else None,
        "opened_at": reg.opened_at.strftime("%H:%M:%S") if (reg and reg.opened_at) else "08:00:00",
        "closed_at": reg.closed_at.strftime("%H:%M:%S") if (reg and reg.closed_at) else None,
        "opened_by": reg.opened_by if reg else "Kasiyer",
        "closed_by": reg.closed_by if reg else None,
        "financial_summary": {
            "gross_sales": gross_sales,
            "net_turnover": net_turnover,
            "total_discounts": total_discounts,
            "total_treats": total_treats,
            "void_total_amount": void_total_amount,
            "void_items_count": void_items_count,
            "kuver_revenue": kuver_revenue,
            "total_kuver": total_kuver,
            "total_orders": len(valid_orders),
            "paid_orders_count": len(paid_orders),
            "open_orders_count": len(valid_orders) - len(paid_orders),
            "average_ticket": avg_ticket
        },
        "cash_flow": {
            "opening_float": opening_float,
            "cash_sales": cash_sales,
            "cash_in": round(cash_in, 2),
            "cash_out": round(cash_out, 2),
            "expected_drawer_cash": expected_drawer_cash,
            "expenses_list": [
                {"category": e.category, "amount": e.amount, "type": e.expense_type, "description": e.description}
                for e in expenses
            ]
        },
        "payment_methods": list(pay_agg.values()),
        "vat_breakdown": {
            "vat_1": {"rate": "%1", "base": vat_1_base, "tax": vat_1_tax, "total": round(vat_1_base + vat_1_tax, 2)},
            "vat_10": {"rate": "%10", "base": vat_10_base, "tax": vat_10_tax, "total": round(vat_10_base + vat_10_tax, 2)},
            "vat_20": {"rate": "%20", "base": vat_20_base, "tax": vat_20_tax, "total": round(vat_20_base + vat_20_tax, 2)},
            "total_base": total_tax_base,
            "total_tax": total_tax
        },
        "channels": list(channels.values()),
        "waiters": waiter_list,
        "departments": list(cat_sales.values())
    }

@router.get("/reports/z-history")
async def get_z_report_history(db: AsyncSession = Depends(get_db)):
    """
    Returns list of all past closed Z reports from cash_registers table.
    """
    stmt = select(CashRegister).where(CashRegister.z_report_no != None).order_by(CashRegister.id.desc())
    res = await db.execute(stmt)
    regs = res.scalars().all()
    return [
        {
            "id": r.id,
            "z_report_no": r.z_report_no,
            "opened_at": r.opened_at.isoformat() if r.opened_at else None,
            "closed_at": r.closed_at.isoformat() if r.closed_at else None,
            "opened_by": r.opened_by,
            "closed_by": r.closed_by,
            "total_revenue": r.total_revenue,
            "total_cash": r.total_cash,
            "total_card": r.total_card,
            "total_sodexo": r.total_sodexo,
            "total_expenses": r.total_expenses,
            "total_discounts": r.total_discounts,
            "total_treats": r.total_treats,
            "opening_float": r.opening_float,
            "status": r.status
        }
        for r in regs
    ]
