;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let clicked = false

  const getCookie = (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : ''
  }

  const cleanUin = (raw) => {
    if (!raw) return ''
    const digits = String(raw).replace(/^o0*/i, '').replace(/\D+/g, '')
    return digits && digits !== '0' ? digits : ''
  }

  const check = () => {
    // 1. Check DOM for logged-in user avatar in y.qq.com header
    const hasAvatar = Boolean(
      document.querySelector('.top_login__cover') ||
        document.querySelector('.js_user_img') ||
        document.querySelector('a.top_login__link img[src]'),
    )

    // 2. Check QQ or WeChat auth cookies + non-zero uin
    const hasKey = Boolean(getCookie('qqmusic_key') || getCookie('qm_keyst') || getCookie('wxst'))
    const hasUin = Boolean(
      cleanUin(getCookie('uin')) ||
        cleanUin(getCookie('p_uin')) ||
        cleanUin(getCookie('wxuin')) ||
        cleanUin(getCookie('qqmusic_uin')),
    )

    if (hasAvatar || (hasKey && hasUin)) {
      post({ signedIn: true })
      return
    }

    // 3. Auto-open the QQ / WeChat QR login modal on y.qq.com
    if (!clicked && location.hostname.includes('y.qq.com')) {
      const modal =
        document.querySelector('.popup_login') ||
        document.querySelector('#login_frame') ||
        document.querySelector('iframe[src*="ptlogin2.qq.com"]') ||
        document.querySelector('iframe[src*="open.weixin.qq.com"]')
      const loginBtn =
        document.querySelector('.top_login__link') ||
        document.querySelector('.js_login') ||
        document.querySelector('a[data-stat="y_new.top.login"]')
      if (loginBtn && !modal) {
        clicked = true
        loginBtn.click()
      }
    }

    setTimeout(check, 800)
  }

  check()
})()
