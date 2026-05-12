"""
MUSE CRM — Quotes API (報價單)

報價單 CRUD 端點，含項目管理和狀態流轉。
"""

from datetime import datetime, date, timezone
from decimal import Decimal, InvalidOperation
from flask import jsonify, request, g
from sqlalchemy import desc, or_

from . import api_bp
from ..models import Quote, QuoteItem, Contact, Product
from .. import db
from ..utils import escape_like
from ..utils.auth import login_required
from ..utils.permissions import get_current_user, require_role


# ── 報價單列表 ─────────────────────────────────────────

@api_bp.route('/quotes', methods=['GET'])
@login_required
def list_quotes():
    """
    列出報價單（分頁）

    Query parameters:
        - page: 頁碼（預設 1）
        - per_page: 每頁筆數（預設 20）
        - search: 搜尋報價編號/標題/客戶名稱
        - status: 篩選狀態 draft/sent/accepted/rejected/expired
        - contact_id: 篩選客戶
        - sort_by: 排序欄位（created_at/quote_number/total/status）
        - sort_order: 排序方向（asc/desc，預設 desc）
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    search = request.args.get('search', '').strip()
    status = request.args.get('status', '').strip()
    contact_id = request.args.get('contact_id', '').strip()
    sort_by = request.args.get('sort_by', 'created_at').strip()
    sort_order = request.args.get('sort_order', 'desc').strip()

    query = Quote.query

    # 搜尋
    if search:
        safe_search = escape_like(search)
        like_pat = f'%{safe_search}%'
        query = query.outerjoin(Contact, Quote.contact_id == Contact.id).filter(
            or_(
                Quote.quote_number.ilike(like_pat, escape='\\'),
                Quote.title.ilike(like_pat, escape='\\'),
                Contact.display_name.ilike(like_pat, escape='\\'),
            )
        )

    # 篩選
    if status:
        query = query.filter(Quote.status == status)
    if contact_id:
        query = query.filter(Quote.contact_id == contact_id)

    # 排序
    sort_columns = {
        'created_at': Quote.created_at,
        'quote_number': Quote.quote_number,
        'total': Quote.total,
        'status': Quote.status,
    }
    sort_col = sort_columns.get(sort_by, Quote.created_at)
    if sort_order == 'asc':
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    pagination = query.paginate(page=page, per_page=per_page)

    return jsonify({
        'data': [q.to_dict() for q in pagination.items],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        }
    })


# ── 報價單詳情 ─────────────────────────────────────────

@api_bp.route('/quotes/<quote_id>', methods=['GET'])
@login_required
def get_quote(quote_id):
    """取得報價單詳情（含項目）"""
    quote = Quote.query.get_or_404(quote_id)
    return jsonify(quote.to_dict())


# ── 建立報價單 ─────────────────────────────────────────

def _generate_quote_number():
    """
    產生報價編號：QT-YYYYMMDD-NNN

    同一天內依序編號，從 001 開始。
    """
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    prefix = f'QT-{today}-'

    # 查詢今天最大編號
    latest = (
        Quote.query
        .filter(Quote.quote_number.like(f'{prefix}%'))
        .order_by(desc(Quote.quote_number))
        .first()
    )

    if latest:
        try:
            seq = int(latest.quote_number.split('-')[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f'{prefix}{seq:03d}'


def _parse_decimal(value, field_name):
    """安全解析 Decimal 值"""
    if value is None:
        return None
    try:
        d = Decimal(str(value))
        if d < 0:
            return None, f'{field_name}不能為負數'
        return d, None
    except (InvalidOperation, ValueError, TypeError):
        return None, f'{field_name}格式不正確'


def _calculate_totals(items, discount_pct, installation_fee):
    """計算報價單金額"""
    subtotal = sum(item.line_total for item in items)
    discount_factor = Decimal('1') - (discount_pct or Decimal('0')) / Decimal('100')
    total = subtotal * discount_factor + (installation_fee or Decimal('0'))
    return subtotal, total


def _build_quote_items(items_data):
    """
    從 items 資料建立 QuoteItem 列表。

    Returns:
        (items_list, error_message)
    """
    items = []
    for idx, item_data in enumerate(items_data):
        # 描述為必填
        description = (item_data.get('description') or '').strip()
        if not description:
            return None, f'項目 {idx + 1} 的 description 為必填欄位'

        # 單價為必填
        unit_price_raw = item_data.get('unit_price')
        if unit_price_raw is None:
            return None, f'項目 {idx + 1} 的 unit_price 為必填欄位'
        unit_price, err = _parse_decimal(unit_price_raw, f'項目 {idx + 1} 的 unit_price')
        if err:
            return None, err

        # 數量（預設 1）
        try:
            quantity = int(item_data.get('quantity', 1))
            if quantity <= 0:
                return None, f'項目 {idx + 1} 的 quantity 必須大於 0'
        except (ValueError, TypeError):
            return None, f'項目 {idx + 1} 的 quantity 格式不正確'

        # 計算行金額
        line_total = unit_price * quantity

        # 面積（選填）
        area_sqm = None
        if item_data.get('area_sqm') is not None:
            area_sqm, err = _parse_decimal(item_data['area_sqm'], f'項目 {idx + 1} 的 area_sqm')
            if err:
                return None, err

        # 驗證 product_id（選填）
        product_id = (item_data.get('product_id') or '').strip() or None
        if product_id:
            product = Product.query.get(product_id)
            if not product:
                return None, f'項目 {idx + 1} 的 product_id 不存在'

        # 品相驗證（選填）
        grade = (item_data.get('grade') or '').strip().upper() or None
        if grade and grade not in ('A', 'B', 'C', 'D'):
            return None, f'項目 {idx + 1} 的 grade 必須為 A/B/C/D 之一'

        quote_item = QuoteItem(
            product_id=product_id,
            description=description,
            material_type=(item_data.get('material_type') or '').strip() or None,
            dimensions=(item_data.get('dimensions') or '').strip() or None,
            area_sqm=area_sqm,
            unit_price=unit_price,
            quantity=quantity,
            line_total=line_total,
            grade=grade,
            notes=(item_data.get('notes') or '').strip() or None,
        )
        items.append(quote_item)

    return items, None


@api_bp.route('/quotes', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def create_quote():
    """
    建立報價單

    Body:
        - contact_id: 客戶 ID（必填）
        - title: 報價標題（必填）
        - items: 項目陣列（必填，至少一項）
            - product_id: 產品 ID（選填）
            - description: 描述（必填）
            - unit_price: 單價（必填）
            - quantity: 數量（預設 1）
            - dimensions: 尺寸（選填）
            - grade: 品相（選填）
            - area_sqm: 面積（選填）
            - material_type: 材質（選填）
            - notes: 備註（選填）
        - discount_pct: 折扣百分比 0-100（選填）
        - installation_fee: 安裝費（選填）
        - notes: 備註（選填）
        - valid_until: 有效期限 YYYY-MM-DD（選填）
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    # 驗證必填欄位
    contact_id = (data.get('contact_id') or '').strip()
    if not contact_id:
        return jsonify({'error': 'contact_id 為必填欄位'}), 400

    contact = Contact.query.get(contact_id)
    if not contact:
        return jsonify({'error': '指定的客戶不存在'}), 400

    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title 為必填欄位'}), 400

    # 驗證項目
    items_data = data.get('items')
    if not items_data or not isinstance(items_data, list) or len(items_data) == 0:
        return jsonify({'error': '至少需要一個項目'}), 400

    items, err = _build_quote_items(items_data)
    if err:
        return jsonify({'error': err}), 400

    # 折扣
    discount_pct = Decimal('0')
    if data.get('discount_pct') is not None:
        discount_pct, err = _parse_decimal(data['discount_pct'], 'discount_pct')
        if err:
            return jsonify({'error': err}), 400
        if discount_pct > Decimal('100'):
            return jsonify({'error': 'discount_pct 不能超過 100'}), 400

    # 安裝費
    installation_fee = Decimal('0')
    if data.get('installation_fee') is not None:
        installation_fee, err = _parse_decimal(data['installation_fee'], 'installation_fee')
        if err:
            return jsonify({'error': err}), 400

    # 有效期限
    valid_until = None
    if data.get('valid_until'):
        try:
            valid_until = date.fromisoformat(data['valid_until'])
        except (ValueError, TypeError):
            return jsonify({'error': 'valid_until 格式不正確，請使用 YYYY-MM-DD'}), 400

    # 計算金額
    subtotal, total = _calculate_totals(items, discount_pct, installation_fee)

    # 取得當前用戶
    user = get_current_user()

    # 建立報價單
    quote = Quote(
        quote_number=_generate_quote_number(),
        contact_id=contact_id,
        title=title,
        status='draft',
        subtotal=subtotal,
        discount_pct=discount_pct,
        installation_fee=installation_fee,
        total=total,
        notes=(data.get('notes') or '').strip() or None,
        valid_until=valid_until,
        created_by=str(user.id) if user else None,
    )

    # 加入項目
    for item in items:
        quote.items.append(item)

    db.session.add(quote)
    db.session.commit()

    return jsonify(quote.to_dict()), 201


# ── 更新報價單 ─────────────────────────────────────────

@api_bp.route('/quotes/<quote_id>', methods=['PUT'])
@login_required
@require_role('admin', 'manager')
def update_quote(quote_id):
    """
    更新報價單（僅限 draft 狀態）

    可更新標題、備註、折扣、安裝費、有效期限、項目（全量替換）。
    """
    quote = Quote.query.get_or_404(quote_id)

    if quote.status != 'draft':
        return jsonify({'error': '只能編輯草稿狀態的報價單'}), 400

    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    # 標題
    if 'title' in data:
        title = (data['title'] or '').strip()
        if not title:
            return jsonify({'error': '標題不能為空'}), 400
        quote.title = title

    # 客戶
    if 'contact_id' in data:
        contact_id = (data['contact_id'] or '').strip()
        if not contact_id:
            return jsonify({'error': 'contact_id 不能為空'}), 400
        contact = Contact.query.get(contact_id)
        if not contact:
            return jsonify({'error': '指定的客戶不存在'}), 400
        quote.contact_id = contact_id

    # 備註
    if 'notes' in data:
        quote.notes = (data['notes'] or '').strip() or None

    # 有效期限
    if 'valid_until' in data:
        if data['valid_until']:
            try:
                quote.valid_until = date.fromisoformat(data['valid_until'])
            except (ValueError, TypeError):
                return jsonify({'error': 'valid_until 格式不正確，請使用 YYYY-MM-DD'}), 400
        else:
            quote.valid_until = None

    # 折扣
    if 'discount_pct' in data:
        if data['discount_pct'] is not None:
            discount_pct, err = _parse_decimal(data['discount_pct'], 'discount_pct')
            if err:
                return jsonify({'error': err}), 400
            if discount_pct > Decimal('100'):
                return jsonify({'error': 'discount_pct 不能超過 100'}), 400
            quote.discount_pct = discount_pct
        else:
            quote.discount_pct = Decimal('0')

    # 安裝費
    if 'installation_fee' in data:
        if data['installation_fee'] is not None:
            installation_fee, err = _parse_decimal(data['installation_fee'], 'installation_fee')
            if err:
                return jsonify({'error': err}), 400
            quote.installation_fee = installation_fee
        else:
            quote.installation_fee = Decimal('0')

    # 項目（全量替換）
    if 'items' in data:
        items_data = data['items']
        if not items_data or not isinstance(items_data, list) or len(items_data) == 0:
            return jsonify({'error': '至少需要一個項目'}), 400

        items, err = _build_quote_items(items_data)
        if err:
            return jsonify({'error': err}), 400

        # 清除舊項目，加入新項目
        quote.items.clear()
        for item in items:
            quote.items.append(item)

    # 重新計算金額
    subtotal, total = _calculate_totals(
        quote.items,
        quote.discount_pct or Decimal('0'),
        quote.installation_fee or Decimal('0'),
    )
    quote.subtotal = subtotal
    quote.total = total

    db.session.commit()

    return jsonify(quote.to_dict())


# ── 變更報價單狀態 ──────────────────────────────────────

@api_bp.route('/quotes/<quote_id>/status', methods=['PATCH'])
@login_required
@require_role('admin', 'manager')
def update_quote_status(quote_id):
    """
    變更報價單狀態

    Body:
        - status: 新狀態 (sent/accepted/rejected/expired)

    狀態流轉規則：
        - draft → sent/expired
        - sent → accepted/rejected/expired
        - accepted/rejected/expired 為終態，不可變更
    """
    quote = Quote.query.get_or_404(quote_id)

    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    new_status = (data.get('status') or '').strip()
    valid_statuses = ('sent', 'accepted', 'rejected', 'expired')
    if new_status not in valid_statuses:
        return jsonify({'error': f'狀態必須為 {", ".join(valid_statuses)} 之一'}), 400

    # 狀態流轉驗證
    allowed_transitions = {
        'draft': ['sent', 'expired'],
        'sent': ['accepted', 'rejected', 'expired'],
    }

    current_allowed = allowed_transitions.get(quote.status, [])
    if new_status not in current_allowed:
        return jsonify({
            'error': f'無法從「{quote.status}」變更為「{new_status}」'
        }), 400

    now = datetime.now(timezone.utc)

    # 記錄時間戳
    if new_status == 'sent':
        quote.sent_at = now
    elif new_status == 'accepted':
        quote.accepted_at = now

    quote.status = new_status
    db.session.commit()

    return jsonify(quote.to_dict())


# ── 刪除報價單 ─────────────────────────────────────────

@api_bp.route('/quotes/<quote_id>', methods=['DELETE'])
@login_required
@require_role('admin', 'manager')
def delete_quote(quote_id):
    """刪除報價單（僅限 draft 狀態）"""
    quote = Quote.query.get_or_404(quote_id)

    if quote.status != 'draft':
        return jsonify({'error': '只能刪除草稿狀態的報價單'}), 400

    db.session.delete(quote)
    db.session.commit()

    return jsonify({'message': '報價單已刪除'})
