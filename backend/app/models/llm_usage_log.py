"""
MUSE CRM — LLM Usage Log Model

記錄每次 LLM 呼叫的 token 用量與成本。
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Integer, Numeric, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import uuid

from .. import db

# 成本計算常數表（USD / 1M tokens）
MODEL_PRICING = {
    'anthropic/claude-3.5-sonnet': {'input': Decimal('3.0'), 'output': Decimal('15.0')},
    'openai/gpt-4': {'input': Decimal('30.0'), 'output': Decimal('60.0')},
    'google/gemini-2.0-flash-lite-001': {'input': Decimal('0.075'), 'output': Decimal('0.3')},
    # 別名對應
    'google/gemini-2.0-flash-lite': {'input': Decimal('0.075'), 'output': Decimal('0.3')},
}


class LlmUsageLog(db.Model):
    """LLM 用量紀錄模型"""

    __tablename__ = 'llm_usage_logs'

    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # 任務類型
    task_type: Mapped[str] = mapped_column(
        String(50), nullable=False, comment='quick_triage | full_analysis | intent | entity | summary | action'
    )

    # 模型名稱
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    # Token 用量
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 成本（USD）
    estimated_cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 6), nullable=False, default=Decimal('0')
    )

    # 關聯（nullable）
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # 是否為 fallback 呼叫
    is_fallback: Mapped[bool] = mapped_column(
        default=False, nullable=False
    )

    # 時間戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # 索引
    __table_args__ = (
        Index('ix_llm_usage_logs_created_at', 'created_at'),
        Index('ix_llm_usage_logs_model', 'model'),
        Index('ix_llm_usage_logs_task_type', 'task_type'),
        Index('ix_llm_usage_logs_conversation_id', 'conversation_id'),
    )

    @classmethod
    def estimate_cost(cls, model: str, prompt_tokens: int, completion_tokens: int) -> Decimal:
        """
        根據模型和 token 數計算估算成本。

        Args:
            model: 模型名稱
            prompt_tokens: 輸入 token 數
            completion_tokens: 輸出 token 數

        Returns:
            估算成本（USD）
        """
        pricing = MODEL_PRICING.get(model)
        if not pricing:
            # 未知模型，使用 claude-3.5-sonnet 價格作為保守估算
            pricing = MODEL_PRICING['anthropic/claude-3.5-sonnet']

        input_cost = Decimal(str(prompt_tokens)) * pricing['input'] / Decimal('1000000')
        output_cost = Decimal(str(completion_tokens)) * pricing['output'] / Decimal('1000000')
        return input_cost + output_cost

    @classmethod
    def record(
        cls,
        task_type: str,
        usage_info: dict,
        conversation_id: Optional[str] = None,
        message_id: Optional[str] = None,
        is_fallback: bool = False,
    ) -> 'LlmUsageLog':
        """
        記錄一筆 LLM 用量。

        Args:
            task_type: 任務類型
            usage_info: LLMService 回傳的 usage_info 字典
            conversation_id: 對話 UUID（可選）
            message_id: 訊息 UUID（可選）
            is_fallback: 是否為 fallback 呼叫

        Returns:
            LlmUsageLog 實例
        """
        model = usage_info.get('model_used', 'unknown')
        prompt_tokens = usage_info.get('prompt_tokens', 0)
        completion_tokens = usage_info.get('completion_tokens', 0)
        total_tokens = usage_info.get('tokens_used', 0) or (prompt_tokens + completion_tokens)

        estimated_cost = cls.estimate_cost(model, prompt_tokens, completion_tokens)

        log = cls(
            task_type=task_type,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=estimated_cost,
            conversation_id=conversation_id,
            message_id=message_id,
            is_fallback=is_fallback,
        )

        db.session.add(log)
        return log

    def __repr__(self) -> str:
        return (
            f'<LlmUsageLog {self.task_type} model={self.model} '
            f'tokens={self.total_tokens} cost=${self.estimated_cost_usd}>'
        )
