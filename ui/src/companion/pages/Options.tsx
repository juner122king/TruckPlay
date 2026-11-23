import { Group, Note, Panel, Row, Switch } from '../room/parts'
import { GLOW, useScreenAt } from '../room/screen'
import type { PageProps } from './page'

/**
 * Companion window options: start minimized on the taskbar, and keep running in the system tray when
 * minimized or closed (with both enabled, WestPlay starts directly in the tray).
 */
export function Options({ settings: state, cw }: PageProps) {
  const w = cw.options
  const { settings, update, error } = state
  useScreenAt('home', GLOW.home, null)
  return (
    <Panel place="page" title={w.title} sub={w.sub}>
      {settings && (
        <>
          <Group place={4}>
            <Row
              title={w.startMinimized}
              detail={w.startMinimizedDetail}
              wrap
              accessory={
                <Switch
                  on={settings.window.startMinimized}
                  label={w.startMinimized}
                  change={(on) => void update({ ...settings, window: { ...settings.window, startMinimized: on } })}
                />
              }
            />
            <Row
              title={w.keepInTray}
              detail={w.keepInTrayDetail}
              wrap
              accessory={
                <Switch
                  on={settings.window.keepInTray}
                  label={w.keepInTray}
                  change={(on) => void update({ ...settings, window: { ...settings.window, keepInTray: on } })}
                />
              }
            />
          </Group>
          <Note tone="calm">{w.bothNote}</Note>
        </>
      )}
      {error && <Note tone="bad">{error}</Note>}
    </Panel>
  )
}
