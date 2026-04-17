"""
Handles all interaction with an LLM for classification tasks,
using OpenAI's GPT-4o model via API with JSON-compatible output.
"""

import logging
import os

from backend.ml.recommendations.services.base_agent import BaseAgent
from backend.ml.recommendations.services.config import AgentConfig

try:
    import colorlog

    handler = colorlog.StreamHandler()
    handler.setFormatter(colorlog.ColoredFormatter(
        '%(log_color)s%(levelname)s:%(name)s:%(message)s',
        log_colors={
            'INFO': 'green',
            'WARNING': 'yellow',
            'ERROR': 'red',
            'CRITICAL': 'bold_red',
        }
    ))
    logger = colorlog.getLogger(__name__)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
except ImportError:
    logger = logging.getLogger(__name__)
    logging.basicConfig(level=logging.INFO)

from openai import OpenAI
from dotenv import load_dotenv


load_dotenv()
logger.info("Initializing LLM Agent...")


class LLMAgent(BaseAgent):
    """
    Concrete LLM agent for classification tasks using GPT-4o.
    """

    def __init__(self, config: AgentConfig):
        super().__init__(config)
        self.config = config

        token = os.getenv("OPENAI_API_KEY")
        self.client = OpenAI(api_key=token)

    def query_llm(self, prompt: str) -> str:
        """
        prompt: The prompt to be sent to the AI agent, contains information about AQI,
        temperature and traffic.
        Query the LLM with a classification prompt and return the model output.
        """
        try:
            response = self.client.chat.completions.create(
                model=self.config.model,
                messages=[
                    {"role": "system", "content": self.config.system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
                top_p=self.config.top_p,
            )

            content = response.choices[0].message.content.strip()
            logger.info(f"Model response: {content}")
            return content

        except Exception as e:
            logger.error(f"Error communicating with OpenAI: {e}")
            raise RuntimeError(f"LLM query failed: {str(e)}")

