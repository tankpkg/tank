use std::io::Read;
use std::path::Path;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use flate2::read::GzDecoder;
use sha2::{Digest, Sha512};
use tar::Archive;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ExtractError {
    #[error("SHA-512 mismatch: expected {expected}, got {actual}")]
    IntegrityMismatch { expected: String, actual: String },
    #[error("Absolute path in tarball: {0}")]
    AbsolutePath(String),
    #[error("Path traversal in tarball: {0}")]
    PathTraversal(String),
    #[error("Symlink in tarball: {0}")]
    SymlinkDetected(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn verify_integrity(data: &[u8], expected_integrity: &str) -> Result<String, ExtractError> {
    let mut hasher = Sha512::new();
    hasher.update(data);
    let hash = hasher.finalize();
    let encoded = BASE64.encode(hash);
    let computed = format!("sha512-{encoded}");

    if computed != expected_integrity {
        return Err(ExtractError::IntegrityMismatch {
            expected: expected_integrity.to_string(),
            actual: computed,
        });
    }

    Ok(computed)
}

const MAX_TARBALL_BYTES: usize = 100 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 500 * 1024 * 1024;

pub fn extract_tarball(data: &[u8], dest: &str) -> Result<Vec<String>, ExtractError> {
    if data.len() > MAX_TARBALL_BYTES {
        return Err(ExtractError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "compressed tarball exceeds 100MB limit",
        )));
    }

    let dest_path = Path::new(dest);
    std::fs::create_dir_all(dest_path)?;

    let decoder = GzDecoder::new(data);
    let mut archive = Archive::new(decoder);
    let mut extracted_files = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut entry_count: usize = 0;

    for entry_result in archive.entries()? {
        entry_count += 1;
        if entry_count > MAX_ENTRIES {
            return Err(ExtractError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("tarball exceeds {MAX_ENTRIES} entry limit"),
            )));
        }

        let mut entry = entry_result?;
        let raw_path = entry.path()?.to_path_buf();
        let raw_str = raw_path.to_string_lossy().to_string();

        let entry_type = entry.header().entry_type();
        if entry_type == tar::EntryType::Symlink || entry_type == tar::EntryType::Link {
            return Err(ExtractError::SymlinkDetected(raw_str));
        }

        if raw_path.is_absolute() {
            return Err(ExtractError::AbsolutePath(raw_str));
        }

        let normalized = raw_str.replace('\\', "/");
        for segment in normalized.split('/') {
            if segment == ".." {
                return Err(ExtractError::PathTraversal(raw_str));
            }
        }

        let stripped = strip_first_component(&normalized);
        if stripped.is_empty() {
            continue;
        }

        let out_path = dest_path.join(&stripped);

        if entry_type == tar::EntryType::Directory {
            std::fs::create_dir_all(&out_path)?;
        } else if entry_type.is_file() {
            let size = entry.header().size()?;
            if size > MAX_FILE_BYTES {
                return Err(ExtractError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("file {stripped} exceeds 50MB limit"),
                )));
            }
            total_bytes = total_bytes.saturating_add(size);
            if total_bytes > MAX_TOTAL_BYTES {
                return Err(ExtractError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "total extracted size exceeds 500MB limit",
                )));
            }

            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut file = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut file)?;
            extracted_files.push(stripped);
        }
    }

    Ok(extracted_files)
}

fn strip_first_component(path: &str) -> String {
    match path.find('/') {
        Some(idx) => {
            let rest = &path[idx + 1..];
            if rest.is_empty() {
                String::new()
            } else {
                rest.to_string()
            }
        }
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_integrity_match() {
        let data = b"hello world";
        let mut hasher = Sha512::new();
        hasher.update(data);
        let hash = hasher.finalize();
        let encoded = BASE64.encode(hash);
        let expected = format!("sha512-{encoded}");
        let result = verify_integrity(data, &expected);
        assert!(result.is_ok());
    }

    #[test]
    fn verify_integrity_mismatch() {
        let data = b"hello world";
        let result = verify_integrity(data, "sha512-wronghash");
        assert!(matches!(
            result,
            Err(ExtractError::IntegrityMismatch { .. })
        ));
    }

    #[test]
    fn strip_component_works() {
        assert_eq!(strip_first_component("package/src/main.rs"), "src/main.rs");
        assert_eq!(strip_first_component("package/"), "");
        assert_eq!(strip_first_component("package"), "");
        assert_eq!(
            strip_first_component("root/deep/nested/file.txt"),
            "deep/nested/file.txt"
        );
    }
}
