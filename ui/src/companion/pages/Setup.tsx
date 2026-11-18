import { useEffect, useMemo, useState } from 'react'
import { Button, Checking, Group, Note, Panel, Row, Status, Switch, Tick } from '../room/parts'
import { banner, explain, gameSummary, useGameRunning, useWords } from '../room/room'
import { ownName } from '../languages'
import { encodeQr, qrSvgPath } from '../qr'
import { GLOW, useScreen, useScreenAt } from '../room/screen'
import { checkGame, GAME_KINDS, GAME_NAMES, type GameInfo, type InstallReport, installIntoGame } from '../setup'
import { allChecked, type PageProps, useGameCheck } from './page'

/**
 * Where WestPlay is installed and how to put it right: each game it's in (ETS2's, ATS's), the plugin as it is
 * there, and a reinstall into each (the onboarding's install, again, while the games are closed); and a game found
 * but not set up (ATS beside an ETS2 set up before it), to install into. On the room's
 * screen, the checks' scan while the games are looked at, and WestPlay booting again after a reinstall.
 */
export function Setup(props: PageProps) {
  const { setup, refreshSetup, cw, checked, uninstall, tutorial, chooseLanguage, settings } = props
  const screen = useScreen()
  const words = useWords()
  const w = cw.setup
  const error = useGameCheck(props)
  const running = useGameRunning()
  const [installing, setInstalling] = useState(false)
  // What reinstalling did in each game, by its folder.
  const [reports, setReports] = useState<Record<string, InstallReport>>({})
  const [installError, setInstallError] = useState<string | null>(null)
  const games = setup.games
  const checkedAll = allChecked(props)
  const done = games.length > 0 && games.every((game) => reports[game.dir]?.done)

  useEffect(() => {
    screen.scan(!checkedAll && !error)
    return () => screen.scan(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAll, error])
  useScreenAt(
    'home',
    checkedAll ? GLOW.home : GLOW.scan,
    installing
      ? banner({ ...words.install.banners.installing, text: words.install.plugin }, true)
      : done
        ? banner({ title: w.reinstalled, text: words.install.pluginDetail })
        : checkedAll
          ? banner(w.checked)
          : error
            ? null
            : banner(w.checking, true),
  )

  // The games found but not set up: the first install found of each.
  const notSetUp = GAME_KINDS.filter((kind) => !games.some((game) => game.kind === kind))
    .map((kind) => setup.found.find((game) => game.kind === kind))
    .filter((game): game is GameInfo => !!game)

  // Into each game (`into`: those set up), one after the other; one that can't go on (Windows' permission, the game
  // in use) stops there.
  const reinstall = async (administrator: boolean, into: GameInfo[] = games) => {
    setInstalling(true)
    setInstallError(null)
    try {
      let all = true
      for (const game of into) {
        const result = await installIntoGame(game.dir, administrator)
        setReports((known) => ({ ...known, [game.dir]: result }))
        if (!result.done) {
          all = false
          break
        }
        // Checked again: the plugin and the mod as they are now.
        checkGame(game.dir).then(
          (check) => checked(game.dir, check),
          () => {},
        )
      }
      // A game not set up before is now.
      if (into.some((game) => !games.includes(game))) refreshSetup()
      if (all) screen.reboot()
    } catch (e) {
      setInstallError(explain(words, e))
    } finally {
      setInstalling(false)
    }
  }

  // The report that says what to do now: the first game's not done.
  const waiting =
    [...games, ...notSetUp].map((game) => reports[game.dir]).find((report) => report && !report.done) ?? null
  const plugin = waiting?.plugin
  const asAdministrator = plugin?.state === 'needsAdministrator' || plugin?.state === 'declined'
  return (
    <Panel
      place="page"
      title={w.title}
      sub={w.sub}
      action={
        games.length > 0 && (
          <Button glass onClick={() => reinstall(asAdministrator)} busy={installing} disabled={running !== false}>
            {asAdministrator ? words.install.asAdministrator : w.reinstall}
          </Button>
        )
      }
    >
      <MobileWebUi status={props.status} settings={settings} cw={cw} />
      {games.map((game, at) => (
        <GameSetUp
          key={game.dir}
          game={game}
          titled={games.length + notSetUp.length > 1}
          place={5 + at}
          {...props}
          error={error}
        />
      ))}
      {notSetUp.map((game, at) => (
        <Group key={game.dir} title={GAME_NAMES[game.kind]} place={5 + games.length + at}>
          <Row title={w.folder} detail={game.dir} />
          <Row
            title={words.install.install}
            link
            onClick={installing || running !== false ? undefined : () => reinstall(asAdministrator, [game])}
          />
        </Group>
      ))}
      {running && (
        <Note>
          <b>{w.closeGame.title}</b> {w.closeGame.text}
        </Note>
      )}
      {plugin?.state === 'needsAdministrator' && (
        <Note tone="calm">
          <b>{words.install.needsAdministrator.title}</b> {words.install.needsAdministrator.text}
        </Note>
      )}
      {plugin?.state === 'declined' && (
        <Note>
          <b>{words.install.declined.title}</b> {words.install.declined.text}
        </Note>
      )}
      {plugin?.state === 'inUse' && (
        <Note>
          <b>{words.install.inUse.title}</b> {words.install.inUse.text}
        </Note>
      )}
      {plugin?.state === 'failed' && (
        <Note tone="bad">
          <b>{words.install.pluginFailed}</b> {explain(words, plugin.error)}
        </Note>
      )}
      {waiting?.modError && (
        <Note tone="bad">
          <b>{words.install.modFailed}</b> {explain(words, waiting.modError)}
        </Note>
      )}
      {(installError ?? error) && <Note tone="bad">{installError ?? error}</Note>}
      <Group place={5 + games.length + notSetUp.length}>
        <Row
          title={w.language}
          value={settings.settings?.language ? ownName(settings.settings.language) : w.languageAutomatic}
          link
          onClick={chooseLanguage}
        />
        <Row title={w.tutorial} link onClick={tutorial} />
        <Row title={cw.uninstall.row} danger onClick={uninstall} />
      </Group>
    </Panel>
  )
}

function MobileWebUi({ status, settings: state, cw }: Pick<PageProps, 'status' | 'settings' | 'cw'>) {
  const { settings, update, error } = state
  const w = cw.setup.mobileWebUi
  const [copiedUrl, setCopiedUrl] = useState('')
  const [copyFailedUrl, setCopyFailedUrl] = useState('')
  if (!settings) return null
  const enabled = settings.mobileWebUi
  const service = status?.mobileWebUi
  const running = enabled && service?.state === 'running'
  const url = running ? service.pairingUrl : null
  const busy = enabled && (!service || service.state === 'off')
  return (
    <Group place={4}>
      <Row
        title={w.title}
        detail={w.detail}
        wrap
        accessory={
          <Switch on={enabled} label={w.title} change={(on) => void update({ ...settings, mobileWebUi: on })} />
        }
      />
      {busy && <Note>{w.starting}</Note>}
      {enabled && service?.state === 'error' && (
        <Note tone="bad">
          {w.unavailable} {service.message}
        </Note>
      )}
      {running && !url && <Note>{w.noAddress}</Note>}
      {url && (
        <>
          <PairingQr url={url} hint={w.qrHint} label={w.qrLabel} />
          <Row
            title={url}
            detail={w.copy}
            wrap
            onClick={() => {
              setCopyFailedUrl('')
              navigator.clipboard.writeText(url).then(
                () => setCopiedUrl(url),
                () => setCopyFailedUrl(url),
              )
            }}
          />
          {copyFailedUrl === url && (
            <input aria-label={w.link} readOnly value={url} onFocus={(event) => event.target.select()} />
          )}
        </>
      )}
      {url && <Note>{copiedUrl === url ? w.copied : w.keepPrivate}</Note>}
      {error && <Note tone="bad">{error}</Note>}
    </Group>
  )
}

function PairingQr({ url, hint, label }: { url: string; hint: string; label: string }) {
  const qr = useMemo(() => encodeQr(url), [url])
  const path = useMemo(() => qrSvgPath(qr, 4), [qr])
  const box = qr.size + 8
  return (
    <div className="ob-row cp-lan-qr">
      <div className="cp-lan-qr-card">
        <svg className="cp-lan-qr-svg" viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label}>
          <rect width={box} height={box} fill="#fff" />
          <path d={path} fill="#000" />
        </svg>
      </div>
      <span className="cp-lan-qr-hint">{hint}</span>
    </div>
  )
}

/** One game set up: its folder and version, WestPlay's plugin in it, and what its check found wrong. Titled with
 * its name when there are two. */
function GameSetUp({
  game,
  titled,
  place,
  checks,
  cw,
  error,
}: PageProps & { game: GameInfo; titled: boolean; place: number; error: string | null }) {
  const words = useWords()
  const w = cw.setup
  const check = checks[game.dir]
  const pluginState = check?.plugin
  return (
    <>
      <Group title={titled ? GAME_NAMES[game.kind] : w.game} place={place}>
        <Row title={w.folder} detail={game.dir} />
        <Row
          title={words.check.version}
          detail={gameSummary(words, game)}
          accessory={game.tested ? <Tick done /> : undefined}
        />
        <Row
          title={w.plugin}
          detail={words.install.pluginDetail}
          value={pluginState ? w.pluginStates[pluginState] : undefined}
          accessory={
            !check && !error ? (
              <Checking />
            ) : pluginState === 'current' ? (
              <Tick done />
            ) : (
              <Status tone={pluginState === 'missing' ? 'bad' : 'idle'} />
            )
          }
        />
      </Group>
      {check?.modProblem && (
        <Note tone="bad">
          <b>{words.check.cantInstall}</b> {check.modProblem}
        </Note>
      )}
      {check?.otherApps.includes('ymnOne') && (
        <Note tone="bad">
          <b>{words.check.otherCarPlay.title}</b> {words.check.otherCarPlay.text}
        </Note>
      )}
    </>
  )
}
