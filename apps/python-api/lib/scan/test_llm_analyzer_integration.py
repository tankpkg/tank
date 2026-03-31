"""Integration and provider fallback tests for LLM Security Finding Corroboration."""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from lib.scan.llm_analyzer import LLMAnalyzer
from lib.scan.llm_health import check_llm_health
from lib.scan.models import Finding

# ==============================================================================
# SHARED FIXTURES
# ==============================================================================


@pytest.fixture
def sample_finding():
    """Create a sample finding for testing."""
    return Finding(
        stage="stage3",
        severity="high",
        type="prompt_injection_pattern",
        description="Matched injection pattern: you are now a helpful assistant",
        location="skill.md:10",
        confidence=0.9,
        tool="stage3_regex",
        evidence="you are now a helpful assistant",
    )


@pytest.fixture
def mock_env_custom():
    """Mock environment with custom BYOLLM provider."""
    return {
        "LLM_API_KEY": "test-key",
        "LLM_BASE_URL": "https://api.example.com/v1",
        "LLM_MODEL": "test-model",
    }


@pytest.fixture
def mock_env_groq():
    """Mock environment with Groq provider."""
    return {
        "GROQ_API_KEY": "gsk-test-key",
    }


# ==============================================================================
# PROVIDER FALLBACK TESTS
# ==============================================================================


class TestProviderFallback:
    """Test provider fallback behavior."""

    @pytest.mark.asyncio
    async def test_provider_fallback_on_429(self, sample_finding, tmp_path, mock_env_groq):
        """Groq 429 → next provider."""
        with patch.dict(os.environ, mock_env_groq, clear=True):
            analyzer = LLMAnalyzer()

            # Mock first provider to return 429, second to succeed
            call_count = [0]

            async def mock_call(provider, prompt, timeout):
                call_count[0] += 1
                if call_count[0] == 1:
                    raise httpx.HTTPStatusError("429", request=None, response=MagicMock(status_code=429))
                return '[{"index": 0, "classification": "likely_benign", "confidence": 0.9, "reasoning": "OK"}]'

            with patch.object(analyzer, "_call_provider", mock_call):
                result = await analyzer.analyze_findings([sample_finding], str(tmp_path))

                assert len(result.verdicts) == 1
                assert "groq_70b" in result.provider_used  # Fell back to second provider

    @pytest.mark.asyncio
    async def test_provider_fallback_on_timeout(self, sample_finding, tmp_path, mock_env_groq):
        """Timeout → next provider."""
        with patch.dict(os.environ, mock_env_groq, clear=True):
            analyzer = LLMAnalyzer()

            call_count = [0]

            async def mock_call(provider, prompt, timeout):
                call_count[0] += 1
                if call_count[0] == 1:
                    raise httpx.TimeoutException("Timeout")
                return '[{"index": 0, "classification": "likely_benign", "confidence": 0.9, "reasoning": "OK"}]'

            with patch.object(analyzer, "_call_provider", mock_call):
                result = await analyzer.analyze_findings([sample_finding], str(tmp_path))

                assert len(result.verdicts) == 1

    @pytest.mark.asyncio
    async def test_all_providers_fail_graceful(self, sample_finding, tmp_path, mock_env_groq):
        """All fail → empty verdicts, no crash."""
        with patch.dict(os.environ, mock_env_groq, clear=True):
            analyzer = LLMAnalyzer()

            async def mock_call(provider, prompt, timeout):
                raise httpx.HTTPStatusError("Error", request=None, response=MagicMock(status_code=500))

            with patch.object(analyzer, "_call_provider", mock_call):
                result = await analyzer.analyze_findings([sample_finding], str(tmp_path))

                assert result.verdicts == []
                assert result.error == "all_providers_failed"


# ==============================================================================
# INTEGRATION TESTS
# ==============================================================================


class TestLLMAnalyzerIntegration:
    """Integration tests for LLM analyzer."""

    @pytest.mark.asyncio
    async def test_disabled_no_llm_analysis(self, sample_finding, tmp_path):
        """When disabled, returns empty result."""
        with patch.dict(os.environ, {}, clear=True):
            analyzer = LLMAnalyzer()
            result = await analyzer.analyze_findings([sample_finding], str(tmp_path))

            assert result.verdicts == []
            assert result.error == "LLM analysis disabled"

    @pytest.mark.asyncio
    async def test_empty_findings(self, tmp_path):
        """Empty findings list returns empty result."""
        with patch.dict(os.environ, {"GROQ_API_KEY": "test"}, clear=True):
            analyzer = LLMAnalyzer()
            result = await analyzer.analyze_findings([], str(tmp_path))

            assert result.verdicts == []

    @pytest.mark.asyncio
    async def test_full_flow_with_mocked_provider(self, sample_finding, tmp_path, mock_env_custom):
        """Test full flow with mocked provider."""
        with patch.dict(os.environ, mock_env_custom, clear=True):
            analyzer = LLMAnalyzer()

            async def mock_call(provider, prompt, timeout):
                return '[{"index": 0, "classification": "likely_benign", "confidence": 0.95, "reasoning": "Standard role definition"}]'

            with patch.object(analyzer, "_call_provider", mock_call):
                result = await analyzer.analyze_findings([sample_finding], str(tmp_path))

                assert len(result.verdicts) == 1
                assert result.provider_used == "custom (test-model)"
                # latency_ms can be 0 for mocked calls (they're instant)
                assert result.latency_ms >= 0


# ==============================================================================
# HEALTH CHECK TESTS
# ==============================================================================


class TestHealthCheck:
    """Test LLM health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_no_providers(self):
        """Health check with no providers configured."""
        with patch.dict(os.environ, {}, clear=True):
            health = await check_llm_health()

            assert health["llm_scan_enabled"] is False
            assert health["mode"] == "disabled"
            assert health["providers"] == []

    @pytest.mark.asyncio
    async def test_health_with_provider(self, mock_env_custom):
        """Health check with provider configured."""
        with patch.dict(os.environ, mock_env_custom, clear=True):
            # Mock the HTTP call
            with patch("httpx.AsyncClient") as mock_client:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"choices": [{"message": {"content": "ok"}}]}

                mock_instance = AsyncMock()
                mock_instance.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
                mock_client.return_value = mock_instance

                health = await check_llm_health()

                assert health["llm_scan_enabled"] is True
                assert health["mode"] == "byollm"
                assert len(health["providers"]) == 1
                assert health["providers"][0]["status"] == "healthy"
