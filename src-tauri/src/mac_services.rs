use super::*;
use std::sync::Mutex;

type Id = *mut c_void;
type Sel = *const c_void;
type Class = *const c_void;

extern "C" {
    fn objc_getClass(name: *const u8) -> Class;
    fn sel_registerName(name: *const u8) -> Sel;
    fn objc_msgSend();
    fn objc_allocateClassPair(
        superclass: Class,
        name: *const c_char,
        extra_bytes: usize,
    ) -> Class;
    fn objc_registerClassPair(cls: Class);
    fn class_addMethod(cls: Class, name: Sel, imp: *const c_void, types: *const c_char) -> i8;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ServiceAction {
    NewFileTabHere,
    NewWindowHere,
}

#[derive(Debug, Clone)]
pub(crate) struct ServiceRequest {
    pub(crate) action: ServiceAction,
    pub(crate) path: PathBuf,
}

static CAPTURED_SERVICE_REQUESTS: Mutex<Vec<ServiceRequest>> = Mutex::new(Vec::new());

unsafe fn msg0(obj: Id, sel: Sel) -> Id {
    let f: unsafe extern "C" fn(Id, Sel) -> Id = std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}

unsafe fn msg1(obj: Id, sel: Sel, arg: Id) -> Id {
    let f: unsafe extern "C" fn(Id, Sel, Id) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel, arg)
}

unsafe fn msg1_void(obj: Id, sel: Sel, arg: Id) {
    let f: unsafe extern "C" fn(Id, Sel, Id) =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel, arg);
}

unsafe fn msg1_usize(obj: Id, sel: Sel, arg: usize) -> Id {
    let f: unsafe extern "C" fn(Id, Sel, usize) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel, arg)
}

unsafe fn msg1_ptr(obj: Id, sel: Sel, arg: *const i8) -> Id {
    let f: unsafe extern "C" fn(Id, Sel, *const i8) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel, arg)
}

unsafe fn msg2(obj: Id, sel: Sel, a: Id, b: Id) -> Id {
    let f: unsafe extern "C" fn(Id, Sel, Id, Id) -> Id =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel, a, b)
}

unsafe fn msg0_usize(obj: Id, sel: Sel) -> usize {
    let f: unsafe extern "C" fn(Id, Sel) -> usize =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}

unsafe fn ns_string(text: &str) -> Option<Id> {
    let cls = objc_getClass(b"NSString\0".as_ptr());
    if cls.is_null() {
        return None;
    }

    let sel = sel_registerName(b"stringWithUTF8String:\0".as_ptr());
    let c_text = CString::new(text).ok()?;
    let value = msg1_ptr(cls as Id, sel, c_text.as_ptr());
    if value.is_null() { None } else { Some(value) }
}

unsafe fn path_from_ns_string(value: Id) -> Option<PathBuf> {
    if value.is_null() {
        return None;
    }

    let utf8_sel = sel_registerName(b"UTF8String\0".as_ptr());
    let c_str = msg0(value, utf8_sel) as *const i8;
    if c_str.is_null() {
        return None;
    }

    let path = std::ffi::CStr::from_ptr(c_str).to_str().ok()?;
    Some(PathBuf::from(path))
}

unsafe fn extract_paths_from_pasteboard(pasteboard: Id) -> Vec<PathBuf> {
    if pasteboard.is_null() {
        return Vec::new();
    }

    let nsurl_cls = objc_getClass(b"NSURL\0".as_ptr());
    if nsurl_cls.is_null() {
        return Vec::new();
    }

    let nsarray_cls = objc_getClass(b"NSArray\0".as_ptr());
    if nsarray_cls.is_null() {
        return Vec::new();
    }

    let array_with_sel = sel_registerName(b"arrayWithObject:\0".as_ptr());
    let classes = msg1(nsarray_cls as Id, array_with_sel, nsurl_cls as Id);
    if classes.is_null() {
        return Vec::new();
    }

    let read_sel = sel_registerName(b"readObjectsForClasses:options:\0".as_ptr());
    let urls = msg2(pasteboard, read_sel, classes, std::ptr::null_mut());
    if urls.is_null() {
        return Vec::new();
    }

    let count_sel = sel_registerName(b"count\0".as_ptr());
    let object_at_sel = sel_registerName(b"objectAtIndex:\0".as_ptr());
    let path_sel = sel_registerName(b"path\0".as_ptr());
    let count = msg0_usize(urls, count_sel);

    let mut paths = Vec::new();
    for i in 0..count {
        let url = msg1_usize(urls, object_at_sel, i);
        if url.is_null() {
            continue;
        }
        let ns_path = msg0(url, path_sel);
        if let Some(path) = path_from_ns_string(ns_path) {
            paths.push(path);
        }
    }

    paths
}

unsafe fn capture_request(
    action: ServiceAction,
    pasteboard: Id,
    predicate: impl Fn(&PathBuf) -> bool,
) -> bool {
    let path = extract_paths_from_pasteboard(pasteboard)
        .into_iter()
        .find(predicate);

    let Some(path) = path else {
        return false;
    };

    if let Ok(mut requests) = CAPTURED_SERVICE_REQUESTS.lock() {
        requests.push(ServiceRequest { action, path });
        return true;
    }

    false
}

unsafe fn set_service_error(error: *mut Id, message: &str) {
    if !error.is_null() {
        if let Some(msg) = ns_string(message) {
            *error = msg;
        }
    }
}

unsafe extern "C" fn service_new_tab_here(
    _this: Id,
    _cmd: Sel,
    pasteboard: Id,
    _user_data: Id,
    error: *mut Id,
) {
    if !capture_request(ServiceAction::NewFileTabHere, pasteboard, |path| path.is_file()) {
        set_service_error(error, "No suitable file found in selection.");
    }
}

unsafe extern "C" fn service_new_window_here(
    _this: Id,
    _cmd: Sel,
    pasteboard: Id,
    _user_data: Id,
    error: *mut Id,
) {
    if !capture_request(ServiceAction::NewWindowHere, pasteboard, |path| {
        path.is_file() || path.is_dir()
    }) {
        set_service_error(error, "No suitable file or folder found in selection.");
    }
}

pub(crate) fn install() {
    unsafe {
        let ns_object = objc_getClass(b"NSObject\0".as_ptr());
        if ns_object.is_null() {
            return;
        }

        let class_name = CString::new("TeexServicesProvider").ok();
        let Some(class_name) = class_name else {
            return;
        };

        let provider_class = {
            let existing = objc_getClass(b"TeexServicesProvider\0".as_ptr());
            if !existing.is_null() {
                existing
            } else {
                let created = objc_allocateClassPair(ns_object, class_name.as_ptr(), 0);
                if created.is_null() {
                    return;
                }

                let tab_sel = sel_registerName(b"newTeexTabHere:userData:error:\0".as_ptr());
                let window_sel = sel_registerName(b"newTeexWindowHere:userData:error:\0".as_ptr());
                let types = CString::new("v@:@@^@").ok();
                let Some(types) = types else {
                    return;
                };

                if class_addMethod(
                    created,
                    tab_sel,
                    service_new_tab_here as *const c_void,
                    types.as_ptr(),
                ) == 0
                {
                    eprintln!("mac_services: failed to add newTeexTabHere:userData:error:");
                }
                if class_addMethod(
                    created,
                    window_sel,
                    service_new_window_here as *const c_void,
                    types.as_ptr(),
                ) == 0
                {
                    eprintln!("mac_services: failed to add newTeexWindowHere:userData:error:");
                }

                objc_registerClassPair(created);
                created
            }
        };

        let alloc_sel = sel_registerName(b"alloc\0".as_ptr());
        let init_sel = sel_registerName(b"init\0".as_ptr());
        let provider = msg0(msg0(provider_class as Id, alloc_sel), init_sel);
        if provider.is_null() {
            return;
        }

        let ns_app_cls = objc_getClass(b"NSApplication\0".as_ptr());
        if ns_app_cls.is_null() {
            return;
        }
        let shared_sel = sel_registerName(b"sharedApplication\0".as_ptr());
        let app = msg0(ns_app_cls as Id, shared_sel);
        if app.is_null() {
            return;
        }

        let set_provider_sel = sel_registerName(b"setServicesProvider:\0".as_ptr());
        msg1_void(app, set_provider_sel, provider);
    }
}

pub(crate) fn take_requests() -> Vec<ServiceRequest> {
    let Ok(mut requests) = CAPTURED_SERVICE_REQUESTS.lock() else {
        return Vec::new();
    };
    std::mem::take(&mut *requests)
}
