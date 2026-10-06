from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.chat import Chat, ChatEntry


class ChatBusyError(Exception):
    """A turn is already running in this conversation."""


class DuplicateTurnError(Exception):
    """This request was already saved; reload history instead of generating twice."""


class ChatRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user_id: UUID, title: str = "New chat") -> Chat:
        chat = Chat(user_id=user_id, title=title.strip()[:120] or "New chat")
        self.session.add(chat)
        try:
            await self.session.commit()
            await self.session.refresh(chat)
        except Exception:
            await self.session.rollback()
            raise
        return chat

    async def get_user_all_chats(self, user_id: UUID) -> list[Chat]:
        result = await self.session.scalars(
            select(Chat).where(Chat.user_id == user_id).order_by(Chat.updated_at.desc(), Chat.id)
        )
        return list(result)

    async def get_chat(self, user_id: UUID, chat_id: UUID, *, lock: bool = False) -> Chat | None:
        query = select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
        return await self.session.scalar(query.with_for_update() if lock else query)

    async def get_messages(self, user_id: UUID, chat_id: UUID) -> list[ChatEntry] | None:
        if await self.get_chat(user_id, chat_id) is None:
            return None
        result = await self.session.scalars(
            select(ChatEntry).where(ChatEntry.chat_id == chat_id).order_by(ChatEntry.position)
        )
        return list(result)

    async def recover_expired_turns(self, user_id: UUID, chat_id: UUID) -> None:
        """Generations are limited to five minutes; ten-minute rows are abandoned."""
        await self.session.execute(
            update(ChatEntry)
            .where(
                ChatEntry.chat_id == chat_id,
                ChatEntry.chat_id.in_(select(Chat.id).where(Chat.user_id == user_id)),
                ChatEntry.status == "streaming",
                ChatEntry.created_at < func.now() - timedelta(minutes=10),
            )
            .values(status="interrupted")
        )

    async def begin_turn(
        self,
        user_id: UUID,
        chat_id: UUID,
        request_id: UUID,
        content: str,
        provider: str,
        model: str,
    ) -> ChatEntry:
        """Atomically save the user message and an assistant placeholder before streaming."""
        if not content.strip():
            raise ValueError("Message cannot be empty.")
        try:
            chat = await self.session.scalar(
                select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id).with_for_update()
            )
            if chat is None:
                raise LookupError("Conversation not found.")
            await self.recover_expired_turns(user_id, chat_id)
            duplicate = await self.session.scalar(
                select(ChatEntry.id)
                .where(ChatEntry.chat_id == chat_id, ChatEntry.request_id == request_id)
                .limit(1)
            )
            if duplicate:
                raise DuplicateTurnError("Request already saved. Reload the conversation.")
            active = await self.session.scalar(
                select(ChatEntry.id)
                .where(ChatEntry.chat_id == chat_id, ChatEntry.status == "streaming")
                .limit(1)
            )
            if active:
                raise ChatBusyError("An answer is already being generated.")
            last = await self.session.scalar(
                select(func.max(ChatEntry.position)).where(ChatEntry.chat_id == chat_id)
            )
            position = (last or 0) + 1
            self.session.add(
                ChatEntry(
                    chat_id=chat_id,
                    request_id=request_id,
                    position=position,
                    role="user",
                    content=content,
                    status="complete",
                )
            )
            assistant = ChatEntry(
                chat_id=chat_id,
                request_id=request_id,
                position=position + 1,
                role="assistant",
                content="",
                status="streaming",
                provider=provider,
                model=model,
            )
            self.session.add(assistant)
            if last is None:
                chat.title = " ".join(content.split())[:120]
            chat.updated_at = func.now()
            await self.session.commit()
            await self.session.refresh(assistant)
            return assistant
        except Exception:
            await self.session.rollback()
            raise

    async def finish_turn(
        self,
        user_id: UUID,
        chat_id: UUID,
        message_id: UUID,
        content: str,
        status: str,
        citations: list[dict] | None = None,
    ) -> None:
        if status not in {"complete", "interrupted", "error"}:
            raise ValueError("Invalid final message status.")
        try:
            chat = await self.session.scalar(
                select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id).with_for_update()
            )
            if chat is None:
                raise LookupError("Conversation not found.")
            message = await self.session.scalar(
                select(ChatEntry).where(
                    ChatEntry.id == message_id,
                    ChatEntry.chat_id == chat_id,
                    ChatEntry.role == "assistant",
                )
            )
            if message is None:
                raise LookupError("Message not found.")
            if message.status != "streaming":
                raise ChatBusyError("This generation has already been finalized.")
            message.content = content
            message.status = status
            message.citations = citations or []
            chat.updated_at = func.now()
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
