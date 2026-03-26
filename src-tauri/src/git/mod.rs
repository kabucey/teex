mod diff;
mod status;

pub(crate) use diff::git_diff;
pub(crate) use diff::git_diff_all;
pub(crate) use status::git_status;

#[cfg(test)]
pub(crate) use diff::{parse_unified_diff, LineDiff};
#[cfg(test)]
pub(crate) use diff::{parse_full_unified_diff, DiffLine};
#[cfg(test)]
pub(crate) use status::parse_porcelain_line;
