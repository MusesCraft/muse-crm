"""
MUSE CRM — Data Health Service

資料健康檢查與自動修復服務。
"""

import logging
from typing import Any, Dict

from sqlalchemy import text

from .. import db
from ..models import Contact, Conversation, Message
from ..models.contact import ChannelIdentifier
from ..services.auto_tagger import AutoTagger
from ..utils.meta_api import MetaGraphAPI

logger = logging.getLogger(__name__)

meta_api = MetaGraphAPI()


class DataHealthService:
    """資料健康檢查與自動修復"""

    @staticmethod
    def run_full_check() -> dict:
        """
        全面資料健康檢查，回傳問題清單和自動修復結果。

        Returns:
            {issues_found, issues_fixed, details: [...]}
        """
        result = {
            'issues_found': 0,
            'issues_fixed': 0,
            'details': [],
        }

        # 1. 修復缺失名稱
        try:
            missing_names = Contact.query.filter(
                Contact.display_name.is_(None),
                Contact.is_merged == False,
            ).count()
            if missing_names > 0:
                result['issues_found'] += missing_names
                fixed = DataHealthService.fix_missing_names()
                result['issues_fixed'] += fixed
                result['details'].append({
                    'check': 'missing_names',
                    'found': missing_names,
                    'fixed': fixed,
                })
        except Exception as e:
            logger.error(f"fix_missing_names 失敗: {e}", exc_info=True)
            result['details'].append({
                'check': 'missing_names',
                'error': str(e),
            })

        # 2. 修復孤兒 conversations
        try:
            orphan_count = DataHealthService._count_orphan_conversations()
            if orphan_count > 0:
                result['issues_found'] += orphan_count
                fixed = DataHealthService.fix_orphan_conversations()
                result['issues_fixed'] += fixed
                result['details'].append({
                    'check': 'orphan_conversations',
                    'found': orphan_count,
                    'fixed': fixed,
                })
        except Exception as e:
            logger.error(f"fix_orphan_conversations 失敗: {e}", exc_info=True)
            result['details'].append({
                'check': 'orphan_conversations',
                'error': str(e),
            })

        # 3. 修復 message_count
        try:
            mismatched = DataHealthService._count_mismatched_message_counts()
            if mismatched > 0:
                result['issues_found'] += mismatched
                fixed = DataHealthService.fix_message_counts()
                result['issues_fixed'] += fixed
                result['details'].append({
                    'check': 'message_counts',
                    'found': mismatched,
                    'fixed': fixed,
                })
        except Exception as e:
            logger.error(f"fix_message_counts 失敗: {e}", exc_info=True)
            result['details'].append({
                'check': 'message_counts',
                'error': str(e),
            })

        # 4. 關鍵字打標
        try:
            tag_result = DataHealthService.run_keyword_tagging()
            if tag_result.get('total_tags_added', 0) > 0:
                result['issues_fixed'] += tag_result['total_tags_added']
            result['details'].append({
                'check': 'keyword_tagging',
                **tag_result,
            })
        except Exception as e:
            logger.error(f"run_keyword_tagging 失敗: {e}", exc_info=True)
            result['details'].append({
                'check': 'keyword_tagging',
                'error': str(e),
            })

        # 5. 驗證 channel_identifiers
        try:
            ci_result = DataHealthService.validate_channel_identifiers()
            if ci_result.get('missing_external_id', 0) > 0:
                result['issues_found'] += ci_result['missing_external_id']
            result['details'].append({
                'check': 'channel_identifiers',
                **ci_result,
            })
        except Exception as e:
            logger.error(f"validate_channel_identifiers 失敗: {e}", exc_info=True)
            result['details'].append({
                'check': 'channel_identifiers',
                'error': str(e),
            })

        logger.info(f"資料健康檢查完成: found={result['issues_found']}, fixed={result['issues_fixed']}")
        return result

    @staticmethod
    def fix_missing_names() -> int:
        """
        修復 display_name 為 None 的 contacts（從 Meta API 拉取）。

        Returns:
            修復的 contact 數量
        """
        contacts = Contact.query.filter(
            Contact.display_name.is_(None),
            Contact.is_merged == False,
        ).all()

        updated = 0
        for contact in contacts:
            for ci in contact.channel_identifiers:
                if ci.channel in ('messenger', 'instagram'):
                    try:
                        profile = meta_api.get_user_profile(ci.external_id)
                        if profile and profile.get('name'):
                            contact.display_name = profile['name']
                            updated += 1
                            logger.info(f"修復 display_name: {ci.external_id} → {profile['name']}")
                            break
                    except Exception as e:
                        logger.debug(f"拉取 profile 失敗 ({ci.external_id}): {e}")

        if updated:
            db.session.commit()
            logger.info(f"fix_missing_names 完成，更新 {updated} 個 contacts")

        return updated

    @staticmethod
    def fix_orphan_conversations() -> int:
        """
        修復沒有 contact 的 conversations。
        將 contact_id 指向不存在 contact 的 conversations 關閉。

        Returns:
            修復的 conversation 數量
        """
        # 找出 contact_id 不在 contacts 表的 conversations
        orphans = Conversation.query.filter(
            ~Conversation.contact_id.in_(
                db.session.query(Contact.id)
            )
        ).all()

        fixed = 0
        for conv in orphans:
            conv.status = 'closed'
            fixed += 1
            logger.warning(f"關閉孤兒 conversation: {conv.id} (contact_id={conv.contact_id})")

        if fixed:
            db.session.commit()
            logger.info(f"fix_orphan_conversations 完成，關閉 {fixed} 個孤兒 conversations")

        return fixed

    @staticmethod
    def fix_message_counts() -> int:
        """
        重新計算所有 conversation 的 message_count。

        Returns:
            修復的 conversation 數量
        """
        result = db.session.execute(text("""
            UPDATE conversations
            SET message_count = sub.cnt
            FROM (
                SELECT conversation_id, COUNT(*) AS cnt
                FROM messages
                GROUP BY conversation_id
            ) sub
            WHERE conversations.id = sub.conversation_id
              AND conversations.message_count != sub.cnt
        """))

        fixed = result.rowcount
        db.session.commit()

        if fixed:
            logger.info(f"fix_message_counts 完成，更新 {fixed} 個 conversations")

        return fixed

    @staticmethod
    def run_keyword_tagging() -> dict:
        """
        對所有 conversation 跑關鍵字打標。

        Returns:
            打標統計
        """
        conversations = Conversation.query.all()
        stats = {
            'total_conversations': len(conversations),
            'tagged_conversations': 0,
            'total_tags_added': 0,
        }

        for conv in conversations:
            messages = Message.query.filter_by(conversation_id=conv.id).all()
            conversation_text = ' '.join(
                m.content for m in messages if m.content
            )
            if not conversation_text.strip():
                continue

            keyword_tags = AutoTagger._match_keywords(conversation_text)
            if keyword_tags:
                added = AutoTagger._apply_tags(conv.contact_id, keyword_tags)
                if added:
                    stats['tagged_conversations'] += 1
                    stats['total_tags_added'] += len(added)

        db.session.commit()
        logger.info(f"run_keyword_tagging 完成: {stats}")
        return stats

    @staticmethod
    def validate_channel_identifiers() -> dict:
        """
        檢查 channel_identifiers 是否完整。

        Returns:
            檢查結果
        """
        total = ChannelIdentifier.query.count()

        # 缺少 external_id
        missing_external_id = ChannelIdentifier.query.filter(
            (ChannelIdentifier.external_id.is_(None)) |
            (ChannelIdentifier.external_id == '')
        ).count()

        # 缺少 channel
        missing_channel = ChannelIdentifier.query.filter(
            (ChannelIdentifier.channel.is_(None)) |
            (ChannelIdentifier.channel == '')
        ).count()

        # 沒有對應 contact 的 channel_identifiers
        orphan_cis = ChannelIdentifier.query.filter(
            ~ChannelIdentifier.contact_id.in_(
                db.session.query(Contact.id)
            )
        ).count()

        result = {
            'total': total,
            'missing_external_id': missing_external_id,
            'missing_channel': missing_channel,
            'orphan_identifiers': orphan_cis,
        }

        logger.info(f"validate_channel_identifiers 完成: {result}")
        return result

    # ── Private helpers ──

    @staticmethod
    def _count_orphan_conversations() -> int:
        """計算孤兒 conversations 數量"""
        return Conversation.query.filter(
            ~Conversation.contact_id.in_(
                db.session.query(Contact.id)
            )
        ).count()

    @staticmethod
    def _count_mismatched_message_counts() -> int:
        """計算 message_count 不正確的 conversations 數量"""
        result = db.session.execute(text("""
            SELECT COUNT(*) FROM conversations c
            WHERE c.message_count != (
                SELECT COUNT(*) FROM messages m
                WHERE m.conversation_id = c.id
            )
        """))
        return result.scalar() or 0
