"""
MUSE CRM — User & UserNote Models

使用者和使用者備註模型。
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Text, DateTime, Boolean, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

from .. import db


class User(db.Model):
    """使用者模型"""

    __tablename__ = 'users'

    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # 基本資訊
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # 認證
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))

    # 權限和狀態
    role: Mapped[str] = mapped_column(String(20), nullable=False, default='user')  # admin/manager/user
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 團隊標識（CRM-019）
    team_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now()
    )

    # 關聯
    notes: Mapped[List["UserNote"]] = relationship(
        "UserNote",
        back_populates="author",
        cascade="all, delete-orphan"
    )
    assigned_roles = db.relationship('Role', secondary='user_roles', backref='users', lazy='selectin')

    # 約束和索引
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'manager', 'user')", name='ck_user_role'),
        Index('idx_users_team', 'team_id'),
    )

    def __repr__(self) -> str:
        return f"<User {self.name} ({self.role})>"

    def set_password(self, password: str) -> None:
        """設定密碼（hash 儲存）"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """驗證密碼"""
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self) -> bool:
        """檢查是否為管理員"""
        return self.role == 'admin'

    @property
    def is_manager(self) -> bool:
        """檢查是否為主管"""
        return self.role == 'manager'

    @property
    def is_user(self) -> bool:
        """檢查是否為一般使用者"""
        return self.role == 'user'

    @property
    def can_edit_contacts(self) -> bool:
        """檢查是否可編輯客戶資料"""
        return self.role in ('admin', 'manager', 'user')

    @property
    def can_manage_users(self) -> bool:
        """檢查是否可管理使用者"""
        return self.role == 'admin'

    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'avatar_url': self.avatar_url,
            'is_active': self.is_active,
            'team_id': self.team_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'roles': [{'id': r.id, 'name': r.name, 'color': r.color} for r in self.assigned_roles],
        }


class UserNote(db.Model):
    """使用者備註模型"""

    __tablename__ = 'user_notes'

    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # 關聯
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('contacts.id', ondelete='CASCADE'),
        nullable=False
    )
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('users.id', ondelete='SET NULL')
    )

    # 備註內容
    content: Mapped[str] = mapped_column(Text, nullable=False)

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
    contact: Mapped["Contact"] = relationship("Contact", back_populates="notes_by_users")
    author: Mapped[Optional["User"]] = relationship("User", back_populates="notes")

    # 索引
    __table_args__ = (
        Index('idx_user_notes_contact', 'contact_id', 'created_at'),
    )

    def __repr__(self) -> str:
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"<UserNote {self.id}: '{content_preview}'>"

    @property
    def has_author(self) -> bool:
        """檢查是否有作者"""
        return self.author_id is not None

    @property
    def is_updated(self) -> bool:
        """檢查是否已更新過"""
        return self.updated_at > self.created_at

    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'contact_id': str(self.contact_id),
            'author_id': str(self.author_id) if self.author_id else None,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
