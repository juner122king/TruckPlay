;(() => {
  if (window.top !== window) return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let autoClicked = false
  let checking = false

  const hasAuthCookie = () =>
    document.cookie.includes('sessionid=') ||
    document.cookie.includes('sessionid_ss=') ||
    document.cookie.includes('sid_tt=') ||
    document.cookie.includes('uid_tt=')

  const verifyApiAuth = async () => {
    try {
      const res = await fetch('/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        const user = data?.user
        if (user && (user.uid || user.sec_uid || user.unique_id)) {
          return true
        }
      }
    } catch {}
    try {
      const res = await fetch('/passport/web/account/info/', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        if (data?.message === 'success' && (data?.data?.user_id_str || data?.data?.user_id)) {
          return true
        }
      }
    } catch {}
    return false
  }

  const check = async () => {
    const onDouyin = location.hostname.endsWith('douyin.com')
    if (onDouyin && !checking) {
      checking = true
      try {
        const selfLink = document.querySelector('a[href*="/user/self"], [data-e2e="user-info-self"]')
        if (hasAuthCookie() && selfLink) {
          post({ signedIn: true })
          return
        }
        if (await verifyApiAuth()) {
          post({ signedIn: true })
          return
        }
      } finally {
        checking = false
      }
    }

    // Auto-open the login / QR dialog once if not visible yet
    if (!autoClicked) {
      const qrModal = document.querySelector(
        '[class*="login-guide"], [class*="login-panel"], [class*="login-mask"], [id*="login"], [class*="qrcode"]',
      )
      if (!qrModal) {
        const loginBtn = Array.from(document.querySelectorAll('button, a, div[role="button"]')).find((el) => {
          const text = el.textContent?.trim()
          return (
            (text === '登录' || text === '立即登录' || el.getAttribute('data-e2e') === 'login-button') &&
            el.offsetParent !== null
          )
        })
        if (loginBtn && typeof loginBtn.click === 'function') {
          autoClicked = true
          try {
            loginBtn.click()
          } catch {}
        }
      }
    }

    setTimeout(check, 1000)
  }

  check()
})()
