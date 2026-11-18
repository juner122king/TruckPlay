//! Optional LAN-only MJPEG mirror and remote mouse events for the existing cabin WebView2.
//! Network/JPEG/GPU readback run off the WebView2 STA. No second web application is created.

use std::cell::Cell;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, Shutdown, SocketAddrV4, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use image::codecs::jpeg::JpegEncoder;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CPU_ACCESS_READ, D3D11_MAP_FLAG_DO_NOT_WAIT, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_STAGING, ID3D11DeviceContext, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::DXGI_ERROR_WAS_STILL_DRAWING;
use windows::core::Result as WinResult;

use crate::gpu::{Gpu, Lock, SharedFrame};

const PORT: u16 = 8765;
const FPS_INTERVAL: Duration = Duration::from_micros(33_333);
const FPS_JITTER: Duration = Duration::from_micros(6_000);
const JPEG_QUALITY: u8 = 75;
const READBACK_TIMEOUT: Duration = Duration::from_millis(100);
const READBACK_RETRY: Duration = Duration::from_millis(2);
const FRAME_WIDTH: u32 = 1280;
const FRAME_HEIGHT: u32 = 720;
const MAX_VIEWERS: usize = 3;
const MAX_CLIENTS: usize = 12;
const MAX_TOUCH_BATCH: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Down,
    Move,
    Up,
    Cancel,
}

#[derive(Clone, Copy, Debug)]
pub struct Touch {
    pub session: u64,
    pub phase: Phase,
    /// Normalized within the original image (not within CSS black bars).
    pub x: f32,
    pub y: f32,
}

#[derive(Default)]
struct Picture {
    sequence: u64,
    jpeg: Option<Arc<Vec<u8>>>,
}

pub struct Shared {
    viewers: AtomicUsize,
    closed: AtomicBool,
    picture: Mutex<Picture>,
    picture_ready: Condvar,
}

impl Shared {
    fn close(&self) {
        // Change the condition under the same lock as the MJPEG wait.
        let _picture = self.picture.lock().unwrap_or_else(|e| e.into_inner());
        self.closed.store(true, Ordering::Release);
        self.picture_ready.notify_all();
    }

    fn publish(&self, jpeg: Vec<u8>) {
        let mut state = self.picture.lock().unwrap_or_else(|e| e.into_inner());
        state.sequence = state.sequence.wrapping_add(1);
        state.jpeg = Some(Arc::new(jpeg));
        self.picture_ready.notify_all();
    }

    fn has_viewers(&self) -> bool {
        self.viewers.load(Ordering::Acquire) != 0
    }
}

pub struct Lan {
    shared: Arc<Shared>,
    touches: Receiver<Touch>,
    session: Arc<AtomicU64>,
    token: String,
    port: u16,
    listener_thread: Option<std::thread::JoinHandle<()>>,
}

impl Lan {
    pub fn start(width: u32, height: u32) -> io::Result<Self> {
        Self::listen(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, PORT), width, height)
    }

    fn listen(addr: SocketAddrV4, width: u32, height: u32) -> io::Result<Self> {
        let listener = TcpListener::bind(addr)?;
        let port = listener.local_addr()?.port();
        listener.set_nonblocking(true)?;

        let mut random = [0u8; 16];
        getrandom::fill(&mut random)
            .map_err(|e| io::Error::other(format!("LAN pairing token generation failed: {e}")))?;
        let token: String = random.iter().map(|b| format!("{b:02x}")).collect();
        let shared = Arc::new(Shared {
            viewers: AtomicUsize::new(0),
            closed: AtomicBool::new(false),
            picture: Mutex::new(Picture::default()),
            picture_ready: Condvar::new(),
        });
        let (tx, touches) = mpsc::sync_channel(128);
        let session = Arc::new(AtomicU64::new(0));
        let controller = Arc::new(AtomicBool::new(false));
        let server_shared = shared.clone();
        let server_session = session.clone();
        let server_token = token.clone();
        let listener_thread = std::thread::Builder::new().name("westplay-lan-http".into()).spawn(move || {
            let mut clients = Vec::<(TcpStream, std::thread::JoinHandle<()>)>::new();
            while !server_shared.closed.load(Ordering::Acquire) {
                clients.retain(|(_, worker)| !worker.is_finished());
                match listener.accept() {
                    Ok((stream, addr)) => {
                        if clients.len() >= MAX_CLIENTS || !allowed(addr.ip()) {
                            continue;
                        }
                        let Ok(socket) = stream.try_clone() else { continue };
                        let hub = server_shared.clone();
                        let tx = tx.clone();
                        let token = server_token.clone();
                        let session = server_session.clone();
                        let controller = controller.clone();
                        if let Ok(worker) =
                            std::thread::Builder::new().name("westplay-lan-client".into()).spawn(move || {
                                let _ = serve(stream, hub, tx, token, session, controller, width, height);
                            })
                        {
                            clients.push((socket, worker));
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        std::thread::park_timeout(Duration::from_millis(25));
                    }
                    Err(e) => {
                        crate::log!("Mobile WebUI listener stopped: {e}");
                        break;
                    }
                }
            }
            drop(listener);
            server_shared.close();
            for (socket, _) in &clients {
                let _ = socket.shutdown(Shutdown::Both);
            }
            for (_, worker) in clients {
                let _ = worker.join();
            }
        })?;
        Ok(Self { shared, touches, session, token, port, listener_thread: Some(listener_thread) })
    }

    pub fn running(&self) -> bool {
        !self.shared.closed.load(Ordering::Acquire)
            && self.listener_thread.as_ref().is_some_and(|worker| !worker.is_finished())
    }

    pub fn pairing_url(&self) -> Option<String> {
        lan_address().map(|ip| format!("http://{ip}:{}/?token={}", self.port, self.token))
    }

    pub fn shared(&self) -> Arc<Shared> {
        self.shared.clone()
    }

    pub fn session(&self) -> u64 {
        self.session.load(Ordering::Acquire)
    }

    /// Called on the existing WebView2 STA, never on the network thread.
    pub fn next_touch(&self) -> Option<Touch> {
        self.touches.try_recv().ok()
    }

    pub const fn max_touch_batch() -> usize {
        MAX_TOUCH_BATCH
    }
}

impl Drop for Lan {
    fn drop(&mut self) {
        self.shared.close();
        if let Some(thread) = self.listener_thread.take() {
            thread.thread().unpark();
            let _ = thread.join();
        }
    }
}

/// Prefer physical LAN adapters (Ethernet / Wi-Fi) with an IPv4 gateway over virtual/tunnel
/// interfaces such as WSL, Hyper-V, VMware, or VPN TUN adapters (which often hijack the default
/// route or sort lower numerically than `192.168.x.x`). A directly connected LAN without a
/// gateway still works as a fallback.
fn lan_address() -> Option<Ipv4Addr> {
    use windows::Win32::Foundation::ERROR_BUFFER_OVERFLOW;
    use windows::Win32::NetworkManagement::IpHelper::{
        GAA_FLAG_INCLUDE_GATEWAYS, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER, GAA_FLAG_SKIP_MULTICAST,
        GetAdaptersAddresses, IF_TYPE_ETHERNET_CSMACD, IF_TYPE_GIGABITETHERNET, IF_TYPE_IEEE80211,
        IP_ADAPTER_ADDRESSES_LH,
    };
    use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;
    use windows::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN, SOCKET_ADDRESS};

    const { assert!(align_of::<IP_ADAPTER_ADDRESSES_LH>() <= align_of::<u64>()) };

    /// # Safety
    /// `address.lpSockaddr` must be null or point to at least `address.iSockaddrLength` valid bytes.
    unsafe fn sockaddr_ipv4(address: SOCKET_ADDRESS) -> Option<Ipv4Addr> {
        if address.lpSockaddr.is_null() || (address.iSockaddrLength as usize) < size_of::<SOCKADDR_IN>() {
            return None;
        }
        // SAFETY: Caller guarantees `lpSockaddr` points to at least `SOCKADDR_IN` valid bytes.
        let addr = unsafe { std::ptr::read_unaligned(address.lpSockaddr.cast::<SOCKADDR_IN>()) };
        if addr.sin_family != AF_INET {
            return None;
        }
        // SAFETY: All fields of `IN_ADDR_0_0` are plain `u8` bytes.
        let bytes = unsafe { addr.sin_addr.S_un.S_un_b };
        Some(Ipv4Addr::new(bytes.s_b1, bytes.s_b2, bytes.s_b3, bytes.s_b4))
    }

    /// # Safety
    /// `ptr` must be null or point to a valid NUL-terminated UTF-16 string.
    unsafe fn pwstr_lossy(ptr: windows::core::PWSTR) -> String {
        if ptr.is_null() {
            return String::new();
        }
        // SAFETY: Caller guarantees `ptr` is a valid NUL-terminated UTF-16 string.
        unsafe { ptr.to_string() }.unwrap_or_default()
    }

    let flags = GAA_FLAG_INCLUDE_GATEWAYS | GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;
    let mut size = 16 * 1024u32;
    let mut words = Vec::<u64>::new();
    let mut status = ERROR_BUFFER_OVERFLOW.0;
    for _ in 0..4 {
        words.resize((size as usize).div_ceil(size_of::<u64>()), 0);
        let ptr = words.as_mut_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
        // SAFETY: `words` is 8-byte aligned and at least `size` bytes; Windows fills it or updates `size`.
        status = unsafe { GetAdaptersAddresses(u32::from(AF_INET.0), flags, None, Some(ptr), &mut size) };
        if status != ERROR_BUFFER_OVERFLOW.0 {
            break;
        }
    }
    if status != 0 || words.is_empty() {
        return None;
    }

    let mut candidates = Vec::new();
    let mut current = words.as_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
    while !current.is_null() {
        // SAFETY: `current` points to a valid `IP_ADAPTER_ADDRESSES_LH` node inside `words`.
        let adapter = unsafe { &*current };
        current = adapter.Next;
        if adapter.OperStatus != IfOperStatusUp {
            continue;
        }
        // SAFETY: Windows populates `FriendlyName` and `Description` as NUL-terminated wide strings.
        let (friendly, desc) = unsafe { (pwstr_lossy(adapter.FriendlyName), pwstr_lossy(adapter.Description)) };
        let is_virtual = is_virtual_adapter(&friendly, &desc, adapter.IfType);
        let is_lan_type =
            matches!(adapter.IfType, IF_TYPE_ETHERNET_CSMACD | IF_TYPE_IEEE80211 | IF_TYPE_GIGABITETHERNET);
        let mut has_gateway = false;
        let mut gw = adapter.FirstGatewayAddress;
        while !gw.is_null() {
            // SAFETY: `gw` points to a valid `IP_ADAPTER_GATEWAY_ADDRESS_LH` node inside `words`.
            let node = unsafe { &*gw };
            // SAFETY: `node.Address` comes from Windows' adapter list inside `words`.
            if unsafe { sockaddr_ipv4(node.Address) }.is_some() {
                has_gateway = true;
                break;
            }
            gw = node.Next;
        }
        let mut unicast = adapter.FirstUnicastAddress;
        while !unicast.is_null() {
            // SAFETY: `unicast` points to a valid `IP_ADAPTER_UNICAST_ADDRESS_LH` node inside `words`.
            let node = unsafe { &*unicast };
            // SAFETY: `node.Address` comes from Windows' adapter list inside `words`.
            if let Some(ip) = unsafe { sockaddr_ipv4(node.Address) }
                && ip.is_private()
            {
                candidates.push(LanCandidate { ip, is_virtual, has_gateway, is_lan_type, metric: adapter.Ipv4Metric });
            }
            unicast = node.Next;
        }
    }

    // Connecting a UDP socket selects a source address without sending a packet.
    let preferred = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok().and_then(|socket| {
        socket.connect((Ipv4Addr::new(192, 0, 2, 1), 9)).ok()?;
        socket.local_addr().ok().map(|addr| addr.ip())
    });
    pick_lan_address(&candidates, preferred)
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct LanCandidate {
    ip: Ipv4Addr,
    is_virtual: bool,
    has_gateway: bool,
    is_lan_type: bool,
    metric: u32,
}

fn is_virtual_adapter(friendly_name: &str, description: &str, if_type: u32) -> bool {
    const IF_TYPE_PROP_VIRTUAL: u32 = 53;
    const IF_TYPE_TUNNEL: u32 = 131;
    if matches!(if_type, IF_TYPE_PROP_VIRTUAL | IF_TYPE_TUNNEL) {
        return true;
    }
    let name = friendly_name.to_ascii_lowercase();
    let desc = description.to_ascii_lowercase();
    [
        "vethernet",
        "hyper-v",
        "wsl",
        "virtual",
        "vmware",
        "virtualbox",
        "vbox",
        "docker",
        "loopback",
        "tunnel",
        "wintun",
        "wireguard",
        "tailscale",
        "zerotier",
        "mihomo",
        "clash",
        "hamachi",
        "radmin",
        "tap-",
        "tap ",
        "vpn",
    ]
    .iter()
    .any(|needle| name.contains(needle) || desc.contains(needle))
}

fn pick_lan_address(candidates: &[LanCandidate], preferred: Option<IpAddr>) -> Option<Ipv4Addr> {
    candidates
        .iter()
        .min_by_key(|c| {
            (c.is_virtual, !c.has_gateway, !c.is_lan_type, Some(IpAddr::V4(c.ip)) != preferred, c.metric, c.ip)
        })
        .map(|c| c.ip)
}

fn allowed(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback(),
        IpAddr::V6(_) => false,
    }
}

struct Viewer(Arc<Shared>);
impl Viewer {
    fn enter(shared: Arc<Shared>) -> Option<Self> {
        let increment = shared
            .viewers
            .try_update(Ordering::AcqRel, Ordering::Acquire, |count| (count < MAX_VIEWERS).then_some(count + 1));
        increment.ok().map(|_| Self(shared))
    }
}
impl Drop for Viewer {
    fn drop(&mut self) {
        self.0.viewers.fetch_sub(1, Ordering::AcqRel);
    }
}

struct Controller(Arc<AtomicBool>, Arc<AtomicU64>);
impl Drop for Controller {
    fn drop(&mut self) {
        // Even if the event queue is full, the STA notices the new generation and releases the press.
        self.1.fetch_add(1, Ordering::AcqRel);
        self.0.store(false, Ordering::Release);
        crate::log!("LAN touch controller disconnected; releasing held buttons");
    }
}

#[allow(clippy::too_many_arguments)]
fn serve(
    mut stream: TcpStream,
    shared: Arc<Shared>,
    touches: SyncSender<Touch>,
    token: String,
    session: Arc<AtomicU64>,
    controller: Arc<AtomicBool>,
    width: u32,
    height: u32,
) -> io::Result<()> {
    if shared.closed.load(Ordering::Acquire) {
        return Ok(());
    }
    // Winsock inherits the listener's nonblocking mode. Each client has its own thread
    // and uses timeouts so a request or frame split across TCP packets can be read in full.
    stream.set_nonblocking(false)?;
    let _ = stream.set_nodelay(true);
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_millis(800)))?;
    let request = read_request(&mut stream)?;
    let (method, target, _version) = request
        .lines()
        .next()
        .and_then(|line| {
            let mut parts = line.split_ascii_whitespace();
            Some((parts.next()?, parts.next()?, parts.next()?))
        })
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid HTTP request"))?;
    if method != "GET" {
        return respond(&mut stream, "405 Method Not Allowed", "text/plain", b"GET required");
    }
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let paired = query.split('&').any(|part| part.strip_prefix("token=") == Some(token.as_str()));
    if !paired {
        return respond(&mut stream, "403 Forbidden", "text/plain", b"Pairing token required");
    }
    match path {
        "/" => {
            let html = include_str!("lan.html")
                .replace("__SOURCE_WIDTH__", &width.to_string())
                .replace("__SOURCE_HEIGHT__", &height.to_string());
            respond(&mut stream, "200 OK", "text/html; charset=utf-8", html.as_bytes())
        }
        "/stream" => mjpeg(&mut stream, shared),
        "/ws" => {
            if controller.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
                return respond(&mut stream, "409 Conflict", "text/plain", b"Another controller is connected");
            }
            let _guard = Controller(controller, session.clone());
            let id = session.fetch_add(1, Ordering::AcqRel) + 1;
            websocket(&mut stream, &request, touches, id, shared)
        }
        _ => respond(&mut stream, "404 Not Found", "text/plain", b"Not found"),
    }
}

fn read_request(stream: &mut TcpStream) -> io::Result<String> {
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut bytes = Vec::with_capacity(1024);
    while bytes.len() < 8192 {
        if Instant::now() >= deadline {
            return Err(io::ErrorKind::TimedOut.into());
        }
        let mut b = [0u8; 1];
        stream.read_exact(&mut b)?;
        bytes.push(b[0]);
        if bytes.ends_with(b"\r\n\r\n") {
            return String::from_utf8(bytes)
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "non-UTF8 headers"));
        }
    }
    Err(io::Error::new(io::ErrorKind::InvalidData, "oversize headers"))
}

fn respond(stream: &mut TcpStream, status: &str, mime: &str, body: &[u8]) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)
}

fn mjpeg(stream: &mut TcpStream, shared: Arc<Shared>) -> io::Result<()> {
    let _viewer = match Viewer::enter(shared.clone()) {
        Some(viewer) => viewer,
        None => return respond(stream, "503 Service Unavailable", "text/plain", b"Too many mirror viewers"),
    };
    stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=westplay\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nConnection: close\r\n\r\n")?;
    let mut last = 0;
    let mut packet = Vec::with_capacity(128 * 1024);
    loop {
        if shared.closed.load(Ordering::Acquire) {
            return Ok(());
        }
        let mut guard = shared.picture.lock().unwrap_or_else(|e| e.into_inner());
        while guard.sequence == last && !shared.closed.load(Ordering::Acquire) {
            let (state, timeout) =
                shared.picture_ready.wait_timeout(guard, Duration::from_secs(4)).unwrap_or_else(|e| e.into_inner());
            guard = state;
            if timeout.timed_out() {
                break;
            }
        }
        if shared.closed.load(Ordering::Acquire) {
            return Ok(());
        }
        if guard.sequence == last {
            continue;
        }
        last = guard.sequence;
        let frame = guard.jpeg.clone();
        drop(guard);
        if let Some(jpeg) = frame {
            packet.clear();
            let _ = write!(packet, "--westplay\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n", jpeg.len());
            packet.extend_from_slice(&jpeg);
            packet.extend_from_slice(b"\r\n");
            stream.write_all(&packet)?;
        }
    }
}

fn header<'a>(request: &'a str, key: &str) -> Option<&'a str> {
    request
        .lines()
        .skip(1)
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.eq_ignore_ascii_case(key))
        .map(|(_, value)| value.trim())
}

fn websocket(
    stream: &mut TcpStream,
    request: &str,
    tx: SyncSender<Touch>,
    id: u64,
    shared: Arc<Shared>,
) -> io::Result<()> {
    let host = header(request, "Host").unwrap_or_default();
    let origin = header(request, "Origin").unwrap_or_default();
    let key = header(request, "Sec-WebSocket-Key").unwrap_or_default();
    if host.is_empty()
        || !origin.eq_ignore_ascii_case(&format!("http://{host}"))
        || header(request, "Sec-WebSocket-Version") != Some("13")
        || !header(request, "Upgrade").is_some_and(|value| value.eq_ignore_ascii_case("websocket"))
        || !header(request, "Connection").is_some_and(|value| value.to_ascii_lowercase().contains("upgrade"))
        || base64::Engine::decode(&base64::engine::general_purpose::STANDARD, key)
            .ok()
            .is_none_or(|value| value.len() != 16)
    {
        return respond(stream, "403 Forbidden", "text/plain", b"Invalid WebSocket handshake");
    }
    let accept = websocket_accept(key);
    write!(
        stream,
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
    )?;
    stream.set_read_timeout(Some(Duration::from_secs(1)))?;
    let mut last_seen = Instant::now();
    loop {
        if shared.closed.load(Ordering::Acquire) {
            return Ok(());
        }
        let mut head = [0u8; 2];
        match stream.read_exact(&mut head[..1]) {
            Ok(()) => {}
            Err(e) if matches!(e.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut) => {
                if last_seen.elapsed() > Duration::from_secs(3) {
                    return Ok(());
                }
                continue;
            }
            Err(e) => return Err(e),
        }
        stream.read_exact(&mut head[1..])?;
        // Browser-originated WS messages are FIN + masked. No fragmentation or large frames accepted.
        if head[0] & 0xf0 != 0x80 || head[1] & 0x80 == 0 {
            return Ok(());
        }
        let opcode = head[0] & 0x0f;
        let len = (head[1] & 0x7f) as usize;
        if len > 125 {
            return Ok(());
        }
        let mut mask = [0u8; 4];
        stream.read_exact(&mut mask)?;
        let mut message = vec![0u8; len];
        stream.read_exact(&mut message)?;
        for (i, b) in message.iter_mut().enumerate() {
            *b ^= mask[i % 4];
        }
        last_seen = Instant::now();
        match opcode {
            8 => return Ok(()),
            9 => {
                stream.write_all(&[0x8a, len as u8])?;
                stream.write_all(&message)?;
            }
            1 => {
                if let Some(touch) = parse_touch(&message, id) {
                    // Move events are lossy under contention. The session epoch always cancels on disconnect.
                    if touch.phase == Phase::Move {
                        let _ = tx.try_send(touch);
                    } else if tx.try_send(touch).is_err() {
                        // A saturated queue must release the gesture, and never block service shutdown.
                        return Ok(());
                    }
                }
            }
            _ => return Ok(()),
        }
    }
}

#[derive(serde::Deserialize)]
struct WireTouch {
    #[serde(rename = "type")]
    kind: String,
    x: Option<f32>,
    y: Option<f32>,
}

fn parse_touch(bytes: &[u8], session: u64) -> Option<Touch> {
    let msg: WireTouch = serde_json::from_slice(bytes).ok()?;
    let phase = match msg.kind.as_str() {
        "down" => Phase::Down,
        "move" => Phase::Move,
        "up" => Phase::Up,
        "cancel" => Phase::Cancel,
        _ => return None,
    };
    let (x, y) = if phase == Phase::Cancel { (0.0, 0.0) } else { (msg.x?, msg.y?) };
    if !(x.is_finite() && y.is_finite() && (0.0..=1.0).contains(&x) && (0.0..=1.0).contains(&y)) {
        return None;
    }
    Some(Touch { session, phase, x, y })
}

/// SHA-1 is used ONLY by the RFC 6455 accept handshake, never for authentication.
fn websocket_accept(key: &str) -> String {
    let mut value = key.as_bytes().to_vec();
    value.extend_from_slice(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sha1(&value))
}

fn sha1(input: &[u8]) -> [u8; 20] {
    let mut message = input.to_vec();
    let bit_len = (message.len() as u64).wrapping_mul(8);
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_be_bytes());
    let mut h = [0x67452301u32, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    for chunk in message.as_chunks::<64>().0 {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes(chunk[i * 4..i * 4 + 4].try_into().unwrap());
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let mut v = h;
        for (i, word) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((v[1] & v[2]) | ((!v[1]) & v[3]), 0x5a827999),
                20..=39 => (v[1] ^ v[2] ^ v[3], 0x6ed9eba1),
                40..=59 => ((v[1] & v[2]) | (v[1] & v[3]) | (v[2] & v[3]), 0x8f1bbcdc),
                _ => (v[1] ^ v[2] ^ v[3], 0xca62c1d6),
            };
            let next = v[0].rotate_left(5).wrapping_add(f).wrapping_add(v[4]).wrapping_add(k).wrapping_add(*word);
            v = [next, v[0], v[1].rotate_left(30), v[2], v[3]];
        }
        for i in 0..5 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    let mut out = [0u8; 20];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

#[derive(Clone, Copy)]
struct CaptureSchedule {
    due: Instant,
    last_frame: u64,
    had_viewers: bool,
}

impl CaptureSchedule {
    fn new(now: Instant) -> Self {
        Self { due: now, last_frame: 0, had_viewers: false }
    }

    fn ready(&mut self, has_viewers: bool, closed: bool, frame_seq: u64, now: Instant) -> bool {
        if !has_viewers || closed {
            self.had_viewers = false;
            return false;
        }
        if frame_seq == 0 {
            return false;
        }
        if !self.had_viewers {
            return true;
        }
        frame_seq != self.last_frame && now + FPS_JITTER >= self.due
    }

    fn sent(&mut self, frame_seq: u64, now: Instant) {
        if !self.had_viewers || now >= self.due + FPS_INTERVAL {
            self.due = now + FPS_INTERVAL;
        } else {
            self.due += FPS_INTERVAL;
        }
        self.last_frame = frame_seq;
        self.had_viewers = true;
    }
}

/// Non-blocking GPU producer on the existing capture/STA thread. Double-buffered staging textures
/// overlap GPU readback (`westplay-lan-read`) with CPU RGB conversion + JPEG encoding (`westplay-lan-jpeg`).
pub struct Tap {
    shared: Arc<Shared>,
    free: Receiver<ID3D11Texture2D>,
    free_sender: SyncSender<ID3D11Texture2D>,
    frames: SyncSender<ID3D11Texture2D>,
    schedule: Cell<CaptureSchedule>,
    read_worker: std::thread::JoinHandle<()>,
    jpeg_worker: std::thread::JoinHandle<()>,
}

impl Tap {
    pub fn new(gpu: &Gpu, width: u32, height: u32, shared: Arc<Shared>) -> WinResult<Self> {
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };
        let (free_tx, free) = mpsc::sync_channel(2);
        for _ in 0..2 {
            let mut texture = None;
            // SAFETY: This is our GPU and a local staging description.
            unsafe { gpu.device.CreateTexture2D(&desc, None, Some(&mut texture))? };
            let staging = texture.ok_or_else(windows::core::Error::empty)?;
            let _ = free_tx.send(staging);
        }
        let worker_free_tx = free_tx.clone();
        let (frames, frame_rx) = mpsc::sync_channel(1);
        let (raw_tx, raw_rx) = mpsc::sync_channel::<Vec<u8>>(1);
        let context = gpu.context.clone();
        let read_hub = shared.clone();
        let read_worker = std::thread::Builder::new()
            .name("westplay-lan-read".into())
            .spawn(move || {
                while let Ok(texture) = frame_rx.recv() {
                    let pixels = readback(&context, &texture, width, height, &read_hub);
                    if worker_free_tx.send(texture).is_err() {
                        break;
                    }
                    match pixels {
                        Ok(Some(bgra)) if read_hub.has_viewers() && !read_hub.closed.load(Ordering::Acquire) => {
                            if raw_tx.send(bgra).is_err() {
                                break;
                            }
                        }
                        Err(e) if e.code() != DXGI_ERROR_WAS_STILL_DRAWING => {
                            crate::log!("LAN mirror staging readback failed: {e}");
                            break;
                        }
                        _ => {}
                    }
                }
            })
            .map_err(|_| windows::core::Error::empty())?;
        let encode_hub = shared.clone();
        let jpeg_worker = std::thread::Builder::new()
            .name("westplay-lan-jpeg".into())
            .spawn(move || {
                let mut rgb = Vec::new();
                let mut stat_start = Instant::now();
                let mut stat_frames = 0u64;
                let mut stat_encode = Duration::ZERO;
                while let Ok(bgra) = raw_rx.recv() {
                    if !encode_hub.has_viewers() || encode_hub.closed.load(Ordering::Acquire) {
                        stat_start = Instant::now();
                        stat_frames = 0;
                        stat_encode = Duration::ZERO;
                        continue;
                    }
                    let t0 = Instant::now();
                    scale_bgra_into(&bgra, width, height, FRAME_WIDTH, FRAME_HEIGHT, &mut rgb);
                    let mut jpeg = Vec::with_capacity(128 * 1024);
                    if JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY)
                        .encode(&rgb, FRAME_WIDTH, FRAME_HEIGHT, image::ExtendedColorType::Rgb8)
                        .is_ok()
                    {
                        stat_encode += t0.elapsed();
                        stat_frames += 1;
                        encode_hub.publish(jpeg);
                        let elapsed = stat_start.elapsed();
                        if elapsed >= Duration::from_secs(10) && stat_frames > 0 {
                            let secs = elapsed.as_secs_f64();
                            let fps = stat_frames as f64 / secs;
                            let avg_ms = stat_encode.as_secs_f64() * 1000.0 / stat_frames as f64;
                            crate::log!("LAN mirror: {fps:.1} fps encoded ({stat_frames} frames in {secs:.1}s, avg {avg_ms:.1}ms/frame)");
                            stat_start = Instant::now();
                            stat_frames = 0;
                            stat_encode = Duration::ZERO;
                        }
                    }
                }
            })
            .map_err(|_| windows::core::Error::empty())?;
        Ok(Self {
            shared,
            free,
            free_sender: free_tx,
            frames,
            schedule: Cell::new(CaptureSchedule::new(Instant::now())),
            read_worker,
            jpeg_worker,
        })
    }

    pub fn failed(&self) -> bool {
        self.read_worker.is_finished() || self.jpeg_worker.is_finished()
    }

    pub fn try_capture(&self, context: &ID3D11DeviceContext, frame: &SharedFrame, frame_seq: u64) -> Option<Lock> {
        let now = Instant::now();
        let mut schedule = self.schedule.get();
        let ready =
            schedule.ready(self.shared.has_viewers(), self.shared.closed.load(Ordering::Acquire), frame_seq, now);
        self.schedule.set(schedule);
        if !ready {
            return None;
        }
        let staging = self.free.try_recv().ok()?;
        let lock = frame.try_lock();
        if lock != Lock::Held {
            // Keep the staging texture for the next attempt. The capture owner handles an abandoned mutex.
            let _ = self.free_sender.try_send(staging);
            return Some(lock);
        }
        // SAFETY: GPU copy is queued only, staging is not mapped or reused until returned by worker.
        unsafe {
            context.CopyResource(&staging, &frame.texture);
            context.Flush(); // enqueue work only; never wait for GPU completion on the STA
        }
        frame.unlock();
        match self.frames.try_send(staging) {
            Ok(()) => {
                schedule.sent(frame_seq, now);
                self.schedule.set(schedule);
            }
            Err(mpsc::TrySendError::Full(returned) | mpsc::TrySendError::Disconnected(returned)) => {
                let _ = self.free_sender.try_send(returned);
            }
        }
        Some(Lock::Held)
    }
}

fn readback(
    context: &ID3D11DeviceContext,
    staging: &ID3D11Texture2D,
    width: u32,
    height: u32,
    shared: &Shared,
) -> WinResult<Option<Vec<u8>>> {
    let start = Instant::now();
    let mut retries = 0;
    // Keep this staging copy while the GPU completes it. Replacing it after only a few polls can
    // discard every frame on a busy GPU. Only the worker sleeps between nonblocking Map calls.
    while shared.has_viewers() && !shared.closed.load(Ordering::Acquire) {
        // SAFETY: The GPU context is multithread protected by `Gpu::new`; DO_NOT_WAIT prevents a GPU wait.
        unsafe {
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            let result =
                context.Map(staging, 0, D3D11_MAP_READ, D3D11_MAP_FLAG_DO_NOT_WAIT.0 as u32, Some(&mut mapped));
            if let Err(e) = result {
                if e.code() != DXGI_ERROR_WAS_STILL_DRAWING || start.elapsed() >= READBACK_TIMEOUT {
                    return Err(e);
                }
            } else {
                let mut bgra = vec![0; width as usize * height as usize * 4];
                for y in 0..height as usize {
                    std::ptr::copy_nonoverlapping(
                        (mapped.pData as *const u8).add(y * mapped.RowPitch as usize),
                        bgra.as_mut_ptr().add(y * width as usize * 4),
                        width as usize * 4,
                    );
                }
                context.Unmap(staging, 0);
                if retries >= 4 {
                    static SAID: std::sync::Once = std::sync::Once::new();
                    SAID.call_once(|| {
                        crate::log!("LAN mirror staging ready after {:?} and {retries} busy polls", start.elapsed());
                    });
                }
                return Ok(Some(bgra));
            }
        }
        retries += 1;
        std::thread::sleep(READBACK_RETRY);
    }
    Ok(None)
}

/// Letterbox if the producer is not 16:9. Alpha is composited onto black for JPEG.
fn scale_bgra_into(source: &[u8], sw: u32, sh: u32, tw: u32, th: u32, out: &mut Vec<u8>) {
    let needed = tw as usize * th as usize * 3;
    out.resize(needed, 0);
    if sw == 0 || sh == 0 {
        out.fill(0);
        return;
    }
    if sw == tw && sh == th && source.len() >= sw as usize * sh as usize * 4 {
        for (src, dst) in source.as_chunks::<4>().0.iter().zip(out.as_chunks_mut::<3>().0.iter_mut()) {
            dst[0] = src[2];
            dst[1] = src[1];
            dst[2] = src[0];
        }
        return;
    }
    out.fill(0);
    let scale = (tw as f64 / sw as f64).min(th as f64 / sh as f64);
    let dw = (sw as f64 * scale).round().clamp(1.0, tw as f64) as u32;
    let dh = (sh as f64 * scale).round().clamp(1.0, th as f64) as u32;
    let ox = (tw - dw) / 2;
    let oy = (th - dh) / 2;
    for y in 0..dh {
        for x in 0..dw {
            let sx = (x as u64 * sw as u64 / dw as u64) as usize;
            let sy = (y as u64 * sh as u64 / dh as u64) as usize;
            let si = (sy * sw as usize + sx) * 4;
            let di = (((oy + y) * tw + ox + x) * 3) as usize;
            if si + 3 < source.len() {
                out[di] = source[si + 2];
                out[di + 1] = source[si + 1];
                out[di + 2] = source[si];
            }
        }
    }
}

#[cfg(test)]
fn scale_bgra(source: &[u8], sw: u32, sh: u32, tw: u32, th: u32) -> Vec<u8> {
    let mut out = Vec::new();
    scale_bgra_into(source, sw, sh, tw, th, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_require_pairing_and_shutdown_releases_the_port() {
        use std::io::{BufRead, BufReader};

        fn request(server: &Lan, target: &str, websocket: bool) -> (BufReader<TcpStream>, String) {
            let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, server.port);
            let mut stream = TcpStream::connect_timeout(&address.into(), Duration::from_secs(2)).unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            write!(stream, "GET {target} HTTP/1.1\r\nHost: {address}\r\n").unwrap();
            if websocket {
                write!(stream, "Origin: http://{address}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n").unwrap();
            }
            stream.write_all(b"\r\n").unwrap();
            let mut reader = BufReader::new(stream);
            let mut status = String::new();
            reader.read_line(&mut status).unwrap();
            (reader, status)
        }

        let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0);
        let server = Lan::listen(address, 1280, 720).unwrap();
        let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, server.port);
        assert!(Lan::listen(address, 1280, 720).is_err(), "an occupied port must fail");
        for (path, ws) in [("/", false), ("/stream?token=wrong", false), ("/ws", true)] {
            assert_eq!(request(&server, path, ws).1, "HTTP/1.1 403 Forbidden\r\n");
        }
        assert_eq!(request(&server, &format!("/?token={}", server.token), false).1, "HTTP/1.1 200 OK\r\n");
        assert_eq!(request(&server, &format!("/stream?token={}", server.token), false).1, "HTTP/1.1 200 OK\r\n");
        let (mut socket, status) = request(&server, &format!("/ws?token={}", server.token), true);
        assert_eq!(status, "HTTP/1.1 101 Switching Protocols\r\n");
        while {
            let mut header = String::new();
            socket.read_line(&mut header).unwrap() != 0 && header != "\r\n"
        } {}
        let payload = br#"{"type":"down","x":0.25,"y":0.5}"#;
        let mask = [1, 2, 3, 4];
        let mut frame = vec![0x81, 0x80 | payload.len() as u8];
        frame.extend(mask);
        frame.extend(payload.iter().enumerate().map(|(i, byte)| byte ^ mask[i % 4]));
        socket.get_mut().write_all(&frame).unwrap();
        let touch = server.touches.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!((touch.phase, touch.x, touch.y), (Phase::Down, 0.25, 0.5));

        let old_token = server.token.clone();
        drop(server);
        match socket.read(&mut [0; 1]) {
            Ok(0) => {}
            Err(e) if matches!(e.kind(), io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted) => {}
            result => panic!("the WebSocket should be closed: {result:?}"),
        }
        let restarted = Lan::listen(address, 1280, 720).unwrap();
        assert_ne!(restarted.token, old_token);
        assert_eq!(request(&restarted, &format!("/ws?token={old_token}"), true).1, "HTTP/1.1 403 Forbidden\r\n");
    }

    #[test]
    fn rfc6455_handshake() {
        assert_eq!(websocket_accept("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }

    #[test]
    fn private_addresses_and_touch_coordinates_are_validated() {
        assert!(parse_touch(br#"{"type":"down","x":0.5,"y":0.25}"#, 9).is_some());
        assert!(parse_touch(br#"{"type":"down","x":-0.1,"y":0.5}"#, 9).is_none());
        assert!(parse_touch(br#"{"type":"move","x":2,"y":0.5}"#, 9).is_none());
        assert!(allowed("192.168.1.9".parse().unwrap()));
        assert!(!allowed("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn letterbox_preserves_aspect_ratio() {
        let rgb = scale_bgra(&[255u8; 4 * 4 * 4], 4, 4, 8, 4);
        assert_eq!(&rgb[0..3], &[0, 0, 0]);
        assert_eq!(&rgb[3 * 2..3 * 3], &[255, 255, 255]);
    }

    #[test]
    fn prefers_physical_lan_over_wsl_or_vpn_virtual_adapters() {
        let wsl = LanCandidate {
            ip: Ipv4Addr::new(172, 24, 192, 1),
            is_virtual: is_virtual_adapter("vEthernet (WSL (Hyper-V firewall))", "Hyper-V Virtual Ethernet Adapter", 6),
            has_gateway: false,
            is_lan_type: true,
            metric: 15,
        };
        let wifi = LanCandidate {
            ip: Ipv4Addr::new(192, 168, 112, 162),
            is_virtual: is_virtual_adapter("WLAN", "Intel(R) Wi-Fi 7 BE200 320MHz", 71),
            has_gateway: true,
            is_lan_type: true,
            metric: 35,
        };
        assert!(wsl.is_virtual);
        assert!(!wifi.is_virtual);
        // Even when a TUN proxy (e.g. 198.18.0.1) hijacks the default route, WLAN beats WSL.
        assert_eq!(
            pick_lan_address(&[wsl.clone(), wifi.clone()], Some(IpAddr::V4(Ipv4Addr::new(198, 18, 0, 1)))),
            Some(wifi.ip)
        );
        // When both Ethernet and Wi-Fi are connected, prefer whichever the default route uses.
        let ethernet = LanCandidate {
            ip: Ipv4Addr::new(192, 168, 112, 50),
            is_virtual: false,
            has_gateway: true,
            is_lan_type: true,
            metric: 25,
        };
        let (wsl_ip, eth_ip, wifi_ip) = (wsl.ip, ethernet.ip, wifi.ip);
        assert_eq!(pick_lan_address(&[ethernet.clone(), wifi.clone()], Some(IpAddr::V4(wifi_ip))), Some(wifi_ip));
        assert_eq!(pick_lan_address(&[ethernet, wifi], None), Some(eth_ip));
        // Fall back to a virtual adapter only when no physical adapter exists.
        assert_eq!(pick_lan_address(&[wsl], None), Some(wsl_ip));
        // Detect real live LAN selection on this host (sanity: if present, returns a private IPv4).
        if let Some(ip) = lan_address() {
            println!("detected lan_address = {ip}");
            assert!(ip.is_private(), "{ip}");
        }
    }

    #[test]
    fn capture_schedule_skips_idle_frames_and_wakes_on_viewer_or_change() {
        let t0 = Instant::now();
        let mut schedule = CaptureSchedule::new(t0);
        // No viewers -> never capture.
        assert!(!schedule.ready(false, false, 1, t0));
        // First viewer arrives -> captures current frame even once.
        assert!(schedule.ready(true, false, 1, t0));
        schedule.sent(1, t0);
        // Same frame while viewer stays -> skipped (idle screen saves GPU/JPEG work).
        assert!(!schedule.ready(true, false, 1, t0 + Duration::from_millis(50)));
        // New frame too soon (< FPS_INTERVAL) -> throttled.
        assert!(!schedule.ready(true, false, 2, t0 + Duration::from_millis(10)));
        // New frame past FPS_INTERVAL -> captured.
        let t1 = t0 + FPS_INTERVAL;
        assert!(schedule.ready(true, false, 2, t1));
        schedule.sent(2, t1);
        // Viewers leave, then another joins later on the same frame -> captures fresh frame.
        assert!(!schedule.ready(false, false, 2, t1 + Duration::from_millis(50)));
        assert!(schedule.ready(true, false, 2, t1 + FPS_INTERVAL));
    }

    #[test]
    fn capture_schedule_holds_30fps_on_jittery_60hz_stream() {
        let start = Instant::now();
        let mut schedule = CaptureSchedule::new(start);
        let mut captured = 0u32;
        for i in 0..60u32 {
            // Simulate 60 Hz capture arriving up to 1.5 ms early (matching FRAME_JITTER).
            let jitter = if i % 2 == 0 { Duration::ZERO } else { Duration::from_micros(1_500) };
            let now = start + Duration::from_micros(16_667 * u64::from(i)).saturating_sub(jitter);
            let seq = u64::from(i) + 1;
            if schedule.ready(true, false, seq, now) {
                schedule.sent(seq, now);
                captured += 1;
            }
        }
        assert!((29..=30).contains(&captured), "expected ~30 fps on 60Hz jittery stream, got {captured}");

        // A ~35 Hz stream (28.5 ms interval) must not drop down to ~17 fps.
        let mut s35 = CaptureSchedule::new(start);
        let mut c35 = 0u32;
        for i in 0..35u32 {
            let now = start + Duration::from_micros(28_571 * u64::from(i));
            let seq = u64::from(i) + 1;
            if s35.ready(true, false, seq, now) {
                s35.sent(seq, now);
                c35 += 1;
            }
        }
        assert!((29..=31).contains(&c35), "expected ~30 fps on 35Hz stream, got {c35}");
    }
}
