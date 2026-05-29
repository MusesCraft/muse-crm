"""Regression tests for inbox message action APIs."""

import unittest
import uuid
from unittest.mock import patch

from app import create_app, db
from app.models import Contact, Conversation, Message, User
from app.utils.auth import generate_token


class MessageActionsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app('testing')
        cls.app_context = cls.app.app_context()
        cls.app_context.push()
        db.drop_all()
        db.create_all()
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        db.session.remove()
        db.drop_all()
        cls.app_context.pop()

    def setUp(self):
        db.session.query(Message).delete()
        db.session.query(Conversation).delete()
        db.session.query(Contact).delete()
        db.session.query(User).delete()
        db.session.commit()

        self.admin = self._user('admin')
        self.agent = self._user('user')
        self.other_agent = self._user('user', email='other-message-actions@example.test')

        self.telegram_contact = Contact(
            display_name='Telegram Customer',
            source_channel='telegram',
            source_type='organic',
        )
        self.line_contact = Contact(
            display_name='LINE Customer',
            source_channel='line',
            source_type='organic',
        )
        db.session.add_all([self.telegram_contact, self.line_contact])
        db.session.commit()

        self.telegram_conversation = self._conversation(self.telegram_contact, 'telegram')
        self.line_conversation = self._conversation(self.line_contact, 'line')
        self.telegram_message = self._message(self.telegram_conversation, sender_type='business', content='Telegram outbound')
        self.telegram_customer_message = self._message(self.telegram_conversation, sender_type='customer', content='Telegram inbound')
        self.line_message = self._message(self.line_conversation, sender_type='business', content='LINE outbound')

        self.admin_headers = self._headers(self.admin)
        self.agent_headers = self._headers(self.agent)

    def _user(self, role: str, email: str | None = None):
        user = User(
            name=f'{role} Message Action',
            email=email or f'{role}-{uuid.uuid4()}@message-action.test',
            role=role,
            is_active=True,
        )
        user.set_password('test-password')
        db.session.add(user)
        db.session.commit()
        return user

    def _headers(self, user: User):
        return {'Authorization': f'Bearer {generate_token(user)}'}

    def _conversation(self, contact: Contact, channel: str):
        conversation = Conversation(
            contact_id=contact.id,
            channel=channel,
            status='active',
            message_count=0,
        )
        db.session.add(conversation)
        db.session.commit()
        return conversation

    def _message(self, conversation: Conversation, sender_type='business', content='hello'):
        message = Message(
            conversation_id=conversation.id,
            contact_id=conversation.contact_id,
            sender_type=sender_type,
            message_type='text',
            content=content,
        )
        db.session.add(message)
        db.session.commit()
        return message

    def test_missing_message_action_returns_404(self):
        response = self.client.post(
            f'/api/v1/inbox/messages/{uuid.uuid4()}/reactions',
            headers=self.admin_headers,
            json={'emoji': '👍'},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()['error'], '訊息不存在')

    def test_non_telegram_message_action_returns_400(self):
        response = self.client.post(
            f'/api/v1/inbox/messages/{self.line_message.id}/pin',
            headers=self.admin_headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '此操作僅支援 Telegram 對話')

    def test_message_action_scope_returns_403(self):
        self.telegram_contact.assigned_to = self.other_agent.id
        db.session.commit()

        response = self.client.post(
            f'/api/v1/inbox/messages/{self.telegram_message.id}/pin',
            headers=self.agent_headers,
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json()['error'], '權限不足')

    def test_telegram_reaction_pin_edit_delete_flow_returns_2xx_and_serializes(self):
        reaction = self.client.post(
            f'/api/v1/inbox/messages/{self.telegram_message.id}/reactions',
            headers=self.admin_headers,
            json={'emoji': '👍'},
        )
        self.assertEqual(reaction.status_code, 200)
        body = reaction.get_json()
        self.assertFalse(body['platform_supported'])
        self.assertEqual(body['platform_message'], '尚未支援 Telegram 原生操作')
        self.assertEqual(body['data']['reactions']['👍'], [str(self.admin.id)])

        pinned = self.client.post(
            f'/api/v1/inbox/messages/{self.telegram_message.id}/pin',
            headers=self.admin_headers,
        )
        self.assertEqual(pinned.status_code, 200)
        self.assertIsNotNone(pinned.get_json()['data']['pinned_at'])

        edited = self.client.patch(
            f'/api/v1/inbox/messages/{self.telegram_message.id}',
            headers=self.admin_headers,
            json={'content': 'Edited Telegram outbound'},
        )
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.get_json()['data']['content'], 'Edited Telegram outbound')
        self.assertIsNotNone(edited.get_json()['data']['edited_at'])

        deleted = self.client.delete(
            f'/api/v1/inbox/messages/{self.telegram_message.id}',
            headers=self.admin_headers,
            json={'deleted_for': 'everyone'},
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertIsNotNone(deleted.get_json()['data']['deleted_at'])
        self.assertEqual(deleted.get_json()['data']['deleted_for'], ['everyone'])

    def test_customer_message_edit_is_rejected(self):
        response = self.client.patch(
            f'/api/v1/inbox/messages/{self.telegram_customer_message.id}',
            headers=self.admin_headers,
            json={'content': 'edited inbound'},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], '只能編輯我方訊息')

    def test_conversation_read_unread_returns_2xx(self):
        read = self.client.post(
            f'/api/v1/inbox/conversations/{self.line_conversation.id}/read',
            headers=self.admin_headers,
        )
        self.assertEqual(read.status_code, 200)
        self.assertTrue(Message.query.get(self.line_message.id).is_read)

        unread = self.client.post(
            f'/api/v1/inbox/conversations/{self.line_conversation.id}/unread',
            headers=self.admin_headers,
        )
        self.assertEqual(unread.status_code, 200)
        self.assertFalse(Message.query.get(self.line_message.id).is_read)

    def test_send_message_supports_reply_to_message_id(self):
        response = self.client.post(
            f'/api/v1/inbox/conversations/{self.telegram_conversation.id}/send',
            headers=self.admin_headers,
            json={
                'message_type': 'text',
                'content': 'Reply text',
                'reply_to_message_id': str(self.telegram_customer_message.id),
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['data']['reply_to_message_id'], str(self.telegram_customer_message.id))

    def test_send_message_emits_new_message_after_commit(self):
        with patch('app.api.inbox.emit_new_message') as emit:
            response = self.client.post(
                f'/api/v1/inbox/conversations/{self.line_conversation.id}/send',
                headers=self.admin_headers,
                json={
                    'message_type': 'text',
                    'content': 'Outbound realtime test',
                    'is_internal': True,
                },
            )

        self.assertEqual(response.status_code, 200)
        emit.assert_called_once()
        emitted_message = emit.call_args.kwargs['message']
        emitted_conversation = emit.call_args.kwargs['conversation']
        emitted_contact = emit.call_args.kwargs['contact']
        self.assertIsNotNone(emitted_message.id)
        self.assertIsNotNone(db.session.get(Message, emitted_message.id))
        self.assertEqual(str(emitted_conversation.id), str(self.line_conversation.id))
        self.assertEqual(str(emitted_contact.id), str(self.line_contact.id))

    def test_send_image_message_emits_new_message_after_commit(self):
        with patch('app.api.inbox.emit_new_message') as emit:
            response = self.client.post(
                f'/api/v1/inbox/conversations/{self.line_conversation.id}/send-image',
                headers=self.admin_headers,
                json={
                    'image_url': 'https://example.test/image.png',
                    'caption': 'Image realtime test',
                },
            )

        self.assertEqual(response.status_code, 200)
        emit.assert_called_once()
        emitted_message = emit.call_args.kwargs['message']
        self.assertIsNotNone(emitted_message.id)
        self.assertEqual(emitted_message.message_type, 'image')
        self.assertIsNotNone(db.session.get(Message, emitted_message.id))

    def test_send_message_emit_failure_does_not_fail_response(self):
        with patch('app.api.inbox.emit_new_message', side_effect=RuntimeError('socket down')):
            response = self.client.post(
                f'/api/v1/inbox/conversations/{self.line_conversation.id}/send',
                headers=self.admin_headers,
                json={
                    'message_type': 'text',
                    'content': 'Emit failure fallback',
                    'is_internal': True,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['data']['content'], 'Emit failure fallback')

    def test_forward_message_creates_target_conversation_record(self):
        target_contact = Contact(
            display_name='Forward Target',
            source_channel='telegram',
            source_type='organic',
        )
        db.session.add(target_contact)
        db.session.commit()
        target_conversation = self._conversation(target_contact, 'telegram')

        response = self.client.post(
            f'/api/v1/inbox/messages/{self.telegram_message.id}/forward',
            headers=self.admin_headers,
            json={'target_conversation_id': str(target_conversation.id)},
        )

        self.assertEqual(response.status_code, 201)
        body = response.get_json()
        self.assertFalse(body['platform_supported'])
        self.assertEqual(body['data']['conversation_id'], str(target_conversation.id))
        self.assertEqual(
            body['data']['message_metadata']['forwarded_from_message_id'],
            str(self.telegram_message.id),
        )

    def test_typing_guard_for_non_telegram_and_telegram_without_adapter(self):
        non_telegram = self.client.post(
            f'/api/v1/inbox/conversations/{self.line_conversation.id}/typing',
            headers=self.admin_headers,
        )
        self.assertEqual(non_telegram.status_code, 400)
        self.assertEqual(non_telegram.get_json()['error'], '此操作僅支援 Telegram 對話')

        telegram = self.client.post(
            f'/api/v1/inbox/conversations/{self.telegram_conversation.id}/typing',
            headers=self.admin_headers,
        )
        self.assertEqual(telegram.status_code, 501)
        self.assertEqual(telegram.get_json()['message'], '尚未支援 Telegram 原生操作')


if __name__ == '__main__':
    unittest.main()
