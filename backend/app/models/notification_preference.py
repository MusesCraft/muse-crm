"""
MUSE CRM — NotificationPreference Model

使用者通知偏好設定模型。
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy import String, Text, DateTime, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class NotificationPreference(db.Model):
    """使用者通知偏好設定"""

    __tablename__ = 'notification_preferences'

    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # 關聯（一對一）
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        unique=True
    )

    # 管道啟用開關
    discord_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    line_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 管道憑證
    discord_webhook_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    line_notify_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # 勿擾時段（HH:MM 格式，例如 "22:00"）
    quiet_hours_start: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    quiet_hours_end: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)

    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now()
    )

    # 關聯
    user: Mapped["User"] = relationship("User", backref="notification_preference")

    # 索引
    __table_args__ = (
        Index('idx_notification_pref_user', 'user_id'),
    )

    def __repr__(self) -> str:
        return f"<NotificationPreference user={self.user_id}>"

    @property
    def has_quiet_hours(self) -> bool:
        """檢查是否設定了勿擾時段"""
        return bool(self.quiet_hours_start and self.quiet_hours_end)

    def is_quiet_now(self) -> bool:
        """
        檢查當前是否處於勿擾時段。

        Returns:
            是否處於勿擾時段
        """
        if not self.has_quiet_hours:
            return False

        try:
            # 使用 Asia/Taipei（UTC+8）時區，與使用者設定的勿擾時段一致
            tz_taipei = timezone(timedelta(hours=8))
            now = datetime.now(tz_taipei).strftime('%H:%M')
            start = self.quiet_hours_start
            end = self.quiet_hours_end

            if start <= end:
                # 同日區間：例如 08:00 ~ 18:00
                return start <= now <= end
            else:
                # 跨日區間：例如 22:00 ~ 07:00
                return now >= start or now <= end
        except (ValueError, TypeError):
            return False

    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'user_id': str(self.user_id),
            'discord_enabled': self.discord_enabled,
            'line_enabled': self.line_enabled,
            'email_enabled': self.email_enabled,
            'discord_webhook_url': self.discord_webhook_url,
            'line_notify_token': self.line_notify_token,
            'email_address': self.email_address,
            'quiet_hours_start': self.quiet_hours_start,
            'quiet_hours_end': self.quiet_hours_end,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
