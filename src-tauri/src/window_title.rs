use super::*;

#[cfg(target_os = "macos")]
fn set_macos_window_represented_path(
    window: &tauri::Window,
    represented_path: Option<&str>,
) -> Result<(), String> {
    let window_for_main = window.clone();
    let represented_path = represented_path.map(str::to_owned);

    window
        .run_on_main_thread(move || {
            if let Err(error) = unsafe {
                set_macos_window_represented_path_main_thread(
                    &window_for_main,
                    represented_path.as_deref(),
                )
            } {
                eprintln!("{error}");
            }
        })
        .map_err(|e| format!("Unable to schedule macOS proxy icon update: {e}"))
}

#[cfg(target_os = "macos")]
unsafe fn set_macos_window_represented_path_main_thread(
    window: &tauri::Window,
    represented_path: Option<&str>,
) -> Result<(), String> {
    type Id = *mut c_void;
    type Sel = *const c_void;
    type Class = *const c_void;

    extern "C" {
        fn objc_getClass(name: *const c_char) -> Class;
        fn sel_registerName(name: *const c_char) -> Sel;
        fn objc_msgSend();
    }

    unsafe fn msg1_id(obj: Id, sel: Sel, arg: Id) -> Id {
        let f: unsafe extern "C" fn(Id, Sel, Id) -> Id =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel, arg)
    }

    unsafe fn msg1_cstr(obj: Id, sel: Sel, arg: *const c_char) -> Id {
        let f: unsafe extern "C" fn(Id, Sel, *const c_char) -> Id =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel, arg)
    }

    unsafe fn msg1_void_id(obj: Id, sel: Sel, arg: Id) {
        let f: unsafe extern "C" fn(Id, Sel, Id) =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(obj, sel, arg);
    }

    let ns_window = window
        .ns_window()
        .map_err(|e| format!("Unable to access native macOS window: {e}"))?
        as Id;
    if ns_window.is_null() {
        return Err("macOS NSWindow handle was null".to_string());
    }

    let represented_url: Id = if let Some(path) = represented_path {
        let path_cstr = CString::new(path)
            .map_err(|_| "Represented path contains an unsupported NUL byte".to_string())?;

        let ns_string_class = objc_getClass(c"NSString".as_ptr());
        let ns_url_class = objc_getClass(c"NSURL".as_ptr());
        if ns_string_class.is_null() || ns_url_class.is_null() {
            return Err("Unable to load macOS Foundation classes for proxy icon".to_string());
        }

        let string_with_utf8_sel = sel_registerName(c"stringWithUTF8String:".as_ptr());
        let file_url_with_path_sel = sel_registerName(c"fileURLWithPath:".as_ptr());

        let ns_path = msg1_cstr(
            ns_string_class as Id,
            string_with_utf8_sel,
            path_cstr.as_ptr(),
        );
        if ns_path.is_null() {
            return Err("Unable to create NSString for represented path".to_string());
        }

        let ns_url = msg1_id(ns_url_class as Id, file_url_with_path_sel, ns_path);
        if ns_url.is_null() {
            return Err("Unable to create NSURL for represented path".to_string());
        }

        ns_url
    } else {
        std::ptr::null_mut()
    };

    let set_represented_url_sel = sel_registerName(c"setRepresentedURL:".as_ptr());
    msg1_void_id(ns_window, set_represented_url_sel, represented_url);

    Ok(())
}

#[tauri::command]
pub(crate) fn set_window_title(
    window: tauri::Window,
    title: String,
    represented_path: Option<String>,
) -> Result<(), String> {
    window
        .set_title(&title)
        .map_err(|e| format!("Unable to set window title: {e}"))?;

    #[cfg(target_os = "macos")]
    set_macos_window_represented_path(&window, represented_path.as_deref())?;

    #[cfg(not(target_os = "macos"))]
    let _ = represented_path;

    Ok(())
}
