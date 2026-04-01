use std::collections::BTreeMap;
use std::io::{self, ErrorKind};

use serde::{Deserialize, Serialize};

use crate::permissions::Permissions;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockEntry {
    pub resolved: String,
    pub integrity: String,
    pub permissions: Permissions,
    pub audit_score: Option<f64>,
    #[serde(default)]
    pub dependencies: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lockfile {
    #[serde(rename = "lockfileVersion")]
    pub lockfile_version: u32,
    pub skills: BTreeMap<String, LockEntry>,
}

pub fn read_lockfile(path: &str) -> Result<Lockfile, io::Error> {
    let contents = std::fs::read_to_string(path)?;
    let lockfile: Lockfile =
        serde_json::from_str(&contents).map_err(|e| io::Error::new(ErrorKind::InvalidData, e))?;
    Ok(lockfile)
}

pub fn write_lockfile(path: &str, lockfile: &Lockfile) -> Result<(), io::Error> {
    let mut json = serde_json::to_string_pretty(lockfile)
        .map_err(|e| io::Error::new(ErrorKind::InvalidData, e))?;
    json.push('\n');
    std::fs::write(path, json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_lockfile() -> Result<(), String> {
        let mut skills = BTreeMap::new();
        skills.insert(
            "@org/skill@1.0.0".to_string(),
            LockEntry {
                resolved: "https://registry.example.com/skill-1.0.0.tgz".to_string(),
                integrity: "sha512-abc123".to_string(),
                permissions: Permissions::default(),
                audit_score: Some(8.5),
                dependencies: std::collections::HashMap::new(),
            },
        );

        let lockfile = Lockfile {
            lockfile_version: 2,
            skills,
        };

        let json = serde_json::to_string_pretty(&lockfile).map_err(|e| e.to_string())?;
        let parsed: Lockfile = serde_json::from_str(&json).map_err(|e| e.to_string())?;

        assert_eq!(parsed.lockfile_version, 2);
        assert_eq!(parsed.skills.len(), 1);
        assert!(parsed.skills.contains_key("@org/skill@1.0.0"));
        Ok(())
    }

    #[test]
    fn btreemap_keeps_sorted_keys() -> Result<(), String> {
        let mut skills = BTreeMap::new();
        skills.insert(
            "@z/skill@1.0.0".to_string(),
            LockEntry {
                resolved: "https://example.com/z.tgz".to_string(),
                integrity: "sha512-z".to_string(),
                permissions: Permissions::default(),
                audit_score: None,
                dependencies: std::collections::HashMap::new(),
            },
        );
        skills.insert(
            "@a/skill@2.0.0".to_string(),
            LockEntry {
                resolved: "https://example.com/a.tgz".to_string(),
                integrity: "sha512-a".to_string(),
                permissions: Permissions::default(),
                audit_score: None,
                dependencies: std::collections::HashMap::new(),
            },
        );

        let lockfile = Lockfile {
            lockfile_version: 2,
            skills,
        };

        let json = serde_json::to_string_pretty(&lockfile).map_err(|e| e.to_string())?;
        let a_pos = json.find("@a/skill").ok_or("@a/skill not found in JSON")?;
        let z_pos = json.find("@z/skill").ok_or("@z/skill not found in JSON")?;
        assert!(a_pos < z_pos);
        Ok(())
    }
}
