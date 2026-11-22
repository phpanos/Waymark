use std::{sync::mpsc, time::Duration};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

fn guide_url(input: &str) -> Result<Url, String> {
    let invalid = || "Paste a public Mobalytics Path of Exile 2 build link.".to_string();
    let url = Url::parse(input).map_err(|_| invalid())?;
    let segments = url.path().trim_matches('/').split('/').collect::<Vec<_>>();
    let is_slug = |slug: &str| {
        !slug.is_empty()
            && slug.len() <= 150
            && slug
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    };
    let is_guide = match segments.as_slice() {
        ["poe-2", "builds", slug] => is_slug(slug),
        ["poe-2", "profile", author, "builds", slug] => is_slug(author) && is_slug(slug),
        _ => false,
    };
    if url.scheme() != "https"
        || url.host_str() != Some("mobalytics.gg")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !is_guide
    {
        return Err(invalid());
    }
    Ok(url)
}

#[tauri::command]
pub(super) async fn import_mobalytics_guide(
    app: AppHandle,
    window: WebviewWindow,
    url: String,
) -> Result<serde_json::Value, String> {
    if window.label() != "settings" {
        return Err("Open Build settings to import a guide.".into());
    }
    let url = guide_url(&url)?;
    let (send, receive) = mpsc::channel();
    let importer = WebviewWindowBuilder::new(&app, "mobalytics-import", WebviewUrl::External(url))
        .visible(false)
        .incognito(true)
        .on_navigation(|url| guide_url(url.as_str()).is_ok())
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_page_load(move |webview, page| {
            if page.event() == PageLoadEvent::Finished && guide_url(page.url().as_str()).is_ok() {
                let result_sender = send.clone();
                let result =
                    webview.eval_with_callback(include_str!("mobalytics.js"), move |json| {
                        let _ = result_sender.send(json);
                    });
                if result.is_err() {
                    let _ = send.send(String::new());
                }
            }
        })
        .build()
        .map_err(|_| "Could not open the Mobalytics importer.".to_string())?;
    let result =
        tauri::async_runtime::spawn_blocking(move || receive.recv_timeout(Duration::from_secs(12)))
            .await;
    let _ = importer.destroy();
    let json = result
        .ok()
        .and_then(Result::ok)
        .filter(|json| json.len() <= 256 * 1024);
    json.and_then(|json| serde_json::from_str::<serde_json::Value>(&json).ok())
        .filter(|value| value.is_object())
        .ok_or_else(|| "Mobalytics did not return an importable gem priority list.".into())
}
