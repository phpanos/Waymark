use same_file::Handle;
use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

const MAX_LINE: usize = 16 * 1024;
const GUARD: usize = 64;
const CHUNK: usize = 32 * 1024;
const LEVEL_HISTORY: u64 = 1024 * 1024;

#[derive(Default)]
pub struct Lines {
    partial: Vec<u8>,
    discard: bool,
}
impl Lines {
    pub fn push(&mut self, bytes: &[u8], mut emit: impl FnMut(&str)) {
        for &b in bytes {
            if b == b'\n' {
                if !self.discard {
                    if let Ok(line) = std::str::from_utf8(&self.partial) {
                        emit(line.trim_end_matches('\r'));
                    }
                }
                self.partial.clear();
                self.discard = false;
            } else if !self.discard {
                if self.partial.len() == MAX_LINE {
                    self.partial.clear();
                    self.discard = true;
                } else {
                    self.partial.push(b);
                }
            }
        }
    }
}

/// Look back only for the selected character's latest complete level-up record.
pub fn recent_character_level(path: &Path, character: &str) -> io::Result<Option<u8>> {
    let mut file = File::open(path)?;
    let length = file.metadata()?.len();
    let start = length.saturating_sub(LEVEL_HISTORY);
    file.seek(SeekFrom::Start(start))?;
    let mut lines = Lines {
        discard: start != 0,
        ..Lines::default()
    };
    let mut bytes = [0; CHUNK];
    let mut file = file.take(length - start);
    let mut latest = None;
    loop {
        let count = file.read(&mut bytes)?;
        if count == 0 {
            break;
        }
        lines.push(&bytes[..count], |line| {
            if let Some(level) = crate::parser::character_level(line, character) {
                latest = Some(level);
            }
        });
    }
    Ok(latest)
}

pub enum Item<'a> {
    Line(&'a str),
    Reset,
}

struct Cursor {
    file: File,
    identity: Handle,
    offset: u64,
    guard: Vec<u8>,
    lines: Lines,
}

impl Cursor {
    fn new(mut file: File, identity: Handle, skip_history: bool) -> io::Result<Self> {
        let offset = if skip_history {
            file.metadata()?.len()
        } else {
            0
        };
        let mut guard = vec![0; offset.min(GUARD as u64) as usize];
        file.seek(SeekFrom::Start(offset - guard.len() as u64))?;
        file.read_exact(&mut guard)?;
        let discard = guard.last().is_some_and(|&b| b != b'\n');
        Ok(Self {
            file,
            identity,
            offset,
            guard,
            lines: Lines {
                discard,
                ..Lines::default()
            },
        })
    }

    fn drain(&mut self, emit: &mut impl FnMut(Item<'_>)) -> io::Result<bool> {
        let mut probe = [0u8; GUARD];
        self.file
            .seek(SeekFrom::Start(self.offset - self.guard.len() as u64))?;
        let n = self.file.read(&mut probe[..self.guard.len()])?;
        if probe[..n] != self.guard || self.file.metadata()?.len() < self.offset {
            self.file.rewind()?;
            self.offset = 0;
            self.guard.clear();
            self.lines = Lines::default();
            emit(Item::Reset);
        }
        let mut bytes = [0; CHUNK];
        let n = self.file.read(&mut bytes)?;
        let bytes = &bytes[..n];
        self.lines.push(bytes, |s| emit(Item::Line(s)));
        self.offset += n as u64;
        if n >= GUARD {
            self.guard.clear();
            self.guard.extend_from_slice(&bytes[n - GUARD..]);
        } else {
            let trim = (self.guard.len() + n).saturating_sub(GUARD);
            self.guard.drain(..trim);
            self.guard.extend_from_slice(bytes);
        }
        Ok(n == CHUNK)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Health {
    Watching,
    Missing,
}

pub struct Tail {
    path: PathBuf,
    initial: bool,
    cursor: Option<Cursor>,
}

impl Tail {
    pub fn new(path: &Path) -> Self {
        Self {
            path: path.into(),
            initial: true,
            cursor: None,
        }
    }

    /// Each poll reads at most one chunk per generation. A true result requests an immediate poll.
    pub fn poll(&mut self, mut emit: impl FnMut(Item<'_>)) -> io::Result<(Health, bool)> {
        let file = match File::open(&self.path) {
            Ok(file) => file,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                self.initial = false;
                let more = match &mut self.cursor {
                    Some(old) => old.drain(&mut emit)?,
                    None => false,
                };
                return Ok((Health::Missing, more));
            }
            Err(e) => return Err(e),
        };
        let identity = Handle::from_file(file.try_clone()?)?;
        match &mut self.cursor {
            Some(old) if old.identity == identity => {
                return Ok((Health::Watching, old.drain(&mut emit)?))
            }
            Some(old) => {
                if old.drain(&mut emit)? {
                    return Ok((Health::Watching, true));
                }
                emit(Item::Reset);
            }
            None => {}
        }
        let cursor = Cursor::new(file, identity, self.initial)?;
        self.initial = false;
        self.cursor = Some(cursor);
        Ok((
            Health::Watching,
            self.cursor.as_mut().unwrap().drain(&mut emit)?,
        ))
    }
}
