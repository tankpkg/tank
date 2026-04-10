"""Regression test for stage0_ingest size check ordering.

Bug: Large monorepos (e.g. shadcn-ui/ui, microsoft/azure-skills) exceeded the
     50MB extracted size limit BEFORE sub_path narrowing ran, causing scan failures.
     The sub_path mechanism narrows extraction to a small subdirectory, but the size
     check ran on the full repo.

Fix: narrow_to_sub_path() now runs BEFORE the extracted size check, so the limit
     applies to the narrowed subdirectory, not the full repo.
"""


class TestStage0IngestOrdering:
    """Verify that sub_path narrowing happens before the size check."""

    def test_narrow_before_size_check(self):
        """Verify narrow_to_sub_path is called before size_exceeded check."""
        import ast
        import inspect

        from lib.scan.stage0_ingest import stage0_ingest

        source = inspect.getsource(stage0_ingest)
        tree = ast.parse(source)

        # Find all function calls and their line numbers
        call_positions = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = None
                if isinstance(node.func, ast.Name):
                    name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    name = node.func.attr
                if name:
                    if name not in call_positions:
                        call_positions[name] = []
                    call_positions[name].append(node.lineno)

        # Verify narrow_to_sub_path exists in the source
        assert "narrow_to_sub_path" in call_positions, "narrow_to_sub_path not found in stage0_ingest"

        # Find the size_exceeded finding (the string literal in the size check)
        size_exceeded_line = None
        narrow_line = None
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and "exceeds maximum" in node.value:
                size_exceeded_line = node.lineno
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "narrow_to_sub_path":
                narrow_line = node.lineno

        assert narrow_line is not None, "narrow_to_sub_path call not found"
        assert size_exceeded_line is not None, "size_exceeded check not found"
        assert narrow_line < size_exceeded_line, (
            f"narrow_to_sub_path (line {narrow_line}) must come before "
            f"size check (line {size_exceeded_line})"
        )

    def test_max_tarball_size_is_100mb(self):
        """Verify MAX_TARBALL_SIZE was raised to 100MB."""
        from lib.scan.stage0_ingest import MAX_TARBALL_SIZE

        assert MAX_TARBALL_SIZE == 100 * 1024 * 1024
