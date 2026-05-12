"""MUSE CRM — Quote Models (報價單)"""
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import UUID
from .. import db
import uuid


class Quote(db.Model):
    __tablename__ = 'quotes'
    id = db.Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    quote_number = db.Column(db.String(20), unique=True, nullable=False)  # QT-20260402-001
    contact_id = db.Column(UUID(as_uuid=False), db.ForeignKey('contacts.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)  # e.g. "客廳電視牆報價"
    status = db.Column(db.String(20), default='draft')  # draft/sent/accepted/rejected/expired
    subtotal = db.Column(db.Numeric(12, 2), default=0)
    discount_pct = db.Column(db.Numeric(5, 2), default=0)  # 0-100
    installation_fee = db.Column(db.Numeric(12, 2), default=0)
    total = db.Column(db.Numeric(12, 2), default=0)
    notes = db.Column(db.Text, nullable=True)
    valid_until = db.Column(db.Date, nullable=True)
    created_by = db.Column(UUID(as_uuid=False), nullable=True)
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    accepted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    items = db.relationship('QuoteItem', backref='quote', lazy='selectin', cascade='all, delete-orphan')
    contact = db.relationship('Contact', backref='quotes', lazy='selectin')

    def to_dict(self):
        return {
            'id': self.id,
            'quote_number': self.quote_number,
            'contact_id': self.contact_id,
            'contact_name': self.contact.display_name if self.contact else None,
            'title': self.title,
            'status': self.status,
            'subtotal': float(self.subtotal) if self.subtotal else 0,
            'discount_pct': float(self.discount_pct) if self.discount_pct else 0,
            'installation_fee': float(self.installation_fee) if self.installation_fee else 0,
            'total': float(self.total) if self.total else 0,
            'notes': self.notes,
            'valid_until': self.valid_until.isoformat() if self.valid_until else None,
            'created_by': self.created_by,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'items': [item.to_dict() for item in self.items],
            'item_count': len(self.items),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class QuoteItem(db.Model):
    __tablename__ = 'quote_items'
    id = db.Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    quote_id = db.Column(UUID(as_uuid=False), db.ForeignKey('quotes.id', ondelete='CASCADE'), nullable=False)
    product_id = db.Column(UUID(as_uuid=False), db.ForeignKey('products.id'), nullable=True)
    description = db.Column(db.String(500), nullable=False)  # product name or custom line item
    material_type = db.Column(db.String(100))
    dimensions = db.Column(db.String(255))  # e.g. "320x180cm"
    area_sqm = db.Column(db.Numeric(10, 2), nullable=True)  # calculated area
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    line_total = db.Column(db.Numeric(12, 2), nullable=False)
    grade = db.Column(db.String(20))  # A/B/C/D
    notes = db.Column(db.Text, nullable=True)

    product = db.relationship('Product', lazy='selectin')

    def to_dict(self):
        return {
            'id': self.id,
            'quote_id': self.quote_id,
            'product_id': self.product_id,
            'product_name': self.product.name if self.product else None,
            'description': self.description,
            'material_type': self.material_type,
            'dimensions': self.dimensions,
            'area_sqm': float(self.area_sqm) if self.area_sqm else None,
            'unit_price': float(self.unit_price),
            'quantity': self.quantity,
            'line_total': float(self.line_total),
            'grade': self.grade,
            'notes': self.notes,
        }
