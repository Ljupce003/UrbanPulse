"""
Handles all interaction with an LLM for extracting variables and relations from text.
"""
from abc import ABC, abstractmethod

from backend.ml.recommendations.services.config import AgentConfig


class BaseAgent(ABC):

    def __init__(self, config: AgentConfig):
        self.config = config

    @abstractmethod
    def query_llm(self, prompt: str) -> str:
        """
        Send the prompt to the LLM and return raw string output.
        Must be implemented by each concrete LLM extractor.
        """
        pass
