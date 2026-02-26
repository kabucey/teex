/// On macOS, when Finder opens a file with teex, the kAEOpenDocuments Apple
/// Event is processed during [NSApp finishLaunching] which tao calls inside
/// EventLoop::new() (during Builder::build()). tao's application:openURLs:
/// delegate method panics if its internal state isn't ready yet, and since
/// it's an extern "C" function the panic causes an immediate abort.
///
/// Fix: before Builder::build(), swizzle [NSApplication finishLaunching].
/// Our replacement temporarily patches the delegate's application:openURLs:
/// with a safe version that captures file URLs, calls the original
/// finishLaunching, then restores the original delegate method. This way:
/// - First launch from Finder: our safe handler captures URLs, no crash
/// - Subsequent file opens (app running): tao's restored handler works normally
use std::ffi::c_void;
use std::path::PathBuf;
use std::sync::Mutex;

type Id = *mut c_void;
type Sel = *const c_void;
type Class = *const c_void;
type Method = *mut c_void;

extern "C" {
    fn objc_getClass(name: *const u8) -> Class;
    fn sel_registerName(name: *const u8) -> Sel;
    fn objc_msgSend();
    fn object_getClass(obj: Id) -> Class;
    fn class_getInstanceMethod(cls: Class, sel: Sel) -> Method;
    fn method_setImplementation(method: Method, imp: *const c_void) -> *const c_void;
}

unsafe fn msg0(obj: Id, sel: Sel) -> Id {
    let f: unsafe extern "C" fn(Id, Sel) -> Id = std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}
unsafe fn msg0_usize(obj: Id, sel: Sel) -> usize {
    let f: unsafe extern "C" fn(Id, Sel) -> usize =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}
unsafe fn msg1_usize(obj: Id, sel: Sel, arg: usize) -> Id {
    let f: unsafe extern "C" fn(Id, Sel, usize) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel, arg)
}

static CAPTURED: Mutex<Vec<String>> = Mutex::new(Vec::new());
static ORIGINAL_FINISH_IMP: Mutex<usize> = Mutex::new(0);

unsafe extern "C" fn safe_open_urls(_this: Id, _cmd: Sel, _app: Id, urls: Id) {
    let count_sel = sel_registerName(b"count\0".as_ptr());
    let count = msg0_usize(urls, count_sel);

    let obj_at_sel = sel_registerName(b"objectAtIndex:\0".as_ptr());
    let abs_sel = sel_registerName(b"absoluteString\0".as_ptr());
    let utf8_sel = sel_registerName(b"UTF8String\0".as_ptr());

    let mut strings = Vec::new();
    for i in 0..count {
        let url = msg1_usize(urls, obj_at_sel, i);
        if url.is_null() {
            continue;
        }
        let ns_string = msg0(url, abs_sel);
        if ns_string.is_null() {
            continue;
        }
        let c_str = msg0(ns_string, utf8_sel) as *const i8;
        if c_str.is_null() {
            continue;
        }
        if let Ok(s) = std::ffi::CStr::from_ptr(c_str).to_str() {
            strings.push(s.to_string());
        }
    }

    if let Ok(mut cap) = CAPTURED.lock() {
        cap.extend(strings);
    }
}

unsafe extern "C" fn swizzled_finish_launching(this: Id, cmd: Sel) {
    let delegate_sel = sel_registerName(b"delegate\0".as_ptr());
    let open_sel = sel_registerName(b"application:openURLs:\0".as_ptr());

    let delegate = msg0(this, delegate_sel);

    if !delegate.is_null() {
        let cls = object_getClass(delegate);
        let method = class_getInstanceMethod(cls, open_sel);
        if !method.is_null() {
            method_setImplementation(method, safe_open_urls as *const c_void);
        }
    }

    let original_imp = ORIGINAL_FINISH_IMP.lock().ok().map(|g| *g).unwrap_or(0);
    if original_imp != 0 {
        let f: unsafe extern "C" fn(Id, Sel) = std::mem::transmute(original_imp);
        f(this, cmd);
    }
}

pub fn install() {
    unsafe {
        let cls = objc_getClass(b"NSApplication\0".as_ptr());
        if cls.is_null() {
            return;
        }
        let sel = sel_registerName(b"finishLaunching\0".as_ptr());
        let method = class_getInstanceMethod(cls, sel);
        if method.is_null() {
            return;
        }

        let original = method_setImplementation(method, swizzled_finish_launching as *const c_void);

        if let Ok(mut guard) = ORIGINAL_FINISH_IMP.lock() {
            *guard = original as usize;
        }
    }
}

pub fn take_paths() -> Vec<PathBuf> {
    let strings = {
        let Ok(mut cap) = CAPTURED.lock() else {
            return Vec::new();
        };
        std::mem::take(&mut *cap)
    };
    strings.iter().filter_map(|s| file_url_to_path(s)).collect()
}

fn file_url_to_path(url: &str) -> Option<PathBuf> {
    let encoded = url.strip_prefix("file://")?;
    let mut bytes = Vec::with_capacity(encoded.len());
    let raw = encoded.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            if let Ok(byte) =
                u8::from_str_radix(std::str::from_utf8(&raw[i + 1..i + 3]).unwrap_or(""), 16)
            {
                bytes.push(byte);
                i += 3;
                continue;
            }
        }
        bytes.push(raw[i]);
        i += 1;
    }
    Some(PathBuf::from(String::from_utf8(bytes).ok()?))
}
