use super::*;

type Id = *mut c_void;

extern "C" {
    fn objc_getClass(name: *const c_char) -> *const c_void;
    fn sel_registerName(name: *const c_char) -> *const c_void;
    fn objc_msgSend();

    fn LSSetDefaultRoleHandlerForContentType(
        content_type: Id,
        role: u32,
        bundle_id: Id,
    ) -> i32;
}

const ROLES_ALL: u32 = 0xFFFF_FFFF;
const MARKDOWN_UTI: &str = "net.daringfireball.markdown";

unsafe fn ns_string(text: &str) -> Option<Id> {
    let cls = objc_getClass(c"NSString".as_ptr());
    if cls.is_null() {
        return None;
    }
    let sel = sel_registerName(c"stringWithUTF8String:".as_ptr());
    let c_text = CString::new(text).ok()?;
    let f: unsafe extern "C" fn(Id, *const c_void, *const i8) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    let value = f(cls as Id, sel, c_text.as_ptr());
    if value.is_null() { None } else { Some(value) }
}

fn set_default_handler(uti: &str, bundle_id: &str) -> Result<(), String> {
    unsafe {
        let uti_str = ns_string(uti).ok_or("Unable to create UTI string")?;
        let bundle_str = ns_string(bundle_id).ok_or("Unable to create bundle ID string")?;
        let status = LSSetDefaultRoleHandlerForContentType(uti_str, ROLES_ALL, bundle_str);
        if status == 0 {
            Ok(())
        } else {
            Err(format!("LSSetDefaultRoleHandlerForContentType returned error {status}"))
        }
    }
}

pub(super) fn set_default_markdown_from_menu(app: &tauri::AppHandle) {
    let app = app.clone();
    let window = target_window(&app);

    let builder = if let Some(ref w) = window {
        w.dialog()
            .message("Set teex as the default application for Markdown (.md) files?")
            .title("Set Default Application")
            .kind(MessageDialogKind::Info)
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .parent(w)
    } else {
        app.dialog()
            .message("Set teex as the default application for Markdown (.md) files?")
            .title("Set Default Application")
            .kind(MessageDialogKind::Info)
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
    };

    builder.show(move |confirmed| {
        if !confirmed {
            return;
        }

        let bundle_id = &app.config().identifier;
        match set_default_handler(MARKDOWN_UTI, bundle_id) {
            Ok(()) => show_message_dialog(
                &app,
                "Default Application Set",
                "teex is now the default application for Markdown files.".into(),
                MessageDialogKind::Info,
            ),
            Err(e) => show_message_dialog(
                &app,
                "Unable to Set Default Application",
                e,
                MessageDialogKind::Error,
            ),
        }
    });
}

fn show_message_dialog(
    app: &tauri::AppHandle,
    title: &str,
    message: String,
    kind: MessageDialogKind,
) {
    if let Some(window) = target_window(app) {
        window
            .dialog()
            .message(message)
            .title(title)
            .kind(kind)
            .parent(&window)
            .show(|_| {});
        return;
    }

    app.dialog()
        .message(message)
        .title(title)
        .kind(kind)
        .show(|_| {});
}
