"""MUSE CRM — Role & Permission Models"""
from datetime import datetime, timezone
from .. import db
import uuid


class Role(db.Model):
    __tablename__ = 'roles'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), unique=True, nullable=False)
    color = db.Column(db.String(7), default='#6366f1')  # hex color
    permissions = db.Column(db.JSON, default=dict)  # {"contacts.read": true, ...}
    position = db.Column(db.Integer, default=0)  # lower = higher priority
    is_system = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'color': self.color,
            'permissions': self.permissions or {},
            'position': self.position, 'is_system': self.is_system,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class UserRole(db.Model):
    __tablename__ = 'user_roles'
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    role_id = db.Column(db.String(36), db.ForeignKey('roles.id'), primary_key=True)
    assigned_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
