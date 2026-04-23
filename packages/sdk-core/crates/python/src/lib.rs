use pyo3::prelude::*;
use pyo3::types::PyBytes;
use sdk_core::permissions::{
    FilesystemPermissions as CoreFsPerms, NetworkPermissions as CoreNetworkPerms,
    Permissions as CorePermissions,
};

#[pyclass]
#[derive(Clone)]
pub struct Permissions {
    inner: CorePermissions,
}

#[pymethods]
impl Permissions {
    #[new]
    #[pyo3(signature = (network_outbound=None, fs_read=None, fs_write=None, subprocess=None))]
    fn new(
        network_outbound: Option<Vec<String>>,
        fs_read: Option<Vec<String>>,
        fs_write: Option<Vec<String>>,
        subprocess: Option<bool>,
    ) -> Self {
        let network = network_outbound.map(|domains| CoreNetworkPerms {
            outbound: Some(domains),
        });
        let filesystem = if fs_read.is_some() || fs_write.is_some() {
            Some(CoreFsPerms {
                read: fs_read,
                write: fs_write,
            })
        } else {
            None
        };
        Permissions {
            inner: CorePermissions {
                network,
                filesystem,
                subprocess,
            },
        }
    }

    #[getter]
    fn network_outbound(&self) -> Option<Vec<String>> {
        self.inner.network.as_ref().and_then(|n| n.outbound.clone())
    }

    #[getter]
    fn filesystem_read(&self) -> Option<Vec<String>> {
        self.inner.filesystem.as_ref().and_then(|f| f.read.clone())
    }

    #[getter]
    fn filesystem_write(&self) -> Option<Vec<String>> {
        self.inner.filesystem.as_ref().and_then(|f| f.write.clone())
    }

    #[getter]
    fn subprocess(&self) -> Option<bool> {
        self.inner.subprocess
    }
}

#[pyclass]
#[derive(Clone)]
pub struct PermissionViolation {
    #[pyo3(get)]
    pub skill_name: String,
    #[pyo3(get)]
    pub violation_type: String,
    #[pyo3(get)]
    pub requested: String,
}

#[pyfunction]
fn check_permission_budget(
    budget: &Permissions,
    skill_perms: &Permissions,
    skill_name: &str,
) -> PyResult<()> {
    sdk_core::check_permission_budget(&budget.inner, &skill_perms.inner, skill_name)
        .map_err(|e| pyo3::exceptions::PyPermissionError::new_err(e))
}

#[pyfunction]
fn collect_permission_violations(
    budget: &Permissions,
    skill_perms: &Permissions,
    skill_name: &str,
) -> Vec<PermissionViolation> {
    sdk_core::permissions::collect_violations(&budget.inner, &skill_perms.inner, skill_name)
        .into_iter()
        .map(|v| PermissionViolation {
            skill_name: v.skill_name,
            violation_type: v.violation_type,
            requested: v.requested,
        })
        .collect()
}

#[pyfunction]
fn is_domain_allowed(domain: &str, allowed_domains: Vec<String>) -> bool {
    sdk_core::is_domain_allowed(domain, &allowed_domains)
}

#[pyfunction]
fn is_path_allowed(requested_path: &str, allowed_paths: Vec<String>) -> bool {
    sdk_core::is_path_allowed(requested_path, &allowed_paths)
}

#[pyfunction]
fn verify_integrity(data: &Bound<'_, PyBytes>, expected_integrity: &str) -> PyResult<String> {
    sdk_core::verify_integrity(data.as_bytes(), expected_integrity)
        .map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn extract_tarball(data: &Bound<'_, PyBytes>, dest: &str) -> PyResult<Vec<String>> {
    sdk_core::extract_tarball(data.as_bytes(), dest)
        .map_err(|e| pyo3::exceptions::PyIOError::new_err(e.to_string()))
}

#[pyfunction]
fn resolve_version(available: Vec<String>, range: &str) -> Option<String> {
    sdk_core::resolve_version(&available, range)
}

#[pyfunction]
fn read_lockfile(path: &str) -> PyResult<String> {
    let lockfile = sdk_core::read_lockfile(path)
        .map_err(|e| pyo3::exceptions::PyIOError::new_err(e.to_string()))?;
    serde_json::to_string(&lockfile)
        .map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn write_lockfile(path: &str, json_content: &str) -> PyResult<()> {
    let lockfile: sdk_core::Lockfile = serde_json::from_str(json_content)
        .map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))?;
    sdk_core::write_lockfile(path, &lockfile)
        .map_err(|e| pyo3::exceptions::PyIOError::new_err(e.to_string()))
}

#[pymodule]
fn tankpkg_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<Permissions>()?;
    m.add_class::<PermissionViolation>()?;
    m.add_function(wrap_pyfunction!(check_permission_budget, m)?)?;
    m.add_function(wrap_pyfunction!(collect_permission_violations, m)?)?;
    m.add_function(wrap_pyfunction!(is_domain_allowed, m)?)?;
    m.add_function(wrap_pyfunction!(is_path_allowed, m)?)?;
    m.add_function(wrap_pyfunction!(verify_integrity, m)?)?;
    m.add_function(wrap_pyfunction!(extract_tarball, m)?)?;
    m.add_function(wrap_pyfunction!(resolve_version, m)?)?;
    m.add_function(wrap_pyfunction!(read_lockfile, m)?)?;
    m.add_function(wrap_pyfunction!(write_lockfile, m)?)?;
    Ok(())
}
