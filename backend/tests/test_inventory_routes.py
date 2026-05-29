"""Regression tests for inventory proxy compatibility routes."""
import unittest

from app import create_app


class InventoryProxyRoutesTest(unittest.TestCase):
    def test_base_inventory_route_is_registered_for_legacy_smoke_checks(self):
        app = create_app('testing')
        rules = {rule.rule for rule in app.url_map.iter_rules()}
        self.assertIn('/api/v1/inventory', rules)
        self.assertIn('/api/v1/inventory/overview', rules)
        self.assertIn('/api/v1/inventory/products', rules)


if __name__ == '__main__':
    unittest.main()
