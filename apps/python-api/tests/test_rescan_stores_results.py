"""Regression test for rescan storing updated scan results + findings.

Bug: "detect-secrets library not available - skipping comprehensive secret scan"
     appeared on live skill pages even after detect-secrets was working.
Root cause: The cron rescan endpoint ran the scan pipeline but never stored
            the updated scan_results + scan_findings rows in PostgreSQL.
            It only updated audit_status on the version, leaving stale
            findings from the initial scan visible forever.

This test verifies that rescan.py imports and calls store_scan_results.
"""


class TestRescanStoresResults:
    """Verify that cron rescan stores scan results + findings in the database."""

    def test_rescan_imports_store_scan_results(self):
        """rescan module MUST import store_scan_results — without it, findings go stale."""
        import ast

        with open("api/analyze/rescan.py") as f:
            source = f.read()

        tree = ast.parse(source)

        # Find import statements
        imported_names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                for alias in node.names:
                    imported_names.add(alias.name)

        assert "store_scan_results" in imported_names, (
            "rescan.py MUST import store_scan_results. "
            "Without it, cron rescans never persist updated findings — "
            "causing stale 'detect_secrets_unavailable' warnings to remain in the DB forever."
        )

    def test_rescan_calls_store_scan_results(self):
        """rescan_version function body must call store_scan_results."""
        import ast

        with open("api/analyze/rescan.py") as f:
            source = f.read()

        tree = ast.parse(source)

        # Find the rescan_version function
        rescan_func = None
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "rescan_version":
                rescan_func = node
                break

        assert rescan_func is not None, "rescan_version function must exist"

        # Find all function calls in rescan_version
        called_names = set()
        for node in ast.walk(rescan_func):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    called_names.add(node.func.id)
                elif isinstance(node.func, ast.Attribute):
                    called_names.add(node.func.attr)

        assert "store_scan_results" in called_names, (
            "rescan_version() MUST call store_scan_results(). "
            "Without this call, cron rescans update audit_status but never replace "
            "stale scan_findings rows — so old 'detect_secrets_unavailable' findings persist forever."
        )

    def test_rescan_passes_enriched_findings(self):
        """rescan_version must pass enriched_findings to store_scan_results."""
        import ast

        with open("api/analyze/rescan.py") as f:
            source = f.read()

        tree = ast.parse(source)

        # Find calls to store_scan_results
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = None
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr

                if func_name == "store_scan_results":
                    # Check keyword arguments
                    kwarg_names = {kw.arg for kw in node.keywords if kw.arg}
                    assert "enriched_findings" in kwarg_names, (
                        "store_scan_results() must be called with enriched_findings kwarg. "
                        "This ensures deduplicated + enriched findings replace stale data."
                    )
                    return

        raise AssertionError("store_scan_results call not found in rescan.py")
