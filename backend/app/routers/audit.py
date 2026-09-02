from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.audit import AuditLog

router = APIRouter(prefix="/audit", tags=["Security & Audit Trail"])

@router.get("/logs")
async def get_audit_logs(
    action_type: str = Query(None),
    limit: int = Query(100),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns immutable audit trail logs with operator names, mandatory reason codes, and timestamps.
    """
    stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)
    if action_type:
        stmt = stmt.where(AuditLog.action_type == action_type)

    res = await db.execute(stmt)
    logs = res.scalars().all()

    return [
        {
            "id": l.id,
            "action_type": l.action_type,
            "operator_name": l.operator_name,
            "operator_role": l.operator_role,
            "target_ref": l.target_ref,
            "reason_code": l.reason_code,
            "reason_text": l.reason_text,
            "details": l.details,
            "timestamp": l.timestamp.strftime("%d.%m.%Y %H:%M:%S")
        } for l in logs
    ]
