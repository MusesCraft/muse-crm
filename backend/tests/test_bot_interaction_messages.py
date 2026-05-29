"""Regression tests for bot interactive message safety."""

import unittest

from app import create_app, db
from app.models import Contact, Conversation, Message, User
from app.utils.auth import generate_token


class BotInteractionMessageTest(unittest.TestCase):
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

        self.user = User(
            name='Bot QA Admin',
            email='bot-qa-admin@example.test',
            role='admin',
            is_active=True,
        )
        self.user.set_password('test-password')
        self.contact = Contact(
            display_name='Bot Button Customer',
            source_channel='telegram',
            source_type='organic',
        )
        db.session.add_all([self.user, self.contact])
        db.session.commit()

        self.conversation = Conversation(
            contact_id=self.contact.id,
            channel='telegram',
            status='active',
            message_count=0,
        )
        db.session.add(self.conversation)
        db.session.commit()

        self.headers = {'Authorization': f'Bearer {generate_token(self.user)}'}

    def test_unsupported_outbound_message_type_returns_400(self):
        cases = [
            {'message_type': 'callback_query', 'content': 'pressed a button'},
            {'message_type': ['interactive'], 'content': {'text': 'invalid'}},
        ]

        for payload in cases:
            with self.subTest(payload=payload):
                response = self.client.post(
                    f'/api/v1/inbox/conversations/{self.conversation.id}/send',
                    headers=self.headers,
                    json=payload,
                )

                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json(), {'error': '不支援的訊息類型'})

        self.assertEqual(Message.query.count(), 0)

    def test_conversation_detail_serializes_interactive_message(self):
        message = Message(
            conversation_id=self.conversation.id,
            contact_id=self.contact.id,
            sender_type='customer',
            message_type='interactive',
            content='請選擇服務',
            message_metadata={
                'reply_markup': {
                    'inline_keyboard': [
                        [
                            {'text': '預約丈量', 'callback_data': 'book_measurement'},
                            {'text': '查看報價', 'callback_data': 'view_quote'},
                        ],
                    ],
                },
            },
        )
        db.session.add(message)
        db.session.commit()

        response = self.client.get(
            f'/api/v1/inbox/conversations/{self.conversation.id}',
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['messages'][0]['message_type'], 'interactive')
        self.assertEqual(
            body['messages'][0]['interactive_payload']['reply_markup']['inline_keyboard'][0][0]['text'],
            '預約丈量',
        )
        self.assertEqual(
            body['messages'][0]['metadata']['reply_markup']['inline_keyboard'][0][1]['callback_data'],
            'view_quote',
        )


if __name__ == '__main__':
    unittest.main()
