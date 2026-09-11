use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct WorktreeLease {
    pub id: String,
    pub repository_path: PathBuf,
    pub worktree_path: PathBuf,
}

pub struct WorktreeService {
    root: PathBuf,
}

impl WorktreeService {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Creates a detached worktree for an isolated agent execution.
    /// No branch is created and the caller must explicitly promote or merge changes later.
    pub fn create_isolated(
        &self,
        repository_path: impl AsRef<Path>,
        base_ref: Option<&str>,
    ) -> Result<WorktreeLease, String> {
        let repository_path = Self::canonical_repository(repository_path.as_ref())?;
        Self::ensure_git_repository(&repository_path)?;

        fs::create_dir_all(&self.root)
            .map_err(|error| format!("failed to create worktree root: {error}"))?;

        let id = Uuid::new_v4().to_string();
        let worktree_path = self.root.join(format!("agent-{id}"));
        if worktree_path.exists() {
            return Err(format!(
                "refusing to reuse existing worktree path: {}",
                worktree_path.display()
            ));
        }

        let target_ref = base_ref
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("HEAD");

        let output = Command::new("git")
            .arg("-C")
            .arg(&repository_path)
            .arg("worktree")
            .arg("add")
            .arg("--detach")
            .arg(&worktree_path)
            .arg(target_ref)
            .output()
            .map_err(|error| format!("failed to run git worktree add: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "git worktree add failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        Ok(WorktreeLease {
            id,
            repository_path,
            worktree_path,
        })
    }

    /// Removes only a worktree that lives under this service's managed root.
    /// This guard prevents arbitrary directory deletion through the worktree API.
    pub fn remove(&self, lease: &WorktreeLease) -> Result<(), String> {
        let root = self
            .root
            .canonicalize()
            .unwrap_or_else(|_| self.root.clone());
        let worktree = lease
            .worktree_path
            .canonicalize()
            .unwrap_or_else(|_| lease.worktree_path.clone());

        if !worktree.starts_with(&root) {
            return Err(format!(
                "refusing to remove unmanaged worktree: {}",
                worktree.display()
            ));
        }

        let output = Command::new("git")
            .arg("-C")
            .arg(&lease.repository_path)
            .arg("worktree")
            .arg("remove")
            .arg("--force")
            .arg(&lease.worktree_path)
            .output()
            .map_err(|error| format!("failed to run git worktree remove: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "git worktree remove failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        Ok(())
    }

    pub fn prune(&self, repository_path: impl AsRef<Path>) -> Result<(), String> {
        let repository_path = Self::canonical_repository(repository_path.as_ref())?;
        Self::ensure_git_repository(&repository_path)?;

        let output = Command::new("git")
            .arg("-C")
            .arg(repository_path)
            .arg("worktree")
            .arg("prune")
            .output()
            .map_err(|error| format!("failed to run git worktree prune: {error}"))?;

        if !output.status.success() {
            return Err(format!(
                "git worktree prune failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }

        Ok(())
    }

    fn canonical_repository(path: &Path) -> Result<PathBuf, String> {
        path.canonicalize()
            .map_err(|error| format!("invalid repository path {}: {error}", path.display()))
    }

    fn ensure_git_repository(path: &Path) -> Result<(), String> {
        let output = Command::new("git")
            .arg("-C")
            .arg(path)
            .arg("rev-parse")
            .arg("--show-toplevel")
            .output()
            .map_err(|error| format!("failed to check git repository: {error}"))?;

        if !output.status.success() {
            return Err(format!("not a git repository: {}", path.display()));
        }

        let root = String::from_utf8_lossy(&output.stdout);
        let root = PathBuf::from(root.trim());
        let canonical_root = root
            .canonicalize()
            .map_err(|error| format!("failed to resolve git repository root: {error}"))?;

        if canonical_root != path {
            return Err(format!(
                "worktree isolation requires the repository root; received {} but root is {}",
                path.display(),
                canonical_root.display()
            ));
        }

        Ok(())
    }
}
