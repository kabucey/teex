use std::ffi::{c_char, c_void};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

type Id = *mut c_void;
type Sel = *const c_void;
type Class = *const c_void;
type Method = *mut c_void;

extern "C" {
    fn objc_getClass(name: *const c_char) -> Class;
    fn sel_registerName(name: *const c_char) -> Sel;
    fn objc_msgSend();
    fn class_getInstanceMethod(cls: Class, sel: Sel) -> Method;
    fn method_setImplementation(method: Method, imp: *const c_void) -> *const c_void;
}

unsafe fn msg0_usize(obj: Id, sel: Sel) -> usize {
    let f: unsafe extern "C" fn(Id, Sel) -> usize =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}

unsafe fn msg0_f64(obj: Id, sel: Sel) -> f64 {
    let f: unsafe extern "C" fn(Id, Sel) -> f64 =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, sel)
}

const NS_SWIPE_GESTURE: usize = 31;

static ORIGINAL_SEND_EVENT_IMP: AtomicUsize = AtomicUsize::new(0);
static TYPE_SEL: AtomicUsize = AtomicUsize::new(0);
static APP_HANDLE: Mutex<Option<tauri::AppHandle>> = Mutex::new(None);

unsafe extern "C" fn swizzled_send_event(this: Id, cmd: Sel, event: Id) {
    let type_sel = TYPE_SEL.load(Ordering::Relaxed) as Sel;
    let event_type = msg0_usize(event, type_sel);

    if event_type == NS_SWIPE_GESTURE {
        let dx = msg0_f64(event, sel_registerName(c"deltaX".as_ptr()));
        if dx != 0.0 {
            if let Ok(guard) = APP_HANDLE.lock() {
                if let Some(app) = guard.as_ref() {
                    emit_mouse_nav(app, dx);
                }
            }
            return;
        }
    }

    let original_imp = ORIGINAL_SEND_EVENT_IMP.load(Ordering::Relaxed);
    if original_imp != 0 {
        let f: unsafe extern "C" fn(Id, Sel, Id) = std::mem::transmute(original_imp);
        f(this, cmd, event);
    }
}

fn emit_mouse_nav(app: &tauri::AppHandle, delta_x: f64) {
    let event_name = if delta_x > 0.0 {
        crate::EVENT_MOUSE_NAV_BACK
    } else {
        crate::EVENT_MOUSE_NAV_FORWARD
    };

    if let Some(window) = crate::menu_events::target_window(app) {
        crate::menu_events::emit_to_window(app, window.label(), event_name, ());
    }
}

pub(crate) fn install(app: &tauri::AppHandle) {
    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = Some(app.clone());
    }

    unsafe {
        TYPE_SEL.store(
            sel_registerName(c"type".as_ptr()) as usize,
            Ordering::Relaxed,
        );

        let cls = objc_getClass(c"NSApplication".as_ptr());
        if cls.is_null() {
            return;
        }
        let sel = sel_registerName(c"sendEvent:".as_ptr());
        let method = class_getInstanceMethod(cls, sel);
        if method.is_null() {
            return;
        }

        let original = method_setImplementation(method, swizzled_send_event as *const c_void);
        ORIGINAL_SEND_EVENT_IMP.store(original as usize, Ordering::Relaxed);
    }
}
