import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("boncore.ws")

class WebSocketHub:
    def __init__(self):
        # Channel subscribers
        self.channels: Dict[str, Set[WebSocket]] = {
            "pos": set(),
            "kds": set(),
            "cashier": set(),
            "waiter": set(),
            "delivery": set(),
            "all": set(),
        }
        self.table_channels: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str = "pos", table_id: int = None):
        await websocket.accept()
        if channel in self.channels:
            self.channels[channel].add(websocket)
        self.channels["all"].add(websocket)
        
        if table_id is not None:
            if table_id not in self.table_channels:
                self.table_channels[table_id] = set()
            self.table_channels[table_id].add(websocket)
            
        logger.info(f"WebSocket connected to channel: {channel} (table: {table_id})")

    def disconnect(self, websocket: WebSocket, channel: str = "pos", table_id: int = None):
        if channel in self.channels and websocket in self.channels[channel]:
            self.channels[channel].remove(websocket)
        if websocket in self.channels["all"]:
            self.channels["all"].remove(websocket)
            
        if table_id is not None and table_id in self.table_channels:
            if websocket in self.table_channels[table_id]:
                self.table_channels[table_id].remove(websocket)
                if not self.table_channels[table_id]:
                    del self.table_channels[table_id]
                    
        logger.info(f"WebSocket disconnected from channel: {channel}")

    async def broadcast_to_channel(self, channel: str, message_type: str, data: dict):
        payload = json.dumps({"type": message_type, "data": data, "timestamp": str(__import__('datetime').datetime.now())})
        target_sockets = self.channels.get(channel, set()) | self.channels["all"]
        dead_sockets = set()
        
        for ws in target_sockets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.add(ws)
                
        for dead in dead_sockets:
            for ch in self.channels.values():
                ch.discard(dead)

    async def broadcast_to_table(self, table_id: int, message_type: str, data: dict):
        if table_id not in self.table_channels:
            return
        payload = json.dumps({"type": message_type, "data": data, "table_id": table_id})
        dead_sockets = set()
        for ws in self.table_channels[table_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.add(ws)
        for dead in dead_sockets:
            self.table_channels[table_id].discard(dead)

    async def broadcast_all(self, message_type: str, data: dict):
        await self.broadcast_to_channel("all", message_type, data)

ws_hub = WebSocketHub()
