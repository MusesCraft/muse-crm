"""MUSE CRM — QuickReply Model"""
from datetime import datetime, timezone
from .. import db
import uuid

class QuickReply(db.Model):
    __tablename__ = 'quick_replies'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    category = db.Column(db.String(50), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    trigger_keywords = db.Column(db.JSON, default=list)
    priority = db.Column(db.String(20), default='template')
    is_system = db.Column(db.Boolean, default=False)  # True = seeded from JSON
    created_by = db.Column(db.String(36), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'title': self.title,
            'content': self.content,
            'trigger_keywords': self.trigger_keywords or [],
            'priority': self.priority,
            'is_system': self.is_system,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
