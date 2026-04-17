from typing import Optional, List
from pydantic import BaseModel, Field


class AgentConfig(BaseModel):
    """
    Configuration for interacting with an LLM.
    """

    endpoint: str = Field(
        default="https://api.openai.com/v1/chat/completions",
    )

    model: str = Field(
        default="gpt-4o-mini",
    )

    max_tokens: int = Field(
        default=512,
    )

    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
    )

    top_p: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
    )

    stop: Optional[List[str]] = Field(
        default=None,
    )

    system_prompt: str = Field(
        default="You are a helpful model and you give great advice for users based on the data you're provided with.",
    )
