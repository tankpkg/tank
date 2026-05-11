"""Regression: typosquat detection must not flag legitimate popular packages.

Bug (prod): scanning a Next.js skill flagged ``react`` as a HIGH-severity typosquat
of ``preact`` (distance 1). Both names live in ``POPULAR_NPM_PACKAGES``, but
Python's ``set`` iteration order is implementation-defined. ``check_typosquatting``
returned on the first distance-1 match it encountered, which could be ``preact``
before the loop ever reached the ``react`` exact-match check.

Fix: short-circuit when the input itself is in the popular set, and iterate in
sorted order so results are stable across runs and Python versions.
"""

from lib.scan.stage5_helpers import (
    POPULAR_NPM_PACKAGES,
    POPULAR_PYTHON_PACKAGES,
    check_typosquatting,
)


class TestPopularPackagesAreNotTyposquats:
    def test_react_not_flagged_as_preact(self) -> None:
        assert check_typosquatting("react", POPULAR_NPM_PACKAGES) is None

    def test_preact_not_flagged_as_react(self) -> None:
        assert check_typosquatting("preact", POPULAR_NPM_PACKAGES) is None

    def test_next_not_flagged_as_nuxt(self) -> None:
        assert check_typosquatting("next", POPULAR_NPM_PACKAGES) is None

    def test_nuxt_not_flagged_as_next(self) -> None:
        assert check_typosquatting("nuxt", POPULAR_NPM_PACKAGES) is None

    def test_redux_not_flagged_as_redis(self) -> None:
        assert check_typosquatting("redux", POPULAR_NPM_PACKAGES) is None

    def test_redis_not_flagged_as_redux(self) -> None:
        assert check_typosquatting("redis", POPULAR_NPM_PACKAGES) is None

    def test_every_popular_npm_package_is_safe(self) -> None:
        offenders: list[tuple[str, str, int]] = []
        for pkg in POPULAR_NPM_PACKAGES:
            result = check_typosquatting(pkg, POPULAR_NPM_PACKAGES)
            if result is not None:
                offenders.append((pkg, result[0], result[1]))
        assert not offenders, f"Popular npm packages flagged as typosquats: {offenders}"

    def test_every_popular_python_package_is_safe(self) -> None:
        offenders: list[tuple[str, str, int]] = []
        for pkg in POPULAR_PYTHON_PACKAGES:
            result = check_typosquatting(pkg, POPULAR_PYTHON_PACKAGES)
            if result is not None:
                offenders.append((pkg, result[0], result[1]))
        assert not offenders, f"Popular Python packages flagged as typosquats: {offenders}"


class TestRealTyposquatsStillCaught:
    def test_reqeusts_flagged_as_requests(self) -> None:
        result = check_typosquatting("reqeusts", POPULAR_PYTHON_PACKAGES)
        assert result is not None
        original, distance = result
        assert original == "requests"
        assert distance <= 2

    def test_lodaash_flagged_as_lodash(self) -> None:
        result = check_typosquatting("lodaash", POPULAR_NPM_PACKAGES)
        assert result is not None
        assert result[0] == "lodash"

    def test_expres_flagged_as_express(self) -> None:
        result = check_typosquatting("expres", POPULAR_NPM_PACKAGES)
        assert result is not None
        assert result[0] == "express"

    def test_axioss_flagged_as_axios(self) -> None:
        result = check_typosquatting("axioss", POPULAR_NPM_PACKAGES)
        assert result is not None
        assert result[0] == "axios"


class TestNonMatches:
    def test_unknown_package_returns_none(self) -> None:
        assert check_typosquatting("my-cool-unique-skill", POPULAR_NPM_PACKAGES) is None

    def test_completely_different_name(self) -> None:
        assert check_typosquatting("zzz-something-totally-unrelated", POPULAR_NPM_PACKAGES) is None

    def test_empty_popular_set(self) -> None:
        assert check_typosquatting("react", set()) is None


class TestCaseInsensitivity:
    def test_uppercase_react_not_flagged(self) -> None:
        assert check_typosquatting("REACT", POPULAR_NPM_PACKAGES) is None

    def test_mixed_case_react_not_flagged(self) -> None:
        assert check_typosquatting("React", POPULAR_NPM_PACKAGES) is None


class TestDeterminism:
    def test_popular_package_stable_across_calls(self) -> None:
        results = {check_typosquatting("react", POPULAR_NPM_PACKAGES) for _ in range(50)}
        assert results == {None}

    def test_typosquat_match_stable_across_calls(self) -> None:
        results = {check_typosquatting("reqeusts", POPULAR_PYTHON_PACKAGES) for _ in range(50)}
        assert len(results) == 1, f"Non-deterministic typosquat match: {results}"
