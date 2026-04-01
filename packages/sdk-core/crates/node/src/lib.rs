use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use sdk_core::permissions::{
    FilesystemPermissions as CoreFsPerms, NetworkPermissions as CoreNetworkPerms,
    Permissions as CorePermissions,
};

#[napi(object)]
pub struct JsPermissions {
    pub network: Option<JsNetworkPermissions>,
    pub filesystem: Option<JsFilesystemPermissions>,
    pub subprocess: Option<bool>,
}

#[napi(object)]
pub struct JsNetworkPermissions {
    pub outbound: Option<Vec<String>>,
}

#[napi(object)]
pub struct JsFilesystemPermissions {
    pub read: Option<Vec<String>>,
    pub write: Option<Vec<String>>,
}

#[napi(object)]
pub struct JsPermissionViolation {
    pub skill_name: String,
    pub violation_type: String,
    pub requested: String,
}

#[napi(object)]
pub struct JsLockEntry {
    pub resolved: String,
    pub integrity: String,
    pub permissions: JsPermissions,
    pub audit_score: Option<f64>,
}

fn to_core_perms(js: &JsPermissions) -> CorePermissions {
    CorePermissions {
        network: js.network.as_ref().map(|n| CoreNetworkPerms {
            outbound: n.outbound.clone(),
        }),
        filesystem: js.filesystem.as_ref().map(|f| CoreFsPerms {
            read: f.read.clone(),
            write: f.write.clone(),
        }),
        subprocess: js.subprocess,
    }
}

fn from_core_perms(core: &CorePermissions) -> JsPermissions {
    JsPermissions {
        network: core.network.as_ref().map(|n| JsNetworkPermissions {
            outbound: n.outbound.clone(),
        }),
        filesystem: core.filesystem.as_ref().map(|f| JsFilesystemPermissions {
            read: f.read.clone(),
            write: f.write.clone(),
        }),
        subprocess: core.subprocess,
    }
}

#[napi]
pub fn check_permission_budget(
    budget: JsPermissions,
    skill_perms: JsPermissions,
    skill_name: String,
) -> napi::Result<()> {
    let budget = to_core_perms(&budget);
    let skill = to_core_perms(&skill_perms);
    sdk_core::check_permission_budget(&budget, &skill, &skill_name)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn collect_permission_violations(
    budget: JsPermissions,
    skill_perms: JsPermissions,
    skill_name: String,
) -> Vec<JsPermissionViolation> {
    let budget = to_core_perms(&budget);
    let skill = to_core_perms(&skill_perms);
    sdk_core::permissions::collect_violations(&budget, &skill, &skill_name)
        .into_iter()
        .map(|v| JsPermissionViolation {
            skill_name: v.skill_name,
            violation_type: v.violation_type,
            requested: v.requested,
        })
        .collect()
}

#[napi]
pub fn is_domain_allowed(domain: String, allowed_domains: Vec<String>) -> bool {
    sdk_core::is_domain_allowed(&domain, &allowed_domains)
}

#[napi]
pub fn is_path_allowed(requested_path: String, allowed_paths: Vec<String>) -> bool {
    sdk_core::is_path_allowed(&requested_path, &allowed_paths)
}

#[napi]
pub fn verify_integrity(data: Buffer, expected_integrity: String) -> napi::Result<String> {
    sdk_core::verify_integrity(&data, &expected_integrity)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn extract_tarball(data: Buffer, dest: String) -> napi::Result<Vec<String>> {
    sdk_core::extract_tarball(&data, &dest).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn resolve_version(available: Vec<String>, range: String) -> Option<String> {
    sdk_core::resolve_version(&available, &range)
}

#[napi]
pub fn read_lockfile(path: String) -> napi::Result<String> {
    let lockfile =
        sdk_core::read_lockfile(&path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    serde_json::to_string(&lockfile).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn write_lockfile(path: String, json_content: String) -> napi::Result<()> {
    let lockfile: sdk_core::Lockfile =
        serde_json::from_str(&json_content).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    sdk_core::write_lockfile(&path, &lockfile).map_err(|e| napi::Error::from_reason(e.to_string()))
}
