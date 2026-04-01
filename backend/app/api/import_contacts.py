"""
MUSE CRM — 客戶資料匯入 API（Admin only）
從 Google Sheets CSV 匯入客戶紀錄。
"""

import csv
import logging
from io import StringIO
from datetime import datetime, timezone

import requests as http_requests
from flask import jsonify, request, g

from . import api_bp
from ..models.contact import Contact
from .. import db
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)

SOURCE_MAP = {
    'FB': 'messenger', 'IG': 'instagram', 'Line': 'line', 'LINE': 'line',
    'Thread': 'other', '介紹': 'referral', 'FB→Line': 'messenger',
}
STAGE_MAP = {
    '已收款': 'won', '有需求': 'following_up', '已報價': 'quoted',
    '已拜訪': 'following_up', '已致電': 'following_up', '客戶未回': 'following_up',
    '我方未回': 'following_up', '待回覆': 'following_up', '待拜訪': 'following_up',
    '改約日期': 'following_up', '已無需求': 'lost', '價格太高': 'lost',
    '未轉化': 'lost', '已建line群組': 'following_up', '已致電 未通': 'following_up',
}


@api_bp.route('/admin/import-csv', methods=['POST'])
@login_required
@require_role('admin')
def import_csv_contacts():
    """
    從 Google Sheets 匯入客戶紀錄。

    Body: { "sheet_url": "https://docs.google.com/spreadsheets/d/.../edit..." }
    """
    data = request.get_json()
    sheet_url = data.get('sheet_url', '')

    # Extract spreadsheet ID
    import re
    match = re.search(r'/d/([a-zA-Z0-9_-]+)', sheet_url)
    if not match:
        return jsonify({'error': '無效的 Google Sheets URL'}), 400

    sheet_id = match.group(1)
    csv_url = f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid=0'

    # Ensure new columns exist (auto-migration for new fields)
    try:
        from sqlalchemy import text
        ddl_stmts = [
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS intent VARCHAR(50)",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS budget_range VARCHAR(50)",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_products TEXT[]",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS visit_date DATE",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS referral_source VARCHAR(255)",
            "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_status VARCHAR(20) DEFAULT 'new'",
            "ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS attachments JSON DEFAULT '[]'",
        ]
        for stmt in ddl_stmts:
            db.session.execute(text(stmt))
        db.session.commit()
        logger.info("✅ Schema migration complete")
    except Exception as mig_err:
        logger.warning(f"Schema migration skipped: {mig_err}")
        db.session.rollback()

    # Download CSV
    try:
        resp = http_requests.get(csv_url, timeout=30)
        resp.encoding = 'utf-8'
        if resp.status_code != 200:
            return jsonify({'error': f'無法下載 CSV: {resp.status_code}'}), 400
    except Exception as e:
        return jsonify({'error': f'下載失敗: {str(e)}'}), 400

    reader = csv.reader(StringIO(resp.text))
    rows = list(reader)

    # Find header row
    header_idx = None
    for i, row in enumerate(rows):
        row_str = ','.join(row)
        if '接洽日期' in row_str and '客戶姓名' in row_str:
            header_idx = i
            break

    if header_idx is None:
        return jsonify({'error': '找不到表頭行（需包含「接洽日期」和「客戶姓名」）'}), 400

    headers_row = rows[header_idx]

    # Map columns
    col = {}
    for i, h in enumerate(headers_row):
        h = h.strip()
        if '接洽日期' in h: col['date'] = i
        elif '成交' in h: col['closed'] = i
        elif '客戶姓名' in h: col['name'] = i
        elif '公司名稱' in h: col['company'] = i
        elif '聯絡電話' in h: col['phone'] = i
        elif 'email' in h.lower(): col['email'] = i
        elif '聯絡地址' in h or '工地地址' in h: col['address'] = i
        elif h == '來源': col['source'] = i
        elif '客戶類型' in h: col['type'] = i
        elif '需求項目' in h: col['demand'] = i
        elif '高價值' in h: col['high_value'] = i
        elif '已報價' in h: col['quoted'] = i
        elif '已參訪' in h: col['visited'] = i
        elif '高概率' in h: col['high_prob'] = i
        elif '下一步動作' in h: col['next_action'] = i
        elif '階段結果' in h: col['stage_result'] = i
        elif '備註' in h: col['notes'] = i
        elif '登記人' in h: col['registered_by'] = i

    def get(row, key):
        idx = col.get(key)
        if idx is None or idx >= len(row):
            return ''
        return row[idx].strip()

    created = 0
    skipped = 0
    failed = 0
    errors = []

    for row in rows[header_idx + 1:]:
        name = get(row, 'name')
        company = get(row, 'company')
        if not name and not company:
            continue

        display_name = name or company
        source = get(row, 'source')
        source_channel = SOURCE_MAP.get(source, 'other')
        closed = get(row, 'closed').upper() == 'TRUE'
        quoted = get(row, 'quoted').upper() == 'TRUE'
        visited = get(row, 'visited').upper() == 'TRUE'
        high_value = get(row, 'high_value').upper() == 'TRUE'
        high_prob = get(row, 'high_prob').upper() == 'TRUE'
        stage_result = get(row, 'stage_result')

        # Contact status
        if closed:
            contact_status = 'won'
        elif stage_result in STAGE_MAP:
            contact_status = STAGE_MAP[stage_result]
        elif quoted:
            contact_status = 'quoted'
        else:
            contact_status = 'new'

        # Intent
        if closed: intent = 'purchased'
        elif quoted or high_prob: intent = 'ready_to_buy'
        elif visited or high_value: intent = 'interested'
        else: intent = 'browsing'

        # Notes
        parts = []
        if company: parts.append(f'公司：{company}')
        address = get(row, 'address')
        if address: parts.append(f'地址：{address}')
        demand = get(row, 'demand')
        if demand: parts.append(f'需求：{demand}')
        next_action = get(row, 'next_action')
        if next_action: parts.append(f'下一步：{next_action}')
        if stage_result: parts.append(f'階段：{stage_result}')
        notes_text = get(row, 'notes')
        if notes_text: parts.append(f'備註：{notes_text}')
        registered_by = get(row, 'registered_by')
        if registered_by: parts.append(f'登記人：{registered_by}')
        date_str = get(row, 'date')
        if date_str: parts.append(f'接洽日期：{date_str}')
        if high_value: parts.append('🏷️ 高價值')
        if high_prob: parts.append('🏷️ 高概率')
        if visited: parts.append('✅ 已參訪')
        if quoted: parts.append('✅ 已報價')

        # Preferred products
        preferred = []
        if demand:
            for d in demand.replace('、', ',').split(','):
                d = d.strip()
                if d: preferred.append(d)

        try:
            contact = Contact(
                display_name=display_name,
                source_channel=source_channel,
                source_type='manual',
                contact_status=contact_status,
                intent=intent,
                notes='\n'.join(parts) if parts else None,
                preferred_products=preferred if preferred else None,
            )
            phone = get(row, 'phone')
            email_val = get(row, 'email')
            if phone: contact.phone = phone
            if email_val: contact.email = email_val

            db.session.add(contact)
            created += 1

            # Batch commit every 50
            if created % 50 == 0:
                db.session.commit()

        except Exception as e:
            failed += 1
            if len(errors) < 5:
                errors.append(f'{display_name}: {str(e)}')

    # Final commit
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'資料庫寫入失敗: {str(e)}'}), 500

    logger.info(f'📥 CSV 匯入完成: created={created}, failed={failed}')

    return jsonify({
        'message': f'匯入完成：{created} 筆建立，{failed} 筆失敗',
        'created': created,
        'failed': failed,
        'errors': errors,
    })
