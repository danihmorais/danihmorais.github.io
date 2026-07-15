use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    pub http_client: reqwest::Client,
}

fn extrair_recursos() -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir().join("licita_ai_runtime");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let python_exe = include_bytes!("../bin/python_backend.exe");
    fs::write(temp_dir.join("python_backend.exe"), python_exe).map_err(|e| e.to_string())?;

    let modelos_dir = temp_dir.join("modelos");
    fs::create_dir_all(&modelos_dir).map_err(|e| e.to_string())?;

    let dfd = include_bytes!("../../modelos/DFD - BASE.docx");
    let etp = include_bytes!("../../modelos/ETP - BASE.docx");
    let tr = include_bytes!("../../modelos/TR - BASE.docx");

    fs::write(modelos_dir.join("DFD - BASE.docx"), dfd).map_err(|e| e.to_string())?;
    fs::write(modelos_dir.join("ETP - BASE.docx"), etp).map_err(|e| e.to_string())?;
    fs::write(modelos_dir.join("TR - BASE.docx"), tr).map_err(|e| e.to_string())?;

    Ok(temp_dir)
}

#[tauri::command]
async fn gerar_documentos(app: AppHandle, dados_usuario: Value, dados_ia: Value) -> Result<String, String> {
    let temp_dir = extrair_recursos()?;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backend_path = temp_dir.join("python_backend.exe");

    let mut child = Command::new(backend_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Falha ao iniciar o backend integrado: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let payload = json!({
            "acao": "salvar_documentos",
            "dados_ia": dados_ia,
            "dados_usuario": dados_usuario,
            "preenchimentos_manuais": {},
            "pasta_saida": "Documentos_Gerados",
            "pasta_modelos": temp_dir.join("modelos").to_string_lossy().to_string(),
            "arquivos_base": [
                "DFD - BASE.docx",
                "ETP - BASE.docx",
                "TR - BASE.docx"
            ],
            "app_data_dir": app_dir.to_string_lossy().to_string()
        });

        stdin.write_all(payload.to_string().as_bytes()).await.map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command]
fn salvar_config_ia(app: AppHandle, provedor: String, chave: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let settings_path = app_dir.join("settings.json");

    let mut settings = if let Ok(content) = fs::read_to_string(&settings_path) {
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    settings["provedor"] = json!(provedor);
    settings["chave_api"] = json!(chave);

    fs::write(settings_path, serde_json::to_string_pretty(&settings).unwrap_or_default())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn ler_config_ia(app: AppHandle) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_path = app_dir.join("settings.json");

    if let Ok(content) = fs::read_to_string(settings_path) {
        if let Ok(settings) = serde_json::from_str::<Value>(&content) {
            return Ok(settings);
        }
    }

    Ok(json!({
        "provedor": "gemini",
        "chave_api": ""
    }))
}

#[tauri::command]
fn salvar_dados_usuario(app: AppHandle, dados: Value) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let settings_path = app_dir.join("settings.json");

    let mut settings = if let Ok(content) = fs::read_to_string(&settings_path) {
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    settings["dados_usuario"] = dados;

    fs::write(settings_path, serde_json::to_string_pretty(&settings).unwrap_or_default())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn ler_dados_usuario(app: AppHandle) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_path = app_dir.join("settings.json");

    if let Ok(content) = fs::read_to_string(settings_path) {
        if let Ok(settings) = serde_json::from_str::<Value>(&content) {
            if let Some(dados) = settings.get("dados_usuario") {
                return Ok(dados.clone());
            }
        }
    }

    Ok(json!({}))
}

#[tauri::command]
fn abrir_link(app: AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn aplicar_atualizacao(url: String) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let exe_path = temp_dir.join("licita_ai_update.exe");
    let client = reqwest::Client::new();
    
    let response = client.get(&url)
        .header("User-Agent", "licita-ai-updater")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Falha ao baixar o executável: Status {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let mut file = std::fs::File::create(&exe_path).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;

    std::process::Command::new(exe_path).spawn().map_err(|e| e.to_string())?;
    std::process::exit(0);
}

#[derive(serde::Serialize)]
pub struct StatusApis {
    pub gemini: bool,
    pub openrouter: bool,
}

#[tauri::command]
async fn verificar_status_apis(state: State<'_, AppState>) -> Result<StatusApis, String> {
    let gemini = state.http_client
        .get("https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    let openrouter = state.http_client
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    Ok(StatusApis { gemini, openrouter })
}

#[tauri::command]
fn abrir_pasta_documentos() -> Result<(), String> {
    let mut alvo = None;

    if let Ok(dir) = std::env::current_dir() {
        let p = dir.join("Documentos_Gerados");
        if p.exists() {
            alvo = Some(p);
        }
    }

    if alvo.is_none() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let p = parent.join("Documentos_Gerados");
                if p.exists() {
                    alvo = Some(p);
                }
            }
        }
    }

    let pasta = alvo.ok_or_else(|| String::from("A pasta 'Documentos_Gerados' ainda não existe. Confeccione os documentos primeiro."))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&pasta)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&pasta)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&pasta)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("Falha ao construir o cliente HTTP");

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { http_client })
        .invoke_handler(tauri::generate_handler![
            gerar_documentos,
            salvar_config_ia,
            ler_config_ia,
            salvar_dados_usuario,
            ler_dados_usuario,
            abrir_link,
            aplicar_atualizacao,
            verificar_status_apis,
            abrir_pasta_documentos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}