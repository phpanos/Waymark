use keyvalues_parser::{parse, Value};
use std::{
    env, fs,
    path::{Path, PathBuf},
};
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

fn steam_libraries(root: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![root.into()];
    if let Some(vdf) = fs::read_to_string(root.join("steamapps/libraryfolders.vdf"))
        .ok()
        .and_then(|text| parse(&text).ok().map(|v| v.into_vdf().into_owned()))
    {
        if let Some(obj) = vdf.value.get_obj() {
            for (key, values) in obj.iter() {
                if key.parse::<u32>().is_err() {
                    continue;
                }
                for value in values {
                    let path = value
                        .get_str()
                        .or_else(|| value.get_obj()?.get("path")?.first()?.get_str());
                    if let Some(p) = path {
                        libraries.push(PathBuf::from(p));
                    }
                }
            }
        }
    }
    libraries
}

fn steam_install(library: &Path) -> PathBuf {
    let apps = library.join("steamapps");
    let dir = fs::read_to_string(apps.join("appmanifest_2694490.acf"))
        .ok()
        .and_then(|s| {
            let vdf = parse(&s).ok()?;
            let name = vdf
                .value
                .get_obj()?
                .get("installdir")?
                .first()
                .and_then(Value::get_str)?;
            Some(name.to_owned())
        })
        .unwrap_or_else(|| "Path of Exile 2".into());
    apps.join("common").join(dir)
}

pub fn discover() -> Option<PathBuf> {
    let mut installs = vec![];
    let mut steam_roots = vec![];
    let user = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = user.open_subkey(r"Software\Valve\Steam") {
        if let Ok(root) = key.get_value::<String, _>("SteamPath") {
            steam_roots.push(PathBuf::from(root));
        }
    }
    if let Ok(key) = user.open_subkey(r"Software\GrindingGearGames\Path of Exile 2") {
        if let Ok(root) = key.get_value::<String, _>("InstallLocation") {
            installs.push(PathBuf::from(root));
        }
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = env::var_os(var).map(PathBuf::from) {
            installs.push(root.join("Grinding Gear Games").join("Path of Exile 2"));
            steam_roots.push(root.join("Steam"));
        }
    }
    for root in steam_roots.into_iter().filter(|p| p.is_dir()) {
        installs.extend(steam_libraries(&root).iter().map(|p| steam_install(p)));
    }
    let logs: Vec<_> = installs
        .into_iter()
        .filter(|p| p.is_dir())
        .map(|p| p.join("logs/Client.txt"))
        .collect();
    logs.iter()
        .filter(|p| p.is_file())
        .max_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok())
        .cloned()
        .or_else(|| logs.into_iter().next())
}
