"""Regression tests for Socket.IO notification namespace auth."""

import unittest
import uuid
import inspect

from app import create_app, db
from app.models import User
from app.realtime.events import _authenticate_ws, handle_connect
from app.utils.auth import generate_token


class RealtimeEventsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app('testing')
        cls.app_context = cls.app.app_context()
        cls.app_context.push()
        db.drop_all()
        db.create_all()

    @classmethod
    def tearDownClass(cls):
        db.session.remove()
        db.drop_all()
        cls.app_context.pop()

    def setUp(self):
        db.session.query(User).delete()
        db.session.commit()
        self.user = User(
            name='Realtime Admin',
            email=f'realtime-{uuid.uuid4()}@example.test',
            role='admin',
            is_active=True,
        )
        self.user.set_password('test-password')
        db.session.add(self.user)
        db.session.commit()
        self.token = generate_token(self.user)

    def test_connect_handler_accepts_socketio_auth_argument(self):
        self.assertIn('auth', inspect.signature(handle_connect).parameters)

    def test_authenticate_ws_accepts_socketio_auth_payload(self):
        with self.app.test_request_context('/socket.io'):
            user = _authenticate_ws({'token': self.token})

        self.assertIsNotNone(user)
        self.assertEqual(str(user.id), str(self.user.id))

    def test_authenticate_ws_accepts_auth_query(self):
        with self.app.test_request_context(f'/socket.io?auth={self.token}'):
            user = _authenticate_ws()

        self.assertIsNotNone(user)
        self.assertEqual(str(user.id), str(self.user.id))

    def test_authenticate_ws_accepts_authorization_header(self):
        with self.app.test_request_context(
            '/socket.io',
            headers={'Authorization': f'Bearer {self.token}'},
        ):
            user = _authenticate_ws()

        self.assertIsNotNone(user)
        self.assertEqual(str(user.id), str(self.user.id))


if __name__ == '__main__':
    unittest.main()
