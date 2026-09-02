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

    order.paid_total += total_paid_in_request
    order.remaining_total = max(0.0, order.grand_total - order.paid_total)
    order.cashier_name = payload.cashier_name

    # If fully paid or close table requested
    is_fully_paid = order.remaining_total <= 0.05
    if is_fully_paid and payload.close_table:
        order.status = "paid"
        order.closed_at = datetime.utcnow()

        if order.table:
            order.table.status = "empty"
            order.table.opened_at = None
            order.table.kuver_count = 0
            order.table.waiter_name = None
            order.table.current_order_id = None
            order.table.waiter_call_reason = None

    # Generate E-Adisyon snapshot
    fiscal_doc = FiscalService.generate_e_adisyon(order, payload.payments, payload.cashier_name)

    await db.commit()

    # Trigger events
    await ws_hub.broadcast_all("ORDER_PAID", {
        "order_id": order.id,
        "is_fully_paid": is_fully_paid,
        "remaining_total": order.remaining_total,
        "table_id": order.table_id
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
