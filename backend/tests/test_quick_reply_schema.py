"""Regression tests for quick reply production schema drift guards."""
import unittest
import uuid
from unittest.mock import call, mock_open, patch

from sqlalchemy import text

from app.api.quick_replies import _ensure_quick_reply_schema, _seed_from_json


class QuickReplySchemaGuardTest(unittest.TestCase):
    def test_ensure_quick_reply_schema_adds_backward_compatible_columns(self):
        """Existing production quick_replies tables receive columns added after create_all."""
        with patch('app.api.quick_replies.db.session.execute') as execute, \
             patch('app.api.quick_replies.db.session.commit') as commit:
            _ensure_quick_reply_schema()

        sql_statements = [args[0] for args, _ in execute.call_args_list]
        normalized = [str(stmt).lower() for stmt in sql_statements]

        self.assertTrue(any('add column if not exists attachments' in stmt for stmt in normalized))
        self.assertTrue(any('add column if not exists created_by' in stmt for stmt in normalized))
        self.assertEqual(commit.call_count, 1)

    def test_seed_from_json_ignores_legacy_non_uuid_ids(self):
        """Legacy scripted response IDs like SR-001 must not be inserted into UUID PKs."""
        valid_uuid = uuid.uuid4()
        seed_items = [
            {'id': 'SR-001', 'category': 'dm', 'title': 'Legacy', 'content': 'legacy'},
            {'id': str(valid_uuid), 'category': 'dm', 'title': 'UUID', 'content': 'uuid'},
        ]
        with patch('builtins.open', mock_open(read_data='[]')), \
             patch('app.api.quick_replies.json.load', return_value=seed_items), \
             patch('app.api.quick_replies.QuickReply') as quick_reply, \
             patch('app.api.quick_replies.db.session.add'), \
             patch('app.api.quick_replies.db.session.commit'):
            count = _seed_from_json()

        self.assertEqual(count, 2)
        first_kwargs = quick_reply.call_args_list[0].kwargs
        second_kwargs = quick_reply.call_args_list[1].kwargs
        self.assertNotIn('id', first_kwargs)
        self.assertEqual(second_kwargs['id'], valid_uuid)


if __name__ == '__main__':
    unittest.main()
