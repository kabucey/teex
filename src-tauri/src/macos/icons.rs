use base64::{engine::general_purpose::STANDARD, Engine};
use std::ffi::{c_char, c_void, CString};

type Id = *mut c_void;

extern "C" {
    fn objc_getClass(name: *const c_char) -> *const c_void;
    fn sel_registerName(name: *const c_char) -> *const c_void;
    fn objc_msgSend();
}

unsafe fn msg0(obj: Id, sel: *const c_void) -> Id {
    let f: unsafe extern "C" fn(Id, *const c_void) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}

unsafe fn msg1_ptr(obj: Id, sel: *const c_void, arg: Id) -> Id {
    let f: unsafe extern "C" fn(Id, *const c_void, Id) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel, arg)
}

unsafe fn msg1_usize(obj: Id, sel: *const c_void) -> usize {
    let f: unsafe extern "C" fn(Id, *const c_void) -> usize =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}

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
    if value.is_null() {
        None
    } else {
        Some(value)
    }
}

/// Fetches the macOS system folder icon via NSWorkspace and returns it as a
/// base64-encoded `data:image/png;base64,...` string.
pub(crate) fn get_system_folder_icon() -> Option<String> {
    unsafe {
        // [[NSWorkspace sharedWorkspace] iconForFile:@"/System"]
        let workspace_cls = objc_getClass(c"NSWorkspace".as_ptr());
        if workspace_cls.is_null() {
            return None;
        }
        let workspace = msg0(
            workspace_cls as Id,
            sel_registerName(c"sharedWorkspace".as_ptr()),
        );
        if workspace.is_null() {
            return None;
        }

        let path = ns_string("/System")?;
        let icon = msg1_ptr(
            workspace,
            sel_registerName(c"iconForFile:".as_ptr()),
            path,
        );
        if icon.is_null() {
            return None;
        }

        // [icon setSize:NSMakeSize(32, 32)]
        let sel = sel_registerName(c"setSize:".as_ptr());
        let f: unsafe extern "C" fn(Id, *const c_void, f64, f64) =
            std::mem::transmute(objc_msgSend as *const c_void);
        f(icon, sel, 32.0, 32.0);

        // [icon TIFFRepresentation] -> NSData
        let tiff_data = msg0(icon, sel_registerName(c"TIFFRepresentation".as_ptr()));
        if tiff_data.is_null() {
            return None;
        }

        // [[NSBitmapImageRep alloc] initWithData:tiffData]
        let bmp_cls = objc_getClass(c"NSBitmapImageRep".as_ptr());
        if bmp_cls.is_null() {
            return None;
        }
        let alloc = msg0(bmp_cls as Id, sel_registerName(c"alloc".as_ptr()));
        let rep = msg1_ptr(
            alloc,
            sel_registerName(c"initWithData:".as_ptr()),
            tiff_data,
        );
        if rep.is_null() {
            return None;
        }

        // [rep representationUsingType:NSBitmapImageFileTypePNG properties:nil]
        // NSBitmapImageFileTypePNG = 4
        let sel = sel_registerName(c"representationUsingType:properties:".as_ptr());
        let f: unsafe extern "C" fn(Id, *const c_void, usize, Id) -> Id =
            std::mem::transmute(objc_msgSend as *const c_void);
        let png_data = f(rep, sel, 4, std::ptr::null_mut());
        if png_data.is_null() {
            return None;
        }

        // Extract bytes from NSData
        let ptr = msg0(png_data, sel_registerName(c"bytes".as_ptr()));
        let len = msg1_usize(png_data, sel_registerName(c"length".as_ptr()));
        if ptr.is_null() || len == 0 {
            return None;
        }

        let bytes = std::slice::from_raw_parts(ptr as *const u8, len);
        let encoded = STANDARD.encode(bytes);
        Some(format!("data:image/png;base64,{encoded}"))
    }
}
