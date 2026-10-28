use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri_plugin_shell::ShellExt;

const SERVICE: &str = "phdnexus.google-drive.v1";
const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
static GATE: Mutex<()> = Mutex::new(());
#[derive(Serialize, Deserialize, Clone)]
struct ClientConfig {
    client_id: String,
    client_secret: String,
}
#[derive(Serialize, Deserialize)]
struct Connection {
    client: ClientConfig,
    refresh_token: String,
    access_token: String,
    expires_at: u64,
}
#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
    scope: Option<String>,
}
#[derive(Serialize)]
pub struct DriveStatus {
    configured: bool,
    connected: bool,
}

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !cfg!(any(target_os = "windows", target_os = "macos")) {
        return Err("Secure credential storage is unavailable on this platform".into());
    }
    keyring::Entry::new(SERVICE, name)
        .map_err(|_| "Cannot access the operating system credential store".into())
}
fn identity(user: &str, group: &str) -> Result<String, String> {
    let valid = |s: &str| s.len() == 36 && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if !valid(user) || !valid(group) {
        return Err("Invalid desktop connection identity".into());
    }
    Ok(format!("{user}:{group}"))
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn random() -> String {
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    URL_SAFE_NO_PAD.encode(b)
}
fn exchange(params: &[(&str, &str)]) -> Result<Tokens, String> {
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Cannot initialize Google connection")?
        .post("https://oauth2.googleapis.com/token")
        .form(params)
        .send()
        .map_err(|_| {
            "Google is temporarily unreachable. The upload remains pending.".to_string()
        })?;
    if !response.status().is_success() {
        let invalid = response
            .json::<serde_json::Value>()
            .ok()
            .and_then(|v| v.get("error").and_then(|s| s.as_str()).map(str::to_owned));
        return Err(if invalid.as_deref() == Some("invalid_grant") {
            "GOOGLE_RECONNECT_REQUIRED"
        } else {
            "Google could not renew access. Retry or reconnect Google."
        }
        .into());
    }
    response
        .json()
        .map_err(|_| "Google returned an invalid authorization response".into())
}
fn save(name: &str, connection: &Connection) -> Result<(), String> {
    let value = serde_json::to_string(connection).map_err(|_| "Cannot encode Google connection")?;
    entry(name)?
        .set_password(&value)
        .map_err(|_| "Cannot securely save Google connection".into())
}
fn read(name: &str) -> Result<Connection, String> {
    let value = entry(name)?
        .get_password()
        .map_err(|_| "GOOGLE_RECONNECT_REQUIRED".to_string())?;
    serde_json::from_str(&value).map_err(|_| "GOOGLE_RECONNECT_REQUIRED".into())
}

#[tauri::command]
pub async fn google_drive_import_client(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = GATE.lock().map_err(|_| "Connection is busy")?;
        let contents = std::fs::read(path).map_err(|_| "Cannot read the selected OAuth JSON")?;
        if contents.len() > 32_768 {
            return Err("Invalid OAuth JSON".into());
        }
        let json: serde_json::Value =
            serde_json::from_slice(&contents).map_err(|_| "Invalid OAuth JSON")?;
        let installed = json
            .get("installed")
            .ok_or("Select an OAuth Desktop app JSON, not a web client")?;
        let config: ClientConfig = serde_json::from_value(installed.clone())
            .map_err(|_| "Invalid desktop OAuth client")?;
        if !config.client_id.ends_with(".apps.googleusercontent.com") {
            return Err("Invalid OAuth client ID".into());
        }
        entry("desktop-client")?
            .set_password(&serde_json::to_string(&config).map_err(|_| "Invalid client")?)
            .map_err(|_| "Cannot securely save the OAuth client".into())
    })
    .await
    .map_err(|_| "Desktop connection task failed".to_string())?
}

#[tauri::command]
pub async fn google_drive_status(user_id: String, group_id: String) -> Result<DriveStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = identity(&user_id, &group_id)?;
        Ok(DriveStatus {
            configured: entry("desktop-client")?.get_password().is_ok(),
            connected: read(&name).is_ok(),
        })
    })
    .await
    .map_err(|_| "Desktop connection task failed".to_string())?
}

#[tauri::command]
pub async fn google_drive_connect(
    app: tauri::AppHandle,
    user_id: String,
    group_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = GATE.lock().map_err(|_| "Connection is busy")?;
        let name = identity(&user_id, &group_id)?;
        let config: ClientConfig = serde_json::from_str(&entry("desktop-client")?.get_password().map_err(|_| "Import the desktop OAuth JSON first")?)
            .map_err(|_| "Invalid stored desktop client")?;
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "Cannot open local Google authorization callback")?;
        listener.set_nonblocking(true).map_err(|_| "Cannot prepare Google callback")?;
        let port = listener.local_addr().map_err(|_| "Cannot inspect callback")?.port();
        let callback = format!("http://127.0.0.1:{port}/oauth/callback");
        let state = random(); let verifier = random();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut url = reqwest::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").map_err(|_| "Invalid Google endpoint")?;
        url.query_pairs_mut().extend_pairs([("client_id", config.client_id.as_str()), ("redirect_uri", &callback),
            ("response_type", "code"), ("scope", SCOPE), ("access_type", "offline"), ("prompt", "consent select_account"),
            ("state", &state), ("code_challenge", &challenge), ("code_challenge_method", "S256")]);
        app.shell().open(url.to_string(), None).map_err(|_| "Cannot open your default browser")?;
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(180) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
                    let mut bytes = [0u8; 8192];
                    let size = match stream.read(&mut bytes) { Ok(n) => n, Err(_) => continue };
                    let request = String::from_utf8_lossy(&bytes[..size]);
                    let target = request.lines().next().and_then(|line| line.strip_prefix("GET ")).and_then(|s| s.split(' ').next());
                    let parsed = target.and_then(|p| reqwest::Url::parse(&format!("http://127.0.0.1:{port}{p}")).ok());
                    let params = parsed.as_ref().map(|u| u.query_pairs().into_owned().collect::<std::collections::HashMap<_, _>>()).unwrap_or_default();
                    if parsed.as_ref().map(|p| p.path()) != Some("/oauth/callback") || params.get("state") != Some(&state) {
                        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"); continue;
                    }
                    let result = (|| {
                        let code = params.get("code").ok_or("Google authorization was cancelled")?;
                        let tokens = exchange(&[("client_id", &config.client_id), ("client_secret", &config.client_secret),
                            ("code", code), ("code_verifier", &verifier), ("redirect_uri", &callback), ("grant_type", "authorization_code")])?;
                        if let Some(scope) = &tokens.scope { if !scope.split(' ').any(|s| s == SCOPE) { return Err("Google did not grant Drive file access".into()); } }
                        let refresh_token = tokens.refresh_token.ok_or("Google did not issue offline access. Reconnect with consent.")?;
                        save(&name, &Connection { client: config.clone(), refresh_token, access_token: tokens.access_token,
                            expires_at: now() + tokens.expires_in.saturating_sub(60) })
                    })();
                    let body = if result.is_ok() { "Google conectado. Puedes cerrar esta pestana y volver a PhD Nexus." } else { "No se pudo completar la conexion. Vuelve a PhD Nexus para reintentar." };
                    let reply = format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                    let _ = stream.write_all(reply.as_bytes()); return result;
                },
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => return Err("Google callback failed".into()),
            }
        }
        Err("Google authorization timed out. Click connect to retry.".into())
    }).await.map_err(|_| "Desktop connection task failed".to_string())?
}

#[tauri::command]
pub async fn google_drive_token(
    user_id: String,
    group_id: String,
    force: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = GATE.lock().map_err(|_| "Connection is busy")?;
        let name = identity(&user_id, &group_id)?;
        let mut stored = read(&name)?;
        if !force && stored.expires_at > now() {
            return Ok(stored.access_token);
        }
        let result = exchange(&[
            ("client_id", &stored.client.client_id),
            ("client_secret", &stored.client.client_secret),
            ("refresh_token", &stored.refresh_token),
            ("grant_type", "refresh_token"),
        ]);
        let tokens = match result {
            Ok(t) => t,
            Err(e) => {
                if e == "GOOGLE_RECONNECT_REQUIRED" {
                    let _ = entry(&name)?.delete_credential();
                }
                return Err(e);
            }
        };
        stored.access_token = tokens.access_token;
        stored.expires_at = now() + tokens.expires_in.saturating_sub(60);
        if let Some(token) = tokens.refresh_token {
            stored.refresh_token = token;
        }
        save(&name, &stored)?;
        Ok(stored.access_token)
    })
    .await
    .map_err(|_| "Desktop connection task failed".to_string())?
}

#[tauri::command]
pub async fn google_drive_disconnect(user_id: String, group_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = GATE.lock().map_err(|_| "Connection is busy")?;
        let name = identity(&user_id, &group_id)?;
        match entry(&name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Cannot remove stored connection".into()),
        }
    })
    .await
    .map_err(|_| "Desktop connection task failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_secure_store_roundtrip() {
        let name = format!("probe-{}", random());
        let credential = keyring::Entry::new("phdnexus.google-drive.tests", &name).unwrap();
        credential.set_password("synthetic-test-value-no-real-token").unwrap();
        let retrieved = credential.get_password();
        let removed = credential.delete_credential();
        assert_eq!(retrieved.unwrap(), "synthetic-test-value-no-real-token");
        assert!(removed.is_ok());
        assert!(matches!(credential.get_password(), Err(keyring::Error::NoEntry)));
    }
    #[test]
    fn random_pkce_and_identity() {
        let a = random();
        assert!(a.len() >= 43);
        assert_ne!(a, random());
        assert!(identity("bad", "bad").is_err());
        assert_ne!(
            identity(
                "11111111-1111-1111-1111-111111111111",
                "22222222-2222-2222-2222-222222222222"
            )
            .unwrap(),
            identity(
                "33333333-3333-3333-3333-333333333333",
                "22222222-2222-2222-2222-222222222222"
            )
            .unwrap()
        );
    }
}
