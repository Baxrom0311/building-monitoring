from pydantic import BaseModel, Field

from .enums import ChatProvider, ChatRole


class ChatHistoryMessage(BaseModel):
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=20)
    provider: ChatProvider = ChatProvider.gemini
