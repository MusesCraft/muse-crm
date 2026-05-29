"""Regression tests for high-risk RBAC route boundaries."""
import unittest

from app import create_app, db
from app.models.user import User
from app.utils.auth import generate_token


class RbacRoutesTest(unittest.TestCase):
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
        db.session.query(User).delete()
        db.session.commit()

    def _headers_for_role(self, role: str):
        user = User(
            name=f'{role} QA',
            email=f'{role}@rbac.test',
            role=role,
            is_active=True,
        )
        user.set_password('test-password')
        db.session.add(user)
        db.session.commit()
        return {'Authorization': f'Bearer {generate_token(user)}'}, user

    def test_dashboard_supervisor_endpoints_reject_user_role(self):
        headers, _ = self._headers_for_role('user')
        endpoints = [
            '/dashboard/stats',
            '/dashboard/first-response-time',
            '/dashboard/resolution-rate',
            '/dashboard/escalation-rate',
            '/dashboard/conversation-status',
            '/dashboard/today-conversations',
        ]

        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                response = self.client.get(f'/api/v1{endpoint}', headers=headers)
                self.assertEqual(response.status_code, 403)

    def test_roles_read_endpoints_are_admin_only(self):
        admin_headers, _ = self._headers_for_role('admin')
        manager_headers, manager = self._headers_for_role('manager')
        user_headers, _ = self._headers_for_role('user')

        self.assertEqual(self.client.get('/api/v1/roles', headers=admin_headers).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/roles', headers=manager_headers).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/roles', headers=user_headers).status_code, 403)

        target = str(manager.id)
        self.assertEqual(
            self.client.get(f'/api/v1/users/{target}/roles', headers=admin_headers).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(f'/api/v1/users/{target}/roles', headers=manager_headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(f'/api/v1/users/{target}/roles', headers=user_headers).status_code,
            403,
        )


if __name__ == '__main__':
    unittest.main()
