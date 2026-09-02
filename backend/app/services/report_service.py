import datetime
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.models.payment import Payment
from app.models.cashier import CashExpense, CashRegister
from app.models.order import Order, OrderItem
from app.models.audit import AuditLog

class ReportService:
    @staticmethod
    async def generate_x_report(db: AsyncSession, cashier_name: str = "Kasiyer") -> Dict[str, Any]:
        """
        Generates in-day X-Report (Ara Kasa Denetim Raporu).
        """
        now = datetime.datetime.now()
        today_start = datetime.datetime(now.year, now.month, now.day, 0, 0, 0)

        # Total payments by method
        pay_stmt = select(
            Payment.payment_method,
            func.sum(Payment.amount).label("total_amount"),
            func.count(Payment.id).label("count")
        ).where(Payment.created_at >= today_start).group_by(Payment.payment_method)

        pay_res = await db.execute(pay_stmt)
        payment_breakdown = {}
        total_revenue = 0.0

        for row in pay_res.all():
            method = row[0]
            amount = float(row[1] or 0.0)
            cnt = int(row[2] or 0)
            payment_breakdown[method] = {"amount": amount, "count": cnt}
            total_revenue += amount

        # Expenses
        exp_stmt = select(
            CashExpense.expense_type,
            func.sum(CashExpense.amount).label("total_amount")
        ).where(CashExpense.created_at >= today_start).group_by(CashExpense.expense_type)
        exp_res = await db.execute(exp_stmt)
        total_expenses = 0.0
        for row in exp_res.all():
            if row[0] == "out":
                total_expenses += float(row[1] or 0.0)

        # Discounts and Treats
        disc_stmt = select(
            func.sum(Order.discount_amount),
            func.sum(Order.treat_amount),
            func.count(Order.id)
        ).where(Order.created_at >= today_start, Order.status == "paid")
        disc_res = await db.execute(disc_stmt)
        disc_row = disc_res.first()
        total_discounts = float(disc_row[0] or 0.0) if disc_row else 0.0
        total_treats = float(disc_row[1] or 0.0) if disc_row else 0.0
        total_orders = int(disc_row[2] or 0) if disc_row else 0

        # Voids count
        void_stmt = select(func.count(AuditLog.id)).where(
            AuditLog.action_type == "VOID_ITEM",
            AuditLog.timestamp >= today_start
        )
        void_res = await db.execute(void_stmt)
        void_count = void_res.scalar_one_or_none() or 0

        return {
            "report_type": "X_REPORT",
            "title": "ARA KASA DENETIM RAPORU (X-RAPORU)",
            "date": now.strftime("%d.%m.%Y %H:%M:%S"),
            "cashier_name": cashier_name,
            "total_orders": total_orders,
            "total_revenue": total_revenue,
            "payment_breakdown": payment_breakdown,
            "cash_in_drawer": (payment_breakdown.get("cash", {}).get("amount", 0.0) + 500.0) - total_expenses,
            "total_expenses": total_expenses,
            "total_discounts": total_discounts,
            "total_treats": total_treats,
            "void_count": void_count,
            "vat_summary": {
                "vat_1": round(total_revenue * 0.01, 2),
                "vat_10": round(total_revenue * 0.10, 2),
                "vat_20": round(total_revenue * 0.20, 2),
            }
        }

    @staticmethod
    async def generate_z_report(db: AsyncSession, register_id: int, cashier_name: str = "Müdür") -> Dict[str, Any]:
        """
        Generates official Day-End Z-Report and closes the active cash register.
        """
        x_data = await ReportService.generate_x_report(db, cashier_name)
        now = datetime.datetime.now()
        z_no = f"Z-{now.strftime('%Y%m%d')}-{register_id:04d}"

        # Update CashRegister in DB
        reg_stmt = select(CashRegister).where(CashRegister.id == register_id)
        reg_res = await db.execute(reg_stmt)
        reg = reg_res.scalar_one_or_none()

        if reg:
            reg.status = "closed"
            reg.closed_at = now
            reg.closed_by = cashier_name
            reg.z_report_no = z_no
            reg.total_revenue = x_data["total_revenue"]
            reg.total_cash = x_data["payment_breakdown"].get("cash", {}).get("amount", 0.0)
            reg.total_card = x_data["payment_breakdown"].get("credit_card", {}).get("amount", 0.0)
            reg.total_sodexo = x_data["payment_breakdown"].get("sodexo", {}).get("amount", 0.0)
            reg.total_multinet = x_data["payment_breakdown"].get("multinet", {}).get("amount", 0.0)
            reg.total_expenses = x_data["total_expenses"]
            reg.total_discounts = x_data["total_discounts"]
            reg.total_treats = x_data["total_treats"]
            await db.commit()

        # Audit log entry
        audit = AuditLog(
            action_type="Z_REPORT",
            operator_name=cashier_name,
            operator_role="manager",
            target_ref=z_no,
            reason_code="GUN_SONU_KAPANIS",
            reason_text="Kasa gün sonu Z raporu başarıyla alındı ve kasa kapatıldı.",
            details={"revenue": x_data["total_revenue"], "z_no": z_no}
        )
        db.add(audit)
        await db.commit()

        x_data["report_type"] = "Z_REPORT"
        x_data["title"] = f"MALI GUN SONU KAPANIS RAPORU ({z_no})"
        x_data["z_report_no"] = z_no
        return x_data
