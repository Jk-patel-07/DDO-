use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
          let size = monitor.size();
          let scale_factor = monitor.scale_factor();
          
          let logical_width = 520.0;
          let logical_height = 32.0;
          
          let physical_width = (logical_width * scale_factor) as u32;
          let physical_height = (logical_height * scale_factor) as u32;
          
          let x_pos = ((size.width - physical_width) / 2) as i32;
          
          let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: x_pos, y: 0 }));
          let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: physical_width,
            height: physical_height,
          }));
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
