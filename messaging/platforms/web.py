"""Web socket messaging platform integration."""

import asyncio
import uuid
from collections.abc import Awaitable
from typing import Any

from fastapi import WebSocket
from loguru import logger

from ..models import IncomingMessage
from .ports import InboundMessageHandler, MessagingRuntime, OutboundMessenger


class WebConnectionManager:
    """Manages active websocket connections for chat."""

    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, chat_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[chat_id] = websocket

    def disconnect(self, chat_id: str) -> None:
        self.active_connections.pop(chat_id, None)

    async def send_message(self, chat_id: str, data: dict[str, Any]) -> None:
        if chat_id in self.active_connections:
            try:
                await self.active_connections[chat_id].send_json(data)
            except Exception as e:
                logger.error(f"Error sending to websocket {chat_id}: {e}")


web_manager = WebConnectionManager()


class WebOutboundMessenger(OutboundMessenger):
    """Sends messaging workflow updates down to the websocket clients."""

    async def queue_send_message(
        self,
        chat_id: str,
        text: str,
        reply_to: str | None = None,
        parse_mode: str | None = None,
        fire_and_forget: bool = True,
        message_thread_id: str | None = None,
    ) -> str | None:
        msg_id = str(uuid.uuid4())
        await web_manager.send_message(
            chat_id,
            {
                "type": "message",
                "id": msg_id,
                "text": text,
            },
        )
        return msg_id

    async def queue_edit_message(
        self,
        chat_id: str,
        message_id: str,
        text: str,
        parse_mode: str | None = None,
        fire_and_forget: bool = True,
    ) -> None:
        await web_manager.send_message(
            chat_id,
            {
                "type": "edit",
                "id": message_id,
                "text": text,
            },
        )

    async def queue_delete_message(
        self,
        chat_id: str,
        message_id: str,
        fire_and_forget: bool = True,
    ) -> None:
        await web_manager.send_message(
            chat_id,
            {
                "type": "delete",
                "id": message_id,
            },
        )

    async def queue_delete_messages(
        self,
        chat_id: str,
        message_ids: list[str],
        fire_and_forget: bool = True,
    ) -> None:
        for mid in message_ids:
            await self.queue_delete_message(chat_id, mid, fire_and_forget)

    def fire_and_forget(self, task: Awaitable[Any]) -> None:
        if asyncio.iscoroutine(task):
            asyncio.create_task(task)
        else:
            asyncio.ensure_future(task)


class WebRuntime(MessagingRuntime):
    """Runtime for web socket messaging."""

    def __init__(self) -> None:
        self._outbound = WebOutboundMessenger()
        self._handler: InboundMessageHandler | None = None

    @property
    def name(self) -> str:
        return "web"

    @property
    def outbound(self) -> OutboundMessenger:
        return self._outbound

    async def start(self) -> None:
        logger.info("Web messaging runtime started.")

    async def stop(self) -> None:
        logger.info("Web messaging runtime stopped.")

    def on_message(self, handler: InboundMessageHandler) -> None:
        self._handler = handler

    @property
    def is_connected(self) -> bool:
        return True

    async def trigger_message(self, chat_id: str, text: str) -> None:
        """Route an incoming message from the websocket to the workflow."""
        try:
            print(f"[DEBUG] trigger_message called with {text}", flush=True)
            if self._handler:
                print("[DEBUG] Handler is set, creating IncomingMessage...", flush=True)
                msg = IncomingMessage(
                    text=text,
                    chat_id=chat_id,
                    user_id="web_user",
                    message_id=str(uuid.uuid4()),
                    platform="web",
                )
                print("[DEBUG] Awaiting handler...", flush=True)
                await self._handler(msg)
            else:
                logger.warning("No handler registered for incoming web messages.")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            import traceback

            traceback.print_exc()


# Global instance
web_runtime_instance = WebRuntime()
