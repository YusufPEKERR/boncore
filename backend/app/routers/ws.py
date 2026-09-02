import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.websocket_hub import ws_hub

logger = logging.getLogger("boncore.ws_router")
router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/{channel}")
async def websocket_channel_endpoint(websocket: WebSocket, channel: str):
    """
    Subscribes client to specific channel ('pos', 'kds', 'waiter', 'cashier', 'delivery', 'all').
    """
    await ws_hub.connect(websocket, channel=channel)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming ping / messages if needed
    except WebSocketDisconnect:
        ws_hub.disconnect(websocket, channel=channel)
    except Exception as e:
        logger.warning(f"WebSocket connection error on channel {channel}: {e}")
        ws_hub.disconnect(websocket, channel=channel)

@router.websocket("/ws/table/{table_id}")
async def websocket_table_endpoint(websocket: WebSocket, table_id: int):
    """
    Subscribes customer mobile QR client to their specific table updates.
    """
    await ws_hub.connect(websocket, channel="pos", table_id=table_id)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_hub.disconnect(websocket, channel="pos", table_id=table_id)
    except Exception as e:
        logger.warning(f"WebSocket table error: {e}")
        ws_hub.disconnect(websocket, channel="pos", table_id=table_id)
