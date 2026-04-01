use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Permissions {
    pub network: Option<NetworkPermissions>,
    pub filesystem: Option<FilesystemPermissions>,
    pub subprocess: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkPermissions {
    pub outbound: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilesystemPermissions {
    pub read: Option<Vec<String>>,
    pub write: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct PermissionViolation {
    pub skill_name: String,
    pub violation_type: String,
    pub requested: String,
}

pub fn check_permission_budget(
    budget: &Permissions,
    skill_perms: &Permissions,
    skill_name: &str,
) -> Result<(), String> {
    if skill_perms.subprocess == Some(true) && budget.subprocess != Some(true) {
        return Err(format!(
            "Permission denied: {skill_name} requires subprocess access, but project budget does not allow it"
        ));
    }

    if let Some(ref net) = skill_perms.network {
        if let Some(ref outbound) = net.outbound {
            let budget_domains: Vec<String> = budget
                .network
                .as_ref()
                .and_then(|n| n.outbound.clone())
                .unwrap_or_default();
            for domain in outbound {
                if !is_domain_allowed(domain, &budget_domains) {
                    return Err(format!(
                        "Permission denied: {skill_name} requests network access to \"{domain}\", which is not in the project's permission budget"
                    ));
                }
            }
        }
    }

    if let Some(ref fs_perms) = skill_perms.filesystem {
        if let Some(ref read_paths) = fs_perms.read {
            let budget_paths: Vec<String> = budget
                .filesystem
                .as_ref()
                .and_then(|f| f.read.clone())
                .unwrap_or_default();
            for p in read_paths {
                if !is_path_allowed(p, &budget_paths) {
                    return Err(format!(
                        "Permission denied: {skill_name} requests filesystem read access to \"{p}\", which is not in the project's permission budget"
                    ));
                }
            }
        }

        if let Some(ref write_paths) = fs_perms.write {
            let budget_paths: Vec<String> = budget
                .filesystem
                .as_ref()
                .and_then(|f| f.write.clone())
                .unwrap_or_default();
            for p in write_paths {
                if !is_path_allowed(p, &budget_paths) {
                    return Err(format!(
                        "Permission denied: {skill_name} requests filesystem write access to \"{p}\", which is not in the project's permission budget"
                    ));
                }
            }
        }
    }

    Ok(())
}

pub fn is_domain_allowed(domain: &str, allowed_domains: &[String]) -> bool {
    for allowed in allowed_domains {
        if allowed == domain {
            return true;
        }
        if let Some(suffix) = allowed.strip_prefix("*.") {
            let dot_suffix = format!(".{suffix}");
            if domain.ends_with(&dot_suffix) || domain == suffix {
                return true;
            }
            if domain == allowed {
                return true;
            }
        }
    }
    false
}

pub fn is_path_allowed(requested_path: &str, allowed_paths: &[String]) -> bool {
    let norm = |p: &str| p.replace('\\', "/");
    let req = norm(requested_path);

    if req.contains("..") {
        return false;
    }

    for allowed in allowed_paths {
        let a = norm(allowed);
        if a == req {
            return true;
        }
        if let Some(prefix) = a.strip_suffix("/**") {
            if req == prefix || req.starts_with(&format!("{prefix}/")) {
                return true;
            }
        }
    }
    false
}

pub fn collect_violations(
    budget: &Permissions,
    skill_perms: &Permissions,
    skill_name: &str,
) -> Vec<PermissionViolation> {
    let mut violations = Vec::new();

    if skill_perms.subprocess == Some(true) && budget.subprocess != Some(true) {
        violations.push(PermissionViolation {
            skill_name: skill_name.to_string(),
            violation_type: "subprocess".to_string(),
            requested: "true".to_string(),
        });
    }

    if let Some(ref net) = skill_perms.network {
        if let Some(ref outbound) = net.outbound {
            let budget_domains: Vec<String> = budget
                .network
                .as_ref()
                .and_then(|n| n.outbound.clone())
                .unwrap_or_default();
            for domain in outbound {
                if !is_domain_allowed(domain, &budget_domains) {
                    violations.push(PermissionViolation {
                        skill_name: skill_name.to_string(),
                        violation_type: "network.outbound".to_string(),
                        requested: domain.clone(),
                    });
                }
            }
        }
    }

    if let Some(ref fs_perms) = skill_perms.filesystem {
        if let Some(ref read_paths) = fs_perms.read {
            let budget_paths: Vec<String> = budget
                .filesystem
                .as_ref()
                .and_then(|f| f.read.clone())
                .unwrap_or_default();
            for p in read_paths {
                if !is_path_allowed(p, &budget_paths) {
                    violations.push(PermissionViolation {
                        skill_name: skill_name.to_string(),
                        violation_type: "filesystem.read".to_string(),
                        requested: p.clone(),
                    });
                }
            }
        }

        if let Some(ref write_paths) = fs_perms.write {
            let budget_paths: Vec<String> = budget
                .filesystem
                .as_ref()
                .and_then(|f| f.write.clone())
                .unwrap_or_default();
            for p in write_paths {
                if !is_path_allowed(p, &budget_paths) {
                    violations.push(PermissionViolation {
                        skill_name: skill_name.to_string(),
                        violation_type: "filesystem.write".to_string(),
                        requested: p.clone(),
                    });
                }
            }
        }
    }

    violations
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_exact_match() {
        let allowed = vec!["api.example.com".to_string()];
        assert!(is_domain_allowed("api.example.com", &allowed));
        assert!(!is_domain_allowed("other.example.com", &allowed));
    }

    #[test]
    fn domain_wildcard() {
        let allowed = vec!["*.example.com".to_string()];
        assert!(is_domain_allowed("api.example.com", &allowed));
        assert!(is_domain_allowed("example.com", &allowed));
        assert!(!is_domain_allowed("api.other.com", &allowed));
    }

    #[test]
    fn path_exact_match() {
        let allowed = vec!["./src".to_string()];
        assert!(is_path_allowed("./src", &allowed));
        assert!(!is_path_allowed("./src/file.ts", &allowed));
    }

    #[test]
    fn path_glob_match() {
        let allowed = vec!["./src/**".to_string()];
        assert!(is_path_allowed("./src", &allowed));
        assert!(is_path_allowed("./src/file.ts", &allowed));
        assert!(is_path_allowed("./src/deep/nested/file.ts", &allowed));
        assert!(!is_path_allowed("./srcfile", &allowed));
        assert!(!is_path_allowed("./srca/file", &allowed));
    }

    #[test]
    fn path_traversal_rejected() {
        let allowed = vec!["./src/**".to_string()];
        assert!(!is_path_allowed("./src/../etc/passwd", &allowed));
        assert!(!is_path_allowed("../outside", &allowed));
    }

    #[test]
    fn backslash_normalized() {
        let allowed = vec!["./src/**".to_string()];
        assert!(is_path_allowed(".\\src\\file.ts", &allowed));
    }

    #[test]
    fn subprocess_violation() {
        let budget = Permissions::default();
        let skill = Permissions {
            subprocess: Some(true),
            ..Default::default()
        };
        let result = check_permission_budget(&budget, &skill, "test-skill");
        assert!(result.is_err());
    }

    #[test]
    fn collect_all_violations() {
        let budget = Permissions::default();
        let skill = Permissions {
            subprocess: Some(true),
            network: Some(NetworkPermissions {
                outbound: Some(vec!["evil.com".to_string()]),
            }),
            filesystem: Some(FilesystemPermissions {
                read: Some(vec!["/etc/passwd".to_string()]),
                write: Some(vec!["/tmp/hack".to_string()]),
            }),
        };
        let violations = collect_violations(&budget, &skill, "bad-skill");
        assert_eq!(violations.len(), 4);
    }
}
