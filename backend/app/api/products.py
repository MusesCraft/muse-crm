"""
MUSE CRM — Products & Inventory API

庫存與產品品相管理 API 端點。
"""

from datetime import datetime, timezone
from flask import jsonify, request, g
from sqlalchemy import desc, asc, or_

from . import api_bp
from ..models import Product, ProductCategory, StockLog
from .. import db
from ..utils import escape_like
from ..utils.auth import login_required
from ..utils.permissions import get_current_user, require_role


# ── 產品分類 ──────────────────────────────────────────

@api_bp.route('/products/categories', methods=['GET'])
@login_required
def list_categories():
    """列出所有產品分類"""
    categories = ProductCategory.query.order_by(ProductCategory.name).all()
    return jsonify([c.to_dict() for c in categories])


@api_bp.route('/products/categories', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def create_category():
    """建立產品分類"""
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '分類名稱為必填欄位'}), 400

    existing = ProductCategory.query.filter_by(name=name).first()
    if existing:
        return jsonify({'error': f'分類「{name}」已存在'}), 400

    category = ProductCategory(
        name=name,
        description=(data.get('description') or '').strip() or None,
    )
    db.session.add(category)
    db.session.commit()

    return jsonify(category.to_dict()), 201


# ── 產品 CRUD ─────────────────────────────────────────

@api_bp.route('/products', methods=['GET'])
@login_required
def list_products():
    """
    列出產品列表（分頁）

    Query parameters:
        - page: 頁碼（預設 1）
        - per_page: 每頁筆數（預設 20）
        - search: 搜尋名稱/SKU
        - category_id: 篩選分類
        - grade: 篩選品相 A/B/C/D
        - status: 篩選狀態 active/discontinued/out_of_stock
        - material_type: 篩選材質
        - sort_by: 排序欄位（name/sku/unit_price/stock_quantity/grade/created_at）
        - sort_order: 排序方向（asc/desc，預設 desc）
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    search = request.args.get('search', '').strip()
    category_id = request.args.get('category_id', '').strip()
    grade = request.args.get('grade', '').strip()
    status = request.args.get('status', '').strip()
    material_type = request.args.get('material_type', '').strip()
    sort_by = request.args.get('sort_by', 'created_at').strip()
    sort_order = request.args.get('sort_order', 'desc').strip()

    query = Product.query

    # 搜尋
    if search:
        safe_search = escape_like(search)
        like_pat = f'%{safe_search}%'
        query = query.filter(
            or_(
                Product.name.ilike(like_pat, escape='\\'),
                Product.sku.ilike(like_pat, escape='\\'),
            )
        )

    # 篩選
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if grade:
        query = query.filter(Product.grade == grade)
    if status:
        query = query.filter(Product.status == status)
    if material_type:
        query = query.filter(Product.material_type == material_type)

    # 排序
    sort_columns = {
        'name': Product.name,
        'sku': Product.sku,
        'unit_price': Product.unit_price,
        'stock_quantity': Product.stock_quantity,
        'grade': Product.grade,
        'created_at': Product.created_at,
    }
    sort_col = sort_columns.get(sort_by, Product.created_at)
    if sort_order == 'asc':
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    pagination = query.paginate(page=page, per_page=per_page)

    return jsonify({
        'data': [p.to_dict() for p in pagination.items],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        }
    })


@api_bp.route('/products/<product_id>', methods=['GET'])
@login_required
def get_product(product_id):
    """取得產品詳情（含最近 20 筆庫存異動紀錄）"""
    product = Product.query.get_or_404(product_id)
    result = product.to_dict()
    result['stock_logs'] = [
        log.to_dict()
        for log in product.stock_logs.limit(20).all()
    ]
    return jsonify(result)


@api_bp.route('/products', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def create_product():
    """建立產品"""
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '產品名稱為必填欄位'}), 400

    # 驗證 SKU 唯一性
    sku = (data.get('sku') or '').strip() or None
    if sku:
        existing = Product.query.filter_by(sku=sku).first()
        if existing:
            return jsonify({'error': f'SKU「{sku}」已存在'}), 400

    # 驗證品相
    valid_grades = ('A', 'B', 'C', 'D')
    grade = (data.get('grade') or '').strip().upper() or None
    if grade and grade not in valid_grades:
        return jsonify({'error': f'品相必須為 {", ".join(valid_grades)} 之一'}), 400

    # 驗證狀態
    valid_statuses = ('active', 'discontinued', 'out_of_stock')
    status = data.get('status', 'active')
    if status not in valid_statuses:
        return jsonify({'error': f'狀態必須為 {", ".join(valid_statuses)} 之一'}), 400

    # 驗證材質
    valid_materials = ('quartz', 'engineered_stone', 'sintered_stone', 'marble', 'granite')
    material_type = (data.get('material_type') or '').strip() or None
    if material_type and material_type not in valid_materials:
        return jsonify({'error': f'材質必須為 {", ".join(valid_materials)} 之一'}), 400

    # 驗證分類存在
    category_id = (data.get('category_id') or '').strip() or None
    if category_id:
        category = ProductCategory.query.get(category_id)
        if not category:
            return jsonify({'error': '指定的分類不存在'}), 400

    # 解析價格
    unit_price = data.get('unit_price')
    if unit_price is not None:
        try:
            unit_price = float(unit_price)
            if unit_price < 0:
                return jsonify({'error': '單價不能為負數'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': '單價格式不正確'}), 400

    # 解析庫存
    stock_quantity = data.get('stock_quantity', 0)
    try:
        stock_quantity = int(stock_quantity)
        if stock_quantity < 0:
            return jsonify({'error': '庫存數量不能為負數'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': '庫存數量格式不正確'}), 400

    product = Product(
        name=name,
        sku=sku,
        category_id=category_id,
        material_type=material_type,
        dimensions=(data.get('dimensions') or '').strip() or None,
        unit_price=unit_price,
        stock_quantity=stock_quantity,
        grade=grade,
        image_url=(data.get('image_url') or '').strip() or None,
        status=status,
        notes=(data.get('notes') or '').strip() or None,
    )

    db.session.add(product)
    db.session.commit()

    return jsonify(product.to_dict()), 201


@api_bp.route('/products/<product_id>', methods=['PUT'])
@login_required
@require_role('admin', 'manager')
def update_product(product_id):
    """更新產品"""
    product = Product.query.get_or_404(product_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'error': '產品名稱不能為空'}), 400
        product.name = name

    if 'sku' in data:
        sku = (data['sku'] or '').strip() or None
        if sku:
            existing = Product.query.filter(Product.sku == sku, Product.id != product_id).first()
            if existing:
                return jsonify({'error': f'SKU「{sku}」已被其他產品使用'}), 400
        product.sku = sku

    if 'category_id' in data:
        category_id = (data['category_id'] or '').strip() or None
        if category_id:
            category = ProductCategory.query.get(category_id)
            if not category:
                return jsonify({'error': '指定的分類不存在'}), 400
        product.category_id = category_id

    if 'material_type' in data:
        valid_materials = ('quartz', 'engineered_stone', 'sintered_stone', 'marble', 'granite')
        mt = (data['material_type'] or '').strip() or None
        if mt and mt not in valid_materials:
            return jsonify({'error': f'材質必須為 {", ".join(valid_materials)} 之一'}), 400
        product.material_type = mt

    if 'dimensions' in data:
        product.dimensions = (data['dimensions'] or '').strip() or None

    if 'unit_price' in data:
        if data['unit_price'] is not None:
            try:
                price = float(data['unit_price'])
                if price < 0:
                    return jsonify({'error': '單價不能為負數'}), 400
                product.unit_price = price
            except (ValueError, TypeError):
                return jsonify({'error': '單價格式不正確'}), 400
        else:
            product.unit_price = None

    if 'grade' in data:
        valid_grades = ('A', 'B', 'C', 'D')
        g_val = (data['grade'] or '').strip().upper() or None
        if g_val and g_val not in valid_grades:
            return jsonify({'error': f'品相必須為 {", ".join(valid_grades)} 之一'}), 400
        product.grade = g_val

    if 'image_url' in data:
        product.image_url = (data['image_url'] or '').strip() or None

    if 'status' in data:
        valid_statuses = ('active', 'discontinued', 'out_of_stock')
        if data['status'] not in valid_statuses:
            return jsonify({'error': f'狀態必須為 {", ".join(valid_statuses)} 之一'}), 400
        product.status = data['status']

    if 'notes' in data:
        product.notes = (data['notes'] or '').strip() or None

    db.session.commit()

    return jsonify(product.to_dict())


@api_bp.route('/products/<product_id>', methods=['DELETE'])
@login_required
@require_role('admin', 'manager')
def delete_product(product_id):
    """停用產品（軟刪除，設為 discontinued）"""
    product = Product.query.get_or_404(product_id)
    product.status = 'discontinued'
    db.session.commit()
    return jsonify({'message': '產品已停用'})


# ── 庫存異動 ──────────────────────────────────────────

@api_bp.route('/products/<product_id>/stock', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def adjust_stock(product_id):
    """
    庫存異動

    Body:
        - quantity_change: 變動數量（正數=入庫，負數=出庫）
        - reason: 異動原因（sale/return/damage/restock/adjustment）
        - note: 備註（選填）
    """
    product = Product.query.get_or_404(product_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    # 驗證 quantity_change
    quantity_change = data.get('quantity_change')
    if quantity_change is None:
        return jsonify({'error': 'quantity_change 為必填欄位'}), 400
    try:
        quantity_change = int(quantity_change)
    except (ValueError, TypeError):
        return jsonify({'error': 'quantity_change 必須為整數'}), 400

    if quantity_change == 0:
        return jsonify({'error': '變動數量不能為 0'}), 400

    # 驗證 reason
    valid_reasons = ('sale', 'return', 'damage', 'restock', 'adjustment')
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': 'reason 為必填欄位'}), 400
    if reason not in valid_reasons:
        return jsonify({'error': f'reason 必須為 {", ".join(valid_reasons)} 之一'}), 400

    # 驗證庫存不會變負數
    new_quantity = product.stock_quantity + quantity_change
    if new_quantity < 0:
        return jsonify({
            'error': f'庫存不足，目前庫存 {product.stock_quantity}，無法扣除 {abs(quantity_change)}'
        }), 400

    # 更新庫存
    product.stock_quantity = new_quantity

    # 自動更新狀態
    if new_quantity == 0 and product.status == 'active':
        product.status = 'out_of_stock'
    elif new_quantity > 0 and product.status == 'out_of_stock':
        product.status = 'active'

    # 建立異動紀錄
    user = get_current_user()
    log = StockLog(
        product_id=product.id,
        quantity_change=quantity_change,
        reason=reason,
        reference_note=(data.get('note') or '').strip() or None,
        created_by=str(user.id) if user else None,
    )

    db.session.add(log)
    db.session.commit()

    return jsonify({
        'product': product.to_dict(),
        'log': log.to_dict(),
    })
