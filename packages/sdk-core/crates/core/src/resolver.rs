use semver::{Version, VersionReq};

#[derive(Debug, Clone)]
pub struct ResolvedNode {
    pub name: String,
    pub version: String,
}

pub fn resolve_version(available: &[String], range: &str) -> Option<String> {
    let req = VersionReq::parse(range).ok()?;

    let mut candidates: Vec<Version> = available
        .iter()
        .filter_map(|v| Version::parse(v).ok())
        .filter(|v| req.matches(v))
        .collect();

    candidates.sort();

    candidates.last().map(|v| v.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caret_range() {
        let available = vec![
            "1.0.0".to_string(),
            "1.1.0".to_string(),
            "1.2.3".to_string(),
            "2.0.0".to_string(),
        ];
        let result = resolve_version(&available, "^1.0.0");
        assert_eq!(result, Some("1.2.3".to_string()));
    }

    #[test]
    fn tilde_range() {
        let available = vec![
            "1.0.0".to_string(),
            "1.0.5".to_string(),
            "1.1.0".to_string(),
        ];
        let result = resolve_version(&available, "~1.0.0");
        assert_eq!(result, Some("1.0.5".to_string()));
    }

    #[test]
    fn exact_version() {
        let available = vec![
            "1.0.0".to_string(),
            "1.1.0".to_string(),
            "2.0.0".to_string(),
        ];
        let result = resolve_version(&available, "=1.1.0");
        assert_eq!(result, Some("1.1.0".to_string()));
    }

    #[test]
    fn no_match() {
        let available = vec!["1.0.0".to_string(), "1.1.0".to_string()];
        let result = resolve_version(&available, "^2.0.0");
        assert_eq!(result, None);
    }

    #[test]
    fn wildcard_returns_highest() {
        let available = vec![
            "0.1.0".to_string(),
            "1.0.0".to_string(),
            "2.5.3".to_string(),
        ];
        let result = resolve_version(&available, "*");
        assert_eq!(result, Some("2.5.3".to_string()));
    }

    #[test]
    fn gte_range() {
        let available = vec![
            "1.0.0".to_string(),
            "1.5.0".to_string(),
            "2.0.0".to_string(),
        ];
        let result = resolve_version(&available, ">=1.5.0");
        assert_eq!(result, Some("2.0.0".to_string()));
    }

    #[test]
    fn empty_available() {
        let available: Vec<String> = vec![];
        let result = resolve_version(&available, "^1.0.0");
        assert_eq!(result, None);
    }

    #[test]
    fn invalid_range_returns_none() {
        let available = vec!["1.0.0".to_string()];
        let result = resolve_version(&available, "not-a-range!!!");
        assert_eq!(result, None);
    }

    #[test]
    fn skips_invalid_versions() {
        let available = vec![
            "1.0.0".to_string(),
            "not-semver".to_string(),
            "2.0.0".to_string(),
        ];
        let result = resolve_version(&available, "*");
        assert_eq!(result, Some("2.0.0".to_string()));
    }
}
