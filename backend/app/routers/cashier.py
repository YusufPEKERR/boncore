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

    # Daha önce tahsilatı tamamlanmış siparişe mükerrer ödeme alınmasını engelle
    if order.status == "paid":
        raise HTTPException(status_code=400, detail="Bu adisyonun tahsilatı zaten tamamlanmış ve masa kapatılmıştır.")

    has_cash = False
    total_paid_in_request = 0.0

    for p_input in payload.payments:
        if p_input.amount <= 0:
            continue
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
    order.paid_total = min(order.grand_total, round(order.paid_total + total_paid_in_request, 2))
    order.remaining_total = max(0.0, round(order.grand_total - order.paid_total, 2))
    order.cashier_name = payload.cashier_name

    # Masayı kapatma ve ödemeyi tamamlama:
    # Masa SADECE payload.close_table True olduğunda kapatılır (Öde ve Kapat / Öde Yazdır ve Kapat)
    is_fully_paid = order.remaining_total <= 0.05
    table = order.table

    if payload.close_table:
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
    elif is_fully_paid:
        # Tutar tamamen ödendi ancak masayı kapat emri verilmedi
        order.status = "paid"
        order.remaining_total = 0.0
        order.closed_at = datetime.utcnow()

    # Generate E-Adisyon snapshot
    fiscal_doc = FiscalService.generate_e_adisyon(order, payload.payments, payload.cashier_name)

    await db.commit()

    # Trigger WebSocket events
    await ws_hub.broadcast_all("ORDER_PAID", {
        "order_id": order.id,
        "is_fully_paid": is_fully_paid or payload.close_table,
        "remaining_total": order.remaining_total,
        "table_id": order.table_id
    })

    if table and (is_fully_paid or payload.close_table):
        await ws_hub.broadcast_all("TABLE_STATUS_CHANGED", {
            "table_id": table.id,
            "status": "empty",
            "order_id": None
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
