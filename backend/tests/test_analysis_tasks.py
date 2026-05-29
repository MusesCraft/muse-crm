from decimal import Decimal

from app.models.llm_usage_log import LlmUsageLog


def test_codex_usage_estimate_cost_is_zero():
    assert LlmUsageLog.estimate_cost("gpt-5.5", 1000, 2000) == Decimal("0")
