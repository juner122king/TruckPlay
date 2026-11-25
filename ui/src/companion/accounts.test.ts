import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import * as accountsModule from './accounts'
import { call } from './bridge'
import { Onboarding } from './onboarding/Onboarding'
import { wordsFor } from './onboarding/words'
import { Accounts } from './pages/Accounts'
import type { PageProps } from './pages/page'
import { companionWords } from './pages/words'
import { RoomText, WordsContext } from './room/room'
import { type Screen, ScreenContext } from './room/screen'
import type { SetupState } from './setup'
import type { SettingsState } from './useSettings'

vi.mock('./bridge', () => ({ call: vi.fn(), on: vi.fn(), IN_APP: false, PREVIEW_TUTORIAL: null }))

function emptySignedIn(): accountsModule.SignedIn {
  return {
    youtube: null,
    bilibili: null,
    ximalaya: null,
    douyin: null,
    hongguo: null,
    netease: null,
    qqmusic: null,
    appleMusic: null,
  }
}

function renderAccounts(signedIn: accountsModule.SignedIn): string {
  const screen: Screen = {
    send: vi.fn(),
    go: vi.fn(),
    locate: vi.fn(async () => null),
    ready: true,
    banner: vi.fn(),
    scan: vi.fn(),
    glow: vi.fn(),
    cursor: vi.fn(),
    reboot: vi.fn(),
    powered: true,
    leaving: false,
    settling: () => 0,
  }
  const props = {
    status: null,
    settings: { settings: null, update: vi.fn(), error: null },
    setup: {
      finished: true,
      game: null,
      games: [],
      updated: false,
      outdated: [],
      found: [],
      gameRunning: false,
      language: 'zh_cn',
    },
    refreshSetup: vi.fn(),
    cw: companionWords('zh_cn'),
    checks: {},
    mapProgress: { building: false, shown: 0 },
    checked: vi.fn(),
    signedIn,
    uninstall: vi.fn(),
    chooseLanguage: vi.fn(),
    custom: null,
    refreshCustom: vi.fn(),
    update: null,
    showUpdate: vi.fn(),
    tutorial: vi.fn(),
  } as unknown as PageProps

  return renderToStaticMarkup(
    createElement(
      WordsContext.Provider,
      { value: { words: wordsFor('zh_cn'), code: 'zh_cn' } },
      createElement(
        RoomText.Provider,
        { value: { locale: 'zh-CN', back: '返回' } },
        createElement(ScreenContext.Provider, { value: screen }, createElement(Accounts, props)),
      ),
    ),
  )
}

describe('account detection removal', () => {
  it('removes automatic startup account checking from accounts module', () => {
    expect(accountsModule).not.toHaveProperty('useAskOnce')
  })

  it('removes YouTube and Apple Music sign-in steps from onboarding', () => {
    const initial: SetupState = {
      finished: false,
      game: null,
      games: [],
      updated: false,
      outdated: [],
      found: [],
      gameRunning: false,
      language: 'zh_cn',
    }
    const settings: SettingsState = { settings: null, update: vi.fn(), error: null }
    const html = renderToStaticMarkup(
      createElement(Onboarding, { initial, status: null, settings, onFinished: vi.fn() }),
    )
    const dotsMatch = html.match(/<div class="ob-dots"[^>]*>(.*?)<\/div>/)
    expect(dotsMatch).not.toBeNull()
    expect(dotsMatch![1].match(/<i\b/g)).toHaveLength(8)
    expect(call).not.toHaveBeenCalled()
  })

  it('shows not signed in and Sign In buttons immediately on Accounts page when status is unknown', () => {
    const html = renderAccounts(emptySignedIn())

    expect(html).not.toContain('ob-row-spinner')
    expect(html).toContain('YouTube')
    expect(html).toContain('网易云音乐')
    expect(html).toContain('QQ音乐')
    expect(html).toContain('哔哩哔哩')
    expect(html).toContain('喜马拉雅')
    expect(html).toContain('Apple Music')
    expect(html).toContain('未登录')
    expect(html).toContain('>登录<')
    expect(call).not.toHaveBeenCalled()
  })

  it('shows signed in and Sign Out button when a service is signed in', () => {
    const html = renderAccounts({ ...emptySignedIn(), netease: true })

    expect(html).toContain('已登录')
    expect(html).toContain('>退出登录<')
  })
})
