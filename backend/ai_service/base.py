"""Base AI service client setup and shared attributes."""

from openai import OpenAI, BadRequestError

from .constants import MODEL_CONFIGS, logger


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

    def _create_chat(
        self,
        *,
        messages: list[dict],
        temperature: float,
        max_tokens: int,
        timeout: int = 60,
        stream: bool = False,
    ):
        """Create a chat completion with json_object mode + graceful fallback.

        Requests ``response_format={"type": "json_object"}`` when possible for
        reliable JSON output, but retries without it once if the gateway/
        proxy doesn't support ``response_format`` (some do not).
        """
        kwargs = dict(
            model=self.model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            stream=stream,
        )
        try:
            return self.client.chat.completions.create(
                **kwargs, response_format={"type": "json_object"},
            )
        except BadRequestError:
            logger.warning("json_object response_format unsupported, retrying without it")
            return self.client.chat.completions.create(**kwargs)
