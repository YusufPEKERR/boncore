from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.order import Order
from app.services.fiscal_service import FiscalService

router = APIRouter(prefix="/fiscal", tags=["Fiscal & E-Adisyon"])

@router.get("/e-adisyon/{order_id}")
async def get_e_adisyon_document(order_id: int, db: AsyncSession = Depends(get_db)):
    """
    Returns official GİB E-Adisyon document with ETTN, QR string, and line item details.
    """
    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.items),
        selectinload(Order.table),
        selectinload(Order.payments)
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    doc = FiscalService.generate_e_adisyon(order, order.payments, order.cashier_name or "Kasiyer")
    return doc

@router.get("/e-adisyon/{order_id}/xml")
async def download_e_adisyon_xml(order_id: int, db: AsyncSession = Depends(get_db)):
    """
    Downloads official GİB XML compliant E-Adisyon file.
    """
    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.items),
        selectinload(Order.table),
        selectinload(Order.payments)
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    doc = FiscalService.generate_e_adisyon(order, order.payments, order.cashier_name or "Kasiyer")
    xml_data = doc["xml_content"]

    return Response(
        content=xml_data,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename=E-Adisyon-{doc['ettn']}.xml"}
    )

@router.get("/receipt/{order_id}/escpos")
async def get_escpos_thermal_slip(order_id: int, db: AsyncSession = Depends(get_db)):
    """
    Returns formatted 80mm ESC/POS thermal text printer slip.
    """
    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.items),
        selectinload(Order.table)
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    slip_text = FiscalService.generate_escpos_thermal_slip(order)
    return {"order_id": order.id, "slip_text": slip_text}
