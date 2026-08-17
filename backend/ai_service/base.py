"""Base AI service client setup and shared attributes."""

from openai import (
    OpenAI,
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    RateLimitError,
)

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

        Non-streaming responses that come back with an empty ``content``
        (e.g. reasoning models that spend all of ``max_tokens`` on thinking)
        are retried once without json_object mode.  This covers all callers
        (recommend, hybrid, playlists, ...) with a single retry so transient
        empty responses rarely surface to the user.
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
            response = self.client.chat.completions.create(
                **kwargs, response_format={"type": "json_object"},
            )
        except BadRequestError:
            logger.warning("json_object response_format unsupported, retrying without it")
            return self.client.chat.completions.create(**kwargs)

        # Empty non-streaming content → retry once without json_object mode.
        # Reasoning models (e.g. DeepSeek V4 thinking mode) occasionally return
        # only reasoning_content with an empty content field; a retry usually
        # yields a proper answer.
        if not stream:
            content = response.choices[0].message.content if response.choices else None
            if not content:
                logger.warning(
                    "Empty content from %s (%s), retrying without json_object mode",
                    self.model_name, self.model_type,
                )
                return self.client.chat.completions.create(**kwargs)

        return response

    def _create_chat_retry(
        self,
        *,
        messages: list[dict],
        temperature: float,
        max_tokens: int,
        timeout: int = 60,
        retries: int = 2,
    ) -> str:
        """Non-streaming AI call with transient-failure retry.

        Returns the response ``content`` string.  Retries transient
        failures (timeouts, rate limits, connection errors, empty
        responses) up to ``retries`` extra times — same resilience the
        recommendation engine's ``_retry_loop`` gives, but for single
        calls like playlist name/categorize/complete.  Authentication
        errors are raised immediately (a retry won't fix a bad key).

        Raises ``RuntimeError`` with a user-friendly message when all
        attempts fail.
        """
        last_error: Exception | None = None
        for attempt in range(retries + 1):
            try:
                response = self._create_chat(
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
                content = response.choices[0].message.content if response.choices else ""
                if content:
                    return content
                last_error = ValueError("Empty response from AI model")
            except (APITimeoutError, RateLimitError, APIConnectionError, APIError) as e:
                last_error = e
            except AuthenticationError:
                raise
            logger.warning(
                "AI call attempt %d/%d failed: %s",
                attempt + 1, retries + 1, last_error,
            )
        raise RuntimeError(f"AI 服务调用失败，请稍后重试：{last_error}") from last_error
