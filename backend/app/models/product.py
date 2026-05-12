"""MUSE CRM — Product & Inventory Models"""
from datetime import datetime, timezone
from .. import db
import uuid

class ProductCategory(db.Model):
    __tablename__ = 'product_categories'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    products = db.relationship('Product', backref='category', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'description': self.description,
            'product_count': self.products.count() if self.products else 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    sku = db.Column(db.String(100), unique=True, nullable=True)
    category_id = db.Column(db.String(36), db.ForeignKey('product_categories.id'), nullable=True)
    material_type = db.Column(db.String(100))  # quartz/engineered_stone/sintered_stone/marble/granite
    dimensions = db.Column(db.String(255))  # e.g. "3200x1600x20mm"
    unit_price = db.Column(db.Numeric(12, 2), nullable=True)
    stock_quantity = db.Column(db.Integer, default=0)
    grade = db.Column(db.String(20))  # A/B/C/D (品相)
    image_url = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='active')  # active/discontinued/out_of_stock
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    stock_logs = db.relationship('StockLog', backref='product', lazy='dynamic', order_by='StockLog.created_at.desc()')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'sku': self.sku,
            'category_id': self.category_id,
            'category_name': self.category.name if self.category else None,
            'material_type': self.material_type, 'dimensions': self.dimensions,
            'unit_price': float(self.unit_price) if self.unit_price else None,
            'stock_quantity': self.stock_quantity, 'grade': self.grade,
            'image_url': self.image_url, 'status': self.status, 'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

class StockLog(db.Model):
    __tablename__ = 'stock_logs'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = db.Column(db.String(36), db.ForeignKey('products.id'), nullable=False)
    quantity_change = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(100))  # sale/return/damage/restock/adjustment
    reference_note = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.String(36), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id, 'product_id': self.product_id,
            'quantity_change': self.quantity_change, 'reason': self.reason,
            'reference_note': self.reference_note, 'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
