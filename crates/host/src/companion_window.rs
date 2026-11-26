//! Native Windows frame for the companion window: truly cut-off rounded corners (via `SetWindowRgn`, so
//! clicks in the corners pass straight through to whatever is behind), no Windows 11 1 px light border, and a
//! matching soft drop shadow rendered by an unowned click-through layered window behind it (identical on
//! Windows 10 and 11).

use std::sync::Arc;
use std::sync::Once;
use std::sync::atomic::{AtomicBool, Ordering};

use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM};
use windows::Win32::Graphics::Gdi::{
    AC_SRC_ALPHA, AC_SRC_OVER, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BLENDFUNCTION, CreateCompatibleDC,
    CreateDIBSection, CreateRoundRectRgn, DIB_RGB_COLORS, DeleteDC, DeleteObject, SelectObject, SetWindowRgn,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, CreateWindowExW, DefWindowProcW, DestroyWindow, GetWindowRect, IsIconic, IsWindowVisible,
    IsZoomed, PostMessageW, RegisterClassExW, SC_MINIMIZE, SW_HIDE, SW_RESTORE, SW_SHOW, SW_SHOWMINNOACTIVE,
    SWP_NOACTIVATE, SWP_SHOWWINDOW, SetForegroundWindow, SetWindowPos, ShowWindow, ULW_ALPHA, UpdateLayeredWindow,
    WM_CLOSE, WM_DPICHANGED, WM_NCDESTROY, WM_SHOWWINDOW, WM_SYSCOMMAND, WM_WINDOWPOSCHANGED, WNDCLASSEXW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
};
use windows::core::w;

/// Logical corner radius matching `.ob` (`border-radius: 18px`) in `companion.css`.
const CORNER_RADIUS_LOGICAL: f32 = 18.0;
/// Logical shadow bleed margin around the window on each side.
const SHADOW_PAD_LOGICAL: f32 = 28.0;
/// Logical downward offset of the shadow relative to the window.
const SHADOW_OFFSET_Y_LOGICAL: f32 = 8.0;
/// Logical Gaussian sigma for the shadow falloff.
const SHADOW_SIGMA_LOGICAL: f32 = 11.0;
/// Peak opacity of the shadow directly behind the window edge.
const SHADOW_MAX_ALPHA: f32 = 0.56;

const SUBCLASS_ID: usize = 0x5750_4652; // "WPFR"

struct FrameState {
    shadow: HWND,
    keep_in_tray: Arc<AtomicBool>,
    last_key: Option<(i32, i32, u32, bool)>,
}

/// Attaches the rounded window region, soft shadow window, and minimize-to-tray interception to the
/// companion's top-level `HWND`. Must be called on the window's UI thread.
pub fn attach(hwnd: isize, keep_in_tray: Arc<AtomicBool>) {
    if hwnd == 0 {
        return;
    }
    let main = HWND(hwnd as *mut _);
    let Some(shadow) = create_shadow_window() else {
        return;
    };
    let mut state = Box::new(FrameState { shadow, keep_in_tray, last_key: None });
    sync_frame(main, &mut state);
    let raw = Box::into_raw(state);
    // SAFETY: `main` is a valid top-level window on the current UI thread, `subclass_proc` has matching ABI,
    // and `raw` is reclaimed once in `WM_NCDESTROY`.
    let ok = unsafe { SetWindowSubclass(main, Some(subclass_proc), SUBCLASS_ID, raw as usize) };
    if !ok.as_bool() {
        // SAFETY: `SetWindowSubclass` failed so `subclass_proc` will never run; reclaim `raw` and destroy `shadow`.
        unsafe {
            let state = Box::from_raw(raw);
            let _ = DestroyWindow(state.shadow);
        }
    }
}

/// Shows the window minimized on the taskbar without activating it or flashing it on screen first.
pub fn show_minimized_no_activate(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    let main = HWND(hwnd as *mut _);
    // SAFETY: `main` is the app's companion window handle on the UI thread.
    unsafe {
        let _ = ShowWindow(main, SW_SHOWMINNOACTIVE);
    }
}

/// Restores (if minimized), shows, and brings the companion window to the foreground.
pub fn force_foreground(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    let main = HWND(hwnd as *mut _);
    // SAFETY: `main` is the app's companion window handle; these are standard Win32 foreground calls.
    unsafe {
        if IsIconic(main).as_bool() {
            let _ = ShowWindow(main, SW_RESTORE);
        } else {
            let _ = ShowWindow(main, SW_SHOW);
        }
        let _ = BringWindowToTop(main);
        let _ = SetForegroundWindow(main);
    }
}

unsafe extern "system" fn shadow_wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // SAFETY: standard default window procedure for the click-through shadow popup.
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

fn create_shadow_window() -> Option<HWND> {
    static REGISTER: Once = Once::new();
    let class_name = w!("WestPlayCompanionShadow");
    // SAFETY: `GetModuleHandleW(None)` returns the current executable module.
    let instance = unsafe { GetModuleHandleW(None) }.ok()?;
    REGISTER.call_once(|| {
        let wc = WNDCLASSEXW {
            cbSize: size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(shadow_wnd_proc),
            hInstance: instance.into(),
            lpszClassName: class_name,
            ..Default::default()
        };
        // SAFETY: `wc` is fully initialized with a static class name and valid `hInstance`.
        unsafe {
            RegisterClassExW(&wc);
        }
    });
    // SAFETY: creates an unowned click-through layered popup window on the UI thread.
    unsafe {
        CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class_name,
            w!(""),
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance.into()),
            None,
        )
    }
    .ok()
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    ref_data: usize,
) -> LRESULT {
    // SAFETY: `ref_data` is the `Box<FrameState>` installed in `attach`, valid until `WM_NCDESTROY`.
    let state = unsafe { &mut *(ref_data as *mut FrameState) };
    match msg {
        WM_SYSCOMMAND if (wparam.0 & 0xFFF0) == SC_MINIMIZE as usize && state.keep_in_tray.load(Ordering::Relaxed) => {
            // SAFETY: posting `WM_CLOSE` routes taskbar/system minimize through Tauri's close-to-tray
            // lifecycle so the companion window and its WebView2 processes are fully released.
            unsafe {
                let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
            return LRESULT(0);
        }
        WM_WINDOWPOSCHANGED | WM_SHOWWINDOW | WM_DPICHANGED => {
            // SAFETY: forwards message to `DefSubclassProc` first so `hwnd` geometry/visibility is up to date.
            let res = unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) };
            sync_frame(hwnd, state);
            return res;
        }
        WM_NCDESTROY => {
            let shadow = state.shadow;
            // SAFETY: removes this subclass and frees `FrameState` exactly once as the window is destroyed.
            unsafe {
                let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
                let _ = DestroyWindow(shadow);
                drop(Box::from_raw(ref_data as *mut FrameState));
                return DefSubclassProc(hwnd, msg, wparam, lparam);
            }
        }
        _ => {}
    }
    // SAFETY: forwards all unhandled messages to the original window procedure chain.
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

fn sync_frame(main: HWND, state: &mut FrameState) {
    // SAFETY: `main` and `state.shadow` are valid `HWND`s on the UI thread.
    unsafe {
        let visible = IsWindowVisible(main).as_bool();
        let minimized = IsIconic(main).as_bool();
        let maximized = IsZoomed(main).as_bool();

        let mut rect = RECT::default();
        if GetWindowRect(main, &mut rect).is_err() {
            return;
        }
        let w = (rect.right - rect.left).max(0);
        let h = (rect.bottom - rect.top).max(0);
        let dpi = GetDpiForWindow(main).max(96);
        let scale = dpi as f32 / 96.0;
        let radius = (CORNER_RADIUS_LOGICAL * scale).round() as i32;
        let pad = (SHADOW_PAD_LOGICAL * scale).round() as i32;
        let offset_y = (SHADOW_OFFSET_Y_LOGICAL * scale).round() as i32;

        let key = (w, h, dpi, maximized);
        let size_changed = state.last_key != Some(key);
        if size_changed && w > 0 && h > 0 {
            state.last_key = Some(key);
            if maximized {
                let _ = SetWindowRgn(main, None, true);
            } else {
                let rgn = CreateRoundRectRgn(0, 0, w + 1, h + 1, radius * 2, radius * 2);
                if !rgn.is_invalid() && SetWindowRgn(main, Some(rgn), true) == 0 {
                    let _ = DeleteObject(rgn.into());
                }
                update_shadow_bitmap(
                    state.shadow,
                    rect.left - pad,
                    rect.top - pad + offset_y,
                    w,
                    h,
                    pad,
                    radius as f32,
                    SHADOW_SIGMA_LOGICAL * scale,
                );
            }
        }

        if !visible || minimized || maximized || w == 0 || h == 0 {
            if IsWindowVisible(state.shadow).as_bool() {
                let _ = ShowWindow(state.shadow, SW_HIDE);
            }
            return;
        }

        let shadow_x = rect.left - pad;
        let shadow_y = rect.top - pad + offset_y;
        let shadow_w = w + pad * 2;
        let shadow_h = h + pad * 2;
        // `hwndInsertAfter = main` places `state.shadow` directly behind `main` in Z-order.
        let _ = SetWindowPos(
            state.shadow,
            Some(main),
            shadow_x,
            shadow_y,
            shadow_w,
            shadow_h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn update_shadow_bitmap(
    shadow: HWND,
    dst_x: i32,
    dst_y: i32,
    win_w: i32,
    win_h: i32,
    pad: i32,
    radius: f32,
    sigma: f32,
) {
    let total_w = win_w + pad * 2;
    let total_h = win_h + pad * 2;
    if total_w <= 0 || total_h <= 0 {
        return;
    }

    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: total_w,
            biHeight: -total_h, // top-down DIB
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    // SAFETY: creates a temporary compatible memory DC and 32-bpp DIB section for `UpdateLayeredWindow`.
    unsafe {
        let mem_dc = CreateCompatibleDC(None);
        if mem_dc.is_invalid() {
            return;
        }
        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let Ok(dib) = CreateDIBSection(Some(mem_dc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0) else {
            let _ = DeleteDC(mem_dc);
            return;
        };
        if bits.is_null() {
            let _ = DeleteObject(dib.into());
            let _ = DeleteDC(mem_dc);
            return;
        }

        let prev = SelectObject(mem_dc, dib.into());
        let len = (total_w as usize) * (total_h as usize) * 4;
        // SAFETY: `bits` points to `total_w * total_h * 4` bytes owned by `dib`.
        let pixels = std::slice::from_raw_parts_mut(bits.cast::<u8>(), len);
        fill_shadow_bgra(pixels, win_w, win_h, pad, radius, sigma);

        let pt_dst = POINT { x: dst_x, y: dst_y };
        let size = SIZE { cx: total_w, cy: total_h };
        let pt_src = POINT { x: 0, y: 0 };
        let blend = BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: 255,
            AlphaFormat: AC_SRC_ALPHA as u8,
        };
        let _ = UpdateLayeredWindow(
            shadow,
            None,
            Some(&pt_dst),
            Some(&size),
            Some(mem_dc),
            Some(&pt_src),
            COLORREF(0),
            Some(&blend),
            ULW_ALPHA,
        );

        SelectObject(mem_dc, prev);
        let _ = DeleteObject(dib.into());
        let _ = DeleteDC(mem_dc);
    }
}

/// Writes a premultiplied BGRA soft rounded-rectangle shadow into `pixels` (`total_w * total_h * 4`).
fn fill_shadow_bgra(pixels: &mut [u8], win_w: i32, win_h: i32, pad: i32, radius: f32, sigma: f32) {
    let total_w = (win_w + pad * 2) as usize;
    let total_h = (win_h + pad * 2) as usize;
    let half_w = win_w as f32 * 0.5;
    let half_h = win_h as f32 * 0.5;
    let center_x = pad as f32 + half_w;
    let center_y = pad as f32 + half_h;
    let inner_x = (half_w - radius).max(0.0);
    let inner_y = (half_h - radius).max(0.0);
    let pad_f = pad as f32;
    let inv_two_sigma2 = 0.5 / (sigma * sigma).max(1.0);
    let edge_tail = (-pad_f * pad_f * inv_two_sigma2).exp();
    let norm = 1.0 / (1.0 - edge_tail).max(1e-5);
    let peak_alpha = (SHADOW_MAX_ALPHA * 255.0).round() as u8;

    // Fast path bounds for the interior rectangle away from edges & corners.
    let solid_left = pad + radius.ceil() as i32;
    let solid_right = (pad + win_w - radius.ceil() as i32).max(solid_left);
    let solid_top = pad + radius.ceil() as i32;
    let solid_bottom = (pad + win_h - radius.ceil() as i32).max(solid_top);

    for y in 0..total_h {
        let row_offset = y * total_w * 4;
        let yi = y as i32;
        if yi >= solid_top && yi < solid_bottom {
            // Left and right border bands; interior stays uniform peak_alpha.
            for x in 0..solid_left.max(0) as usize {
                let a = pixel_alpha(
                    x as f32 + 0.5,
                    y as f32 + 0.5,
                    center_x,
                    center_y,
                    inner_x,
                    inner_y,
                    radius,
                    pad_f,
                    inv_two_sigma2,
                    edge_tail,
                    norm,
                );
                pixels[row_offset + x * 4 + 3] = a;
            }
            for x in (solid_left.max(0) as usize)..(solid_right.min(total_w as i32) as usize) {
                pixels[row_offset + x * 4 + 3] = peak_alpha;
            }
            for x in (solid_right.min(total_w as i32) as usize)..total_w {
                let a = pixel_alpha(
                    x as f32 + 0.5,
                    y as f32 + 0.5,
                    center_x,
                    center_y,
                    inner_x,
                    inner_y,
                    radius,
                    pad_f,
                    inv_two_sigma2,
                    edge_tail,
                    norm,
                );
                pixels[row_offset + x * 4 + 3] = a;
            }
        } else {
            for x in 0..total_w {
                let a = pixel_alpha(
                    x as f32 + 0.5,
                    y as f32 + 0.5,
                    center_x,
                    center_y,
                    inner_x,
                    inner_y,
                    radius,
                    pad_f,
                    inv_two_sigma2,
                    edge_tail,
                    norm,
                );
                pixels[row_offset + x * 4 + 3] = a;
            }
        }
    }
}

#[inline]
#[allow(clippy::too_many_arguments)]
fn pixel_alpha(
    px: f32,
    py: f32,
    center_x: f32,
    center_y: f32,
    inner_x: f32,
    inner_y: f32,
    radius: f32,
    pad: f32,
    inv_two_sigma2: f32,
    edge_tail: f32,
    norm: f32,
) -> u8 {
    let qx = (px - center_x).abs() - inner_x;
    let qy = (py - center_y).abs() - inner_y;
    let ox = qx.max(0.0);
    let oy = qy.max(0.0);
    let dist = (ox * ox + oy * oy).sqrt() + qx.max(qy).min(0.0) - radius;
    if dist <= 0.0 {
        return (SHADOW_MAX_ALPHA * 255.0).round() as u8;
    }
    if dist >= pad {
        return 0;
    }
    let falloff = ((-dist * dist * inv_two_sigma2).exp() - edge_tail) * norm;
    (falloff.clamp(0.0, 1.0) * SHADOW_MAX_ALPHA * 255.0).round() as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shadow_buffer_fades_smoothly_to_zero_at_outer_edge() {
        let (w, h, pad) = (120, 80, 20);
        let total_w = (w + pad * 2) as usize;
        let total_h = (h + pad * 2) as usize;
        let mut pixels = vec![0u8; total_w * total_h * 4];
        fill_shadow_bgra(&mut pixels, w, h, pad, 12.0, 8.0);

        let alpha = |x: usize, y: usize| pixels[(y * total_w + x) * 4 + 3];
        // Center under the window has peak shadow alpha.
        assert_eq!(alpha(total_w / 2, total_h / 2), (SHADOW_MAX_ALPHA * 255.0).round() as u8);
        // Outer corners and outermost margin fade completely to zero.
        assert_eq!(alpha(0, 0), 0);
        assert_eq!(alpha(total_w - 1, total_h - 1), 0);
        // Mid-shadow outside the window edge is strictly between 0 and peak.
        let edge_mid = alpha(pad as usize - 6, total_h / 2);
        assert!(edge_mid > 0 && edge_mid < (SHADOW_MAX_ALPHA * 255.0).round() as u8, "edge_mid={edge_mid}");
    }
}
