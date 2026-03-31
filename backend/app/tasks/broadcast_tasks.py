"""
MUSE CRM — Broadcast Tasks

廣播發送的 Celery 背景任務。
"""

import logging
from datetime import datetime, timedelta, timezone

from .. import db, celery
from ..models.broadcast import Broadcast
from ..models import Contact, ContactTag, Tag, ChannelIdentifier
from ..channels.registry import channel_registry

logger = logging.getLogger(__name__)


@celery.task(bind=True, name='crm.tasks.execute_broadcast', max_retries=1)
def execute_broadcast(self, broadcast_id: str):
    """
    執行廣播發送。

    流程：
    1. 查詢符合標籤的客戶
    2. 逐一透過 channel adapter 發送
    3. Meta 有 24h messaging window 限制，只發送近 24h 互動過的客戶
    4. 更新統計
    """
    broadcast = Broadcast.query.get(broadcast_id)
    if not broadcast:
        logger.error(f"廣播不存在: {broadcast_id}")
        return

    if broadcast.status != 'sending':
        logger.warning(f"廣播狀態非 sending，跳過: {broadcast.status}")
        return

    try:
        # 查詢符合條件的客戶
        query = Contact.query.filter(Contact.is_merged == False)

        if broadcast.include_tags:
            include_ids = (
                db.session.query(ContactTag.contact_id)
                .join(Tag, ContactTag.tag_id == Tag.id)
                .filter(Tag.name.in_(broadcast.include_tags))
                .distinct()
                .subquery()
            )
            query = query.filter(Contact.id.in_(include_ids))

        if broadcast.exclude_tags:
            exclude_ids = (
                db.session.query(ContactTag.contact_id)
                .join(Tag, ContactTag.tag_id == Tag.id)
                .filter(Tag.name.in_(broadcast.exclude_tags))
                .distinct()
                .subquery()
            )
            query = query.filter(~Contact.id.in_(exclude_ids))

        contacts = query.all()
        sent = 0
        failed = 0
        skipped = 0
        now = datetime.now(timezone.utc)
        window_24h = now - timedelta(hours=24)

        for contact in contacts:
            # 找客戶的 channel identifiers
            identifiers = ChannelIdentifier.query.filter_by(
                contact_id=contact.id
            ).filter(
                ChannelIdentifier.channel.in_(broadcast.target_channels)
            ).all()

            if not identifiers:
                skipped += 1
                continue

            contact_sent = False
            for ci in identifiers:
                try:
                    # Meta 渠道 24h 限制
                    adapter_name = 'meta' if ci.channel in ('messenger', 'instagram') else ci.channel
                    if adapter_name == 'meta':
                        if not contact.last_active_at or contact.last_active_at.replace(tzinfo=timezone.utc) < window_24h:
                            logger.debug(
                                f"跳過 {contact.id}：Meta 24h window 外"
                            )
                            continue

                    adapter = channel_registry.get_adapter(adapter_name)
                    if not adapter:
                        continue

                    # 發送文字
                    adapter.send_message(ci.external_id, broadcast.content)

                    # 發送圖片（如果有）
                    if broadcast.image_url:
                        adapter.send_image(ci.external_id, broadcast.image_url)

                    contact_sent = True
                    break  # 每個客戶只透過一個渠道發送

                except Exception as send_err:
                    logger.warning(
                        f"廣播發送失敗 contact={contact.id} channel={ci.channel}: {send_err}"
                    )
                    continue

            if contact_sent:
                sent += 1
            else:
                failed += 1

        # 更新統計
        broadcast.sent_count = sent
        broadcast.failed_count = failed
        broadcast.status = 'completed'
        broadcast.sent_at = datetime.now(timezone.utc)
        db.session.commit()

        logger.info(
            f"📢 廣播完成: {broadcast_id}, "
            f"sent={sent}, failed={failed}, skipped={skipped}"
        )

    except Exception as e:
        logger.error(f"廣播執行失敗: {broadcast_id}: {e}", exc_info=True)
        broadcast.status = 'failed'
        db.session.commit()
        raise
