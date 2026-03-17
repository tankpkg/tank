"""Regression test for detect-secrets library availability.

This test verifies that the detect-secrets library is properly installed
and importable. It was added after a production incident where secrets
scanning was skipped due to an ImportError.

Bug: detect-secrets library not available - skipping comprehensive secret scan
Root cause: Wrong function name in import - used `get_mapping_from_secret_type_to_plugin_class`
            instead of `get_mapping_from_secret_type_to_class`
"""

import pytest


class TestDetectSecretsAvailable:
    """Tests that verify detect-secrets library is available at runtime."""

    def test_detect_secrets_importable(self):
        """detect-secrets library must be importable for Stage 4 secrets scanning."""
        try:
            from detect_secrets.settings import transient_settings

            assert transient_settings is not None
        except ImportError as e:
            pytest.fail(
                f"detect-secrets library not available: {e}. This is a critical dependency for Stage 4 secrets scanning."
            )

    def test_detect_secrets_core_importable(self):
        """detect-secrets core scanning functions must be importable."""
        try:
            from detect_secrets.core.plugins.util import get_mapping_from_secret_type_to_class
            from detect_secrets.core.scan import get_files_to_scan

            assert get_mapping_from_secret_type_to_class is not None
            assert get_files_to_scan is not None
        except ImportError as e:
            pytest.fail(f"detect-secrets core modules not available: {e}")

    def test_detect_secrets_version_via_pip(self):
        """Verify detect-secrets is installed via pip show."""
        import subprocess

        result = subprocess.run(["pip", "show", "detect-secrets"], capture_output=True, text=True)
        assert result.returncode == 0, "detect-secrets not installed"
        assert "detect-secrets" in result.stdout
