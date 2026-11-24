;(() => {
  if (window.top !== window) return
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let checking = false

  const check = async () => {
    const host = location.hostname
    const path = location.pathname.toLowerCase()
    const onMainSite = host === 'www.ximalaya.com' && !path.includes('login') && !path.includes('passport')

    if (onMainSite && !checking) {
      checking = true
      try {
        const res = await fetch('/revision/main/getCurrentUser', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data?.ret === 200 && data?.data?.uid) {
            post({ signedIn: true })
            return
          }
        }
      } catch {
        if (document.cookie.includes('1_l_flag')) {
          post({ signedIn: true })
          return
        }
      } finally {
        checking = false
      }
    }

    setTimeout(check, 600)
  }

  check()
})()
