"""Temporary negative acceptance probe, removed immediately after gate verification."""
import unittest


class ControlledCiFailure(unittest.TestCase):
    def test_failed_ci_must_not_publish_a_release(self):
        self.fail('Intentional CI/CD acceptance probe: Ubuntu must retain the last healthy release.')
