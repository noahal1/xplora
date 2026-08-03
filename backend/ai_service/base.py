"""Base AI service client setup and shared attributes."""

from openai import OpenAI

from .constants import MODEL_CONFIGS


class AIServiceBase:
    """Base AI service client setup and shared attributes."""

    def __init__(self, api_key: str, model_type: str = "deepseek", user_id: int = 0):
        """
        Initialize the AI service.

        Args:
            api_key: API key for the AI service
            model_type: 'deepseek' or 'openai'
            user_id: User ID for cache key isolation across multiple users

        Raises:
            ValueError: If model_type is unsupported
        """
        if model_type not in MODEL_CONFIGS:
            supported = ", ".join(MODEL_CONFIGS.keys())
            raise ValueError(f"Unsupported model '{model_type}'. Supported: {supported}")

        config = MODEL_CONFIGS[model_type]
        self.model_type = model_type
        self.model_name = config["model"]
        self.user_id = user_id
        self.client = OpenAI(
            api_key=api_key,
            base_url=config["api_base"],
        )
