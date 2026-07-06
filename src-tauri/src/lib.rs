use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

fn get_base_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Não foi possível localizar o diretório do executável".to_string())
        .map(|p| p.to_path_buf())
}

fn extrair_recursos() -> Result<PathBuf, String> {
    let base_dir = get_base_dir()?;

    let python_path = base_dir.join("python_backend.exe");
    let python_exe = include_bytes!("../bin/python_backend.exe");
    fs::write(&python_path, python_exe).map_err(|e| format!("Erro ao extrair python_backend.exe: {}", e))?;

    let modelos_dir = base_dir.join("modelos");
    fs::create_dir_all(&modelos_dir).map_err(|e| format!("Erro ao criar pasta modelos: {}", e))?;

    let dispensa_de = include_bytes!("../../modelos/Dispensa xx Proc xx -  MINUTA DE 15.04.2026.docx");
    let dispensa_dp = include_bytes!("../../modelos/Dispensa xx Proc xx -  MINUTA DP 15.04.2026.docx");
    let pregao_pe = include_bytes!("../../modelos/Pregão xx Proc xx -  MINUTA PE 15.04.2026.docx");
    let pregao_pp = include_bytes!("../../modelos/Pregão xx Proc xx -  MINUTA PP 15.04.2026.docx");

    fs::write(modelos_dir.join("Dispensa xx Proc xx -  MINUTA DE 15.04.2026.docx"), dispensa_de)
        .map_err(|e| format!("Erro ao extrair Dispensa DE: {}", e))?;
    fs::write(modelos_dir.join("Dispensa xx Proc xx -  MINUTA DP 15.04.2026.docx"), dispensa_dp)
        .map_err(|e| format!("Erro ao extrair Dispensa DP: {}", e))?;
    fs::write(modelos_dir.join("Pregão xx Proc xx -  MINUTA PE 15.04.2026.docx"), pregao_pe)
        .map_err(|e| format!("Erro ao extrair Pregão PE: {}", e))?;
    fs::write(modelos_dir.join("Pregão xx Proc xx -  MINUTA PP 15.04.2026.docx"), pregao_pp)
        .map_err(|e| format!("Erro ao extrair Pregão PP: {}", e))?;

    Ok(base_dir)
}

#[tauri::command]
async fn gerar_documentos(_app: AppHandle, dados_usuario: Value, arquivos_base: Vec<String>) -> Result<String, String> {
    let base_dir = match extrair_recursos() {
        Ok(dir) => dir,
        Err(e) => return Err(e),
    };
    
    let backend_path = base_dir.join("python_backend.exe");
    let tipo_edital = arquivos_base.first().cloned().unwrap_or_else(|| "pregao_eletronico".to_string());

    let mut std_cmd = std::process::Command::new(backend_path);
    std_cmd.current_dir(&base_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x08000000);
    }

    let mut command = Command::from(std_cmd);

    let mut child = command.spawn()
        .map_err(|e| format!("Falha ao iniciar o backend integrado: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let payload = json!({
            "tipo_edital": tipo_edital,
            "dados_preenchimento": dados_usuario
        });

        stdin.write_all(payload.to_string().as_bytes()).await.map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python falhou criticamente (Status {}). Erro: {}", output.status, stderr_str));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).into_owned();
    
    let json_start = stdout_str.find('{').unwrap_or(0);
    let json_str = &stdout_str[json_start..];

    match serde_json::from_str::<Value>(json_str) {
        Ok(parsed) => {
            if let Some(sucesso) = parsed.get("sucesso").and_then(|s| s.as_bool()) {
                if sucesso {
                    Ok(stdout_str)
                } else {
                    let erro = parsed.get("erro").and_then(|e| e.as_str()).unwrap_or("Erro silencioso no Python.");
                    Err(erro.to_string())
                }
            } else {
                Err(format!("Resposta JSON inválida: {}", stdout_str))
            }
        },
        Err(e) => {
            Err(format!("Falha ao processar resposta: {}\nSaída pura: {}", e, stdout_str))
        }
    }
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
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let exe_path = temp_dir.join(format!("monta_edital_update_{}.exe", timestamp));
    let client = reqwest::Client::new();
    
    let response = client.get(&url)
        .header("User-Agent", "monta-edital-updater")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Falha ao baixar atualização: Status {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let mut file = std::fs::File::create(&exe_path).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
    
    drop(file);

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle", "Hidden",
                "-Command",
                &format!("Start-Process -FilePath '{}'", exe_path.display())
            ])
            .spawn()
            .map_err(|e| format!("Falha ao solicitar elevação: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new(exe_path).spawn().map_err(|e| e.to_string())?;
    }

    std::process::exit(0);
}

#[tauri::command]
fn abrir_pasta_documentos() -> Result<(), String> {
    let base_dir = get_base_dir()?;
    let pasta = base_dir.join("editais_gerados");

    if !pasta.exists() {
        return Err(format!("Pasta não encontrada: {}", pasta.display()));
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&pasta)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            gerar_documentos,
            salvar_dados_usuario,
            ler_dados_usuario,
            abrir_link,
            aplicar_atualizacao,
            abrir_pasta_documentos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}