/**
 * panamediaPlayer.tsx
 * ===================
 * Recovered from Panamedia Electron app bundle:
 *   C:\Program Files\Panamedia\resources\app.asar
 *   -> dist/assets/index-DNSsw8Qo.js  (lines 24477-26099)
 *
 * The original .tsx was compiled + minified by Vite before packaging.
 * This file preserves the exact formatted source of the player component.
 *
 * Variable name mapping (minified -> readable):
 *   tn({ filePath: e, title: t })  -> PanamediaPlayer({ filePath, title })
 *   _ -> React
 *   W -> jsx/jsxs runtime
 *   K -> window.electron (ipcRenderer bridge)
 *   n,r  -> isPlaying, setIsPlaying
 *   i,a  -> currentTime, setCurrentTime
 *   o,s  -> duration, setDuration
 *   c,l  -> volume, setVolume
 *   u,d  -> playbackSpeed, setPlaybackSpeed
 *   f,p  -> aspectRatio, setAspectRatio
 *   m,h  -> repeatMode, setRepeatMode
 *   g,v  -> videoFilters, setVideoFilters
 *   T,E  -> currentFilePath, setCurrentFilePath
 *   L,ae -> showPlaylist, showSendTray
 *   dt   -> AUDIO_ONLY_EXTENSIONS
 *   lt   -> DEFAULT_VIDEO_FILTERS
 *
 * IPC channels (unchanged from original):
 *   check-media-info, delete-file, open-file-dialog,
 *   player-state-changed, get-player-state, archive-updated
 *
 * LocalStorage keys (unchanged):
 *   player_volume, player_speed, player_aspectRatio,
 *   player_repeatMode, player_videoFilters, player_invertScroll,
 *   player_lastPlayedPath, player_lastPlayedTitle, player_downloadDir
 */

// ─── IMPORTS & DECLARATIONS (restored from minified names) ───────────────────
import * as _ from 'react';

// JSX runtime alias  (W = { jsx, jsxs } in the original bundle)
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
const W = { jsx: _jsx, jsxs: _jsxs };

// Window type augmentations
declare global {
  interface Window {
    /** Electron preload bridge (window.electron) */
    electron?: {
      ipcRenderer: {
        invoke(channel: string, ...args: unknown[]): Promise<unknown>;
        send(channel: string, ...args: unknown[]): void;
        on(channel: string, listener: (...args: unknown[]) => void): void;
        removeListener(channel: string, listener: (...args: unknown[]) => void): void;
      };
      webUtils?: { getPathForFile(file: File): string };
    };
    /** Native Electron webUtils exposed by preload */
    electronWebUtils?: { getPathForFile(file: File): string };
    /** Shared AudioContext created by the audio engine hook */
    __panaAudioContext?: AudioContext;
  }
}

// K = window.electron (ipcRenderer bridge)
const K = (typeof window !== 'undefined'
  ? ((window as any).electron || ((window as any).require ? (window as any).require('electron') : undefined))
  : undefined) as Window['electron'];

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** Audio-only file extensions (dt in the bundle) */
const dt: string[] = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.opus', '.wma'];

/** Supported video file extensions (ut in the bundle) */
const ut: string[] = [
  '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv',
  '.m4v', '.ts', '.mts', '.m2ts', '.vob', '.ogv', '.3gp',
];

/** Default video filter values (lt in the bundle) */
const lt = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sharpen: 0,
};

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────

/**
 * en – returns the directory portion of a file path (like path.dirname).
 * Used for folder-based repeat mode.
 */
function en(filePath: string): string {
  return filePath.replace(/[\\/][^\\/]+$/, '');
}

/**
 * Qt – hashes / encrypts a plain-text archive PIN into a versioned hash string.
 * Stored as "v1:<base64>" in localStorage.
 */
async function Qt(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const base64 = btoa(String.fromCharCode(...hashArr));
  return `v1:${base64}`;
}

/**
 * $t – verifies a plain-text PIN against the stored hash.
 * Returns { valid, needsUpgrade, upgradedHash }.
 */
async function $t(
  pin: string,
  storedHash: string,
): Promise<{ valid: boolean; needsUpgrade: boolean; upgradedHash?: string }> {
  if (!storedHash) return { valid: false, needsUpgrade: false };
  if (storedHash.startsWith('v1:')) {
    const computed = await Qt(pin);
    return { valid: computed === storedHash, needsUpgrade: false };
  }
  // Legacy plain-text comparison → upgrade to v1 hash
  if (pin === storedHash) {
    const upgradedHash = await Qt(pin);
    return { valid: true, needsUpgrade: true, upgradedHash };
  }
  return { valid: false, needsUpgrade: false };
}

// ─── REAL IMPORTS (hooks & components from panamedia/) ───────────────────────

import { useAudioPipeline as Gt } from './panamedia/hooks/useAudioPipeline';
import { useMediaLibrary as Wt } from './panamedia/hooks/useMediaLibrary';
import { usePlayerShortcuts as Kt } from './panamedia/hooks/usePlayerShortcuts';

import { PlayerTitleBar as At } from './panamedia/PlayerTitleBar';
import { VideoScreen as Ot } from './panamedia/VideoScreen';
import { PlayerControls as kt } from './panamedia/PlayerControls';
import { SidebarTabs as Pt } from './panamedia/SidebarTabs';
import { PlaylistPanel as Mt } from './panamedia/PlaylistPanel';
import { EqualizerPanel as Ft } from './panamedia/EqualizerPanel';
import { SendtrayPanel as It } from './panamedia/SendtrayPanel';
import { SendToFlashModal as Dt } from './SendToFlashModal';
import { PlayerHelpModal as Lt } from './panamedia/PlayerHelpModal';

import { AlertTriangle as Ze } from 'lucide-react';

// ─── EXTRACTED SOURCE (pretty-printed from production bundle) ────────────────
function tn({ filePath: e, title: t }) {
  let [n, r] = (0, _.useState)(!1),
    [i, a] = (0, _.useState)(0),
    [o, s] = (0, _.useState)(0),
    [c, l] = (0, _.useState)(
      () => Number(localStorage.getItem(`player_volume`)) || 100,
    ),
    [u, d] = (0, _.useState)(
      () => Number(localStorage.getItem(`player_speed`)) || 1,
    ),
    [f, p] = (0, _.useState)(
      () => localStorage.getItem(`player_aspectRatio`) || `fit`,
    ),
    [m, h] = _.useState<'off' | 'all' | 'one' | 'folder'>(
      () => (localStorage.getItem(`player_repeatMode`) as 'off' | 'all' | 'one' | 'folder') || `off`,
    ),
    [g, v] = (0, _.useState)(() => {
      try {
        let e = localStorage.getItem(`player_videoFilters`);
        return e ? JSON.parse(e) : lt;
      } catch {
        return lt;
      }
    });
  (0, _.useEffect)(() => {
    localStorage.setItem(`player_videoFilters`, JSON.stringify(g));
  }, [g]);
  let [y, b] = (0, _.useState)(!1),
    [x, S] = (0, _.useState)(!1),
    [C, w] = (0, _.useState)(0),
    [restoreSeq, setRestoreSeq] = (0, _.useState)(0),
    pendingRestoreRef = (0, _.useRef)<{ targetTime: number; shouldResume: boolean } | null>(null),
    [T, ee] = (0, _.useState)(
      () => e || localStorage.getItem(`player_lastPlayedPath`) || ``,
    ),
    [E, D] = (0, _.useState)(
      () => (e ? t : localStorage.getItem(`player_lastPlayedTitle`)) || ``,
    ),
    [O, k] = (0, _.useState)(
      () => localStorage.getItem(`player_downloadDir`) || ``,
    ),
    A = (e) => {
      if (!e) return !1;
      let t = e.toLowerCase();
      return dt.some((e) => t.endsWith(e))
        ? !1
        : !(t.endsWith(`.mp4`) || t.endsWith(`.webm`));
    },
    [te, ne] = (0, _.useState)(() => {
      let t = e || localStorage.getItem(`player_lastPlayedPath`) || ``;
      if (!t) return { checking: !1, duration: 0, needsTranscode: !1 };
      let n = t.toLowerCase();
      return {
        checking: !1,
        duration: 0,
        needsTranscode: dt.some((e) => n.endsWith(e)) ? !1 : A(t),
      };
    }),
    j = T.split(`.`).pop()?.toLowerCase() || ``,
    M = dt.includes(`.` + j),
    N = !T,
    P = !M && te.checking,
    re = T && !M && (y || te.needsTranscode),
    [F, I] = (0, _.useState)(() => {
      let e = Number(localStorage.getItem(`player_lastPlayedTime`)) || 0;
      return e > 0 ? e : 0;
    });
  ((0, _.useEffect)(() => {
    a(0);
    let e = M ? !1 : A(T);
    ne(() => ({ checking: !M, duration: 0, needsTranscode: e }));
  }, [T, M]),
    (0, _.useEffect)(() => {
      if (!T || !K) return;
      if (M) {
        ne({ checking: !1, duration: 0, needsTranscode: !1 });
        return;
      }
      let e = !0;
      return (
        K.ipcRenderer
          .invoke(`check-media-info`, T)
          .then((_raw) => {
            const t = _raw as { success?: boolean; duration?: number; needsTranscode?: boolean; error?: string } | null;
            if (!e) return;
            if (t && t.success) {
              ne({
                checking: !1,
                duration: t.duration || 0,
                needsTranscode: !!(t.needsTranscode || A(T)),
              });
              t.duration && t.duration > 0 && a(t.duration);
            } else {
              ne({ checking: !1, duration: 0, needsTranscode: A(T) });
              // Store missing-file status so a later effect can act on it
              if (t?.error === 'File not found') {
                localStorage.setItem('player_pendingAutoRemove', T);
              }
            }
          })
          .catch(() => {
            e && ne({ checking: !1, duration: 0, needsTranscode: A(T) });
          }),
        () => {
          e = !1;
        }
      );
    }, [T, M, C]),
    (0, _.useEffect)(() => {
      T && !M && (y || te.needsTranscode) ? S(!0) : S(!1);
      let e = setTimeout(() => {
        S(!1);
      }, 5e3);
      return () => clearTimeout(e);
    }, [T, y, te.needsTranscode, M]));
  let ie = (0, _.useRef)(!0);
  (0, _.useEffect)(() => {
    if (e && e !== T) {
      ee(e);
      if (t) D(t);
      a(0);
      s(0);
      b(!1);
      setTimeout(() => {
        if (q.current) {
          q.current.currentTime = 0;
          q.current.load();
          q.current.play().catch(() => {});
        }
      }, 50);
    }
  }, [e, t]);
  (0, _.useEffect)(() => {
    T &&
      (localStorage.setItem(`player_lastPlayedPath`, T),
      localStorage.setItem(`player_lastPlayedTitle`, E || ``));
  }, [T, E]);
  let [L, R] = (0, _.useState)(!0),
    [ae, oe] = (0, _.useState)(!0),
    [z, se] = _.useState<'primary' | 'videos' | 'audios' | 'effects' | 'sendtray'>(`primary`),
    [ce, le] = (0, _.useState)(`primary`);
  (0, _.useEffect)(() => {
    (z === `videos` || z === `audios` || z === `primary`) && le(z);
  }, [z]);
  let [ue, de] = _.useState<'videos' | 'audios'>(`videos`),
    [fe, pe] = (0, _.useState)(
      () => localStorage.getItem(`player_invertScroll`) === `true`,
    );
  (0, _.useEffect)(() => {
    localStorage.setItem(`player_invertScroll`, fe ? `true` : `false`);
  }, [fe]);
  let [B, me] = (0, _.useState)(!1),
    [V, he] = (0, _.useState)(!0),
    [ge, _e] = (0, _.useState)(!1),
    [ve, ye] = (0, _.useState)(!1),
    [be, xe] = (0, _.useState)(!1),
    [Se, Ce] = (0, _.useState)(!1),
    [we, Te] = (0, _.useState)(!1),
    [Ee, De] = _.useState<string | null>(null),
    [Oe, H] = (0, _.useState)(!1),
    [ke, Ae] = (0, _.useState)(!1),
    [U, je] = (0, _.useState)(() =>
      JSON.parse(localStorage.getItem(`player_sendTray`) || `[]`),
    ),
    [Me, Ne] = _.useState<number | null>(null),
    [Pe, Fe] = _.useState<string | null>(null),
    Ie = _.useRef<any>(null),
    [Le, Re] = _.useState<{ amount: number; direction: 'forward' | 'backward' } | null>(null),
    ze = _.useRef<any>(null),
    [Be, Ve] = (0, _.useState)(
      () => localStorage.getItem(`player_playbackQuality`) || `original`,
    );
  (0, _.useEffect)(() => {
    localStorage.setItem(`player_playbackQuality`, Be);
  }, [Be]);
  let [He, Ue] = (0, _.useState)({}),
    [We, Ge] = (0, _.useState)(``),
    [Ke, qe] = _.useState<'files' | 'folders'>(`files`),
    [Je, Ye] = (0, _.useState)({});
  (0, _.useEffect)(() => {
    O && Ye((e) => ({ ...e, [O]: !0 }));
  }, [O]);
  let [Xe, Qe] = _.useState<'all' | 'archive' | 'favourites'>(`all`),
    [$e, et] = (0, _.useState)(() => {
      try {
        return JSON.parse(localStorage.getItem(`player_favourites`) || `[]`);
      } catch {
        return [];
      }
    }),
    [tt, nt] = (0, _.useState)(() => {
      try {
        return JSON.parse(localStorage.getItem(`player_archive`) || `[]`);
      } catch {
        return [];
      }
    }),
    [rt, it] = (0, _.useState)(
      () => localStorage.getItem(`player_archive_pin`) || ``,
    ),
    [at, ot] = (0, _.useState)(!1),
    [st, ct] = _.useState<{ path: string; isFolder: boolean; name: string } | null>(null);
  ((0, _.useEffect)(() => {
    K &&
      K.ipcRenderer
        .invoke(`load-archive-data`)
        .then((_raw) => {
          const e = _raw as { success?: boolean; data?: { archivePaths?: string[]; favouritePaths?: string[]; archivePin?: string } } | null;
          if (!e?.success || !e.data) return;
          let t = e.data;
          (t.archivePaths?.length &&
            nt((e) => {
              let n = new Set(
                  e.map((e) => e.replace(/[\\\\/]/g, `/`).toLowerCase()),
                ),
                r = [...e];
              for (let e of t.archivePaths || []) {
                let t = e.replace(/[\\/]/g, `/`).toLowerCase();
                n.has(t) || (r.push(e), n.add(t));
              }
              return (
                r.length !== e.length &&
                  localStorage.setItem(`player_archive`, JSON.stringify(r)),
                r
              );
            }),
            t.favouritePaths?.length &&
              et((e) => {
                let n = new Set(
                    e.map((e) => e.replace(/[\\/]/g, `/`).toLowerCase()),
                  ),
                  r = [...e];
                for (let e of t.favouritePaths || []) {
                  let t = e.replace(/[\\\\/]/g, `/`).toLowerCase();
                  n.has(t) || (r.push(e), n.add(t));
                }
                return (
                  r.length !== e.length &&
                    localStorage.setItem(
                      `player_favourites`,
                      JSON.stringify(r),
                    ),
                  r
                );
              }),
            t.archivePin &&
              !localStorage.getItem(`player_archive_pin`) &&
              (it(t.archivePin),
              localStorage.setItem(`player_archive_pin`, t.archivePin)));
        })
        .catch(() => {});
  }, []),
    (0, _.useEffect)(() => {
      !K ||
        tt.length === 0 ||
        tt.forEach((e) => {
          K.ipcRenderer
            .invoke(`archive-set-os-lock`, {
              path: e,
              shouldLock: !0,
              isFolder: !e.includes(`.`),
            })
            .catch(() => {});
        });
    }, []),
    (0, _.useEffect)(() => {
      (localStorage.setItem(`player_favourites`, JSON.stringify($e)),
        K &&
          K.ipcRenderer
            .invoke(`save-archive-data`, { favouritePaths: $e })
            .catch(() => {}));
    }, [$e]),
    (0, _.useEffect)(() => {
      (localStorage.setItem(`player_archive`, JSON.stringify(tt)),
        K && K.ipcRenderer.send(`archive-updated`, tt));
    }, [tt]),
    (0, _.useEffect)(() => {
      let e = localStorage.getItem(`player_archive_pin`) || ``;
      e &&
        !e.startsWith(`v1:`) &&
        Qt(e)
          .then((e) => {
            (localStorage.setItem(`player_archive_pin`, e), it(e));
          })
          .catch(() => {});
    }, []),
    (0, _.useEffect)(() => {
      rt &&
        (localStorage.setItem(`player_archive_pin`, rt),
        K &&
          K.ipcRenderer
            .invoke(`save-archive-data`, { archivePin: rt })
            .catch(() => {}));
    }, [rt]));
  (0, _.useEffect)(() => {
    const handlePinUpdate = (newPin: string) => {
      const pinVal = newPin || '';
      it(pinVal);
      if (!pinVal) {
        ot(!0);
      }
    };
    if (K) {
      const onPinIpc = (_evt: unknown, pin: unknown) => {
        handlePinUpdate(typeof pin === 'string' ? pin : '');
      };
      K.ipcRenderer.on('archive-pin-updated', onPinIpc);
      return () => {
        K.ipcRenderer.removeListener('archive-pin-updated', onPinIpc);
      };
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'player_archive_pin') {
        handlePinUpdate(e.newValue || '');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  let ft = (e) => e.replace(/[\\/]/g, `/`).toLowerCase(),
    G = (0, _.useCallback)(
      (e) => {
        let t = ft(e);
        return tt.some((e) => {
          let n = ft(e);
          return t === n || t.startsWith(n + `/`);
        });
      },
      [tt],
    ),
    pt = (0, _.useCallback)(
      (e) => {
        let t = ft(e);
        return $e.some((e) => ft(e) === t);
      },
      [$e],
    ),
    mt = (0, _.useCallback)((e) => {
      let t = ft(e);
      et((n) =>
        n.some((e) => ft(e) === t) ? n.filter((e) => ft(e) !== t) : [...n, e],
      );
    }, []),
    ht = (0, _.useCallback)(
      (e, t = !1) => {
        let n = ft(e),
          i = !1;
        (nt((t) => {
          let r = t.some((e) => ft(e) === n);
          return ((i = !r), r ? t.filter((e) => ft(e) !== n) : [...t, e]);
        }),
          K &&
            K.ipcRenderer
              .invoke(`archive-set-os-lock`, {
                path: e,
                shouldLock: i,
                isFolder: t,
              })
              .catch(() => {}));
        let a = T ? ft(T) : ``,
          o = a && (a === n || a.startsWith(n + `/`));
        i &&
          !at &&
          o &&
          (r(!1),
          q.current && q.current.pause(),
          se(M ? `audios` : `videos`),
          Qe(`archive`));
      },
      [T, at, M],
    ),
    gt = (0, _.useCallback)((e) => {
      if (!e.length) return;
      let t = new Set(e.map((e) => ft(e)));
      (nt((e) => e.filter((e) => !t.has(ft(e)))),
        K &&
          e.forEach((e) => {
            K.ipcRenderer
              .invoke(`archive-set-os-lock`, {
                path: e,
                shouldLock: !1,
                isFolder: !e.includes(`.`),
              })
              .catch(() => {});
          }));
    }, []),
    _t = (0, _.useCallback)((e) => {
      if (!e.length) return;
      let t = new Set(e.map((e) => ft(e)));
      et((e) => e.filter((e) => !t.has(ft(e))));
    }, []),
    vt = (0, _.useCallback)(
      async (e) => {
        if (!rt) return !1;
        let { valid: t, needsUpgrade: n, upgradedHash: i } = await $t(e, rt);
        return t
          ? (n && i && (it(i), localStorage.setItem(`player_archive_pin`, i)),
            ot(!0),
            T && G(T) && (r(!0), q.current && q.current.play().catch(() => {})),
            !0)
          : !1;
      },
      [rt, T, G],
    ),
    yt = (0, _.useCallback)(
      async (e) => {
        let t = await Qt(e);
        (it(t),
          localStorage.setItem(`player_archive_pin`, t),
          ot(!0),
          T && G(T) && (r(!0), q.current && q.current.play().catch(() => {})));
      },
      [T, G],
    ),
    bt = (0, _.useCallback)(() => {
      (ot(!1), T && G(T) && (r(!1), q.current && q.current.pause()));
    }, [T, G]),
    xt = (0, _.useCallback)(() => {
      (r(!1), q.current && q.current.pause(), ee(``), D(``));
    }, []),
    St = !!(T && G(T) && !at),
    Ct = !!(
      L &&
      (z === `videos` || z === `audios` || z === `primary`) &&
      Xe === `archive` &&
      !at
    );
  (0, _.useEffect)(() => {
    if (St) {
      r(!1);
      let e = q.current;
      e && (e.pause(), (e.currentTime = 0), (e.muted = !0));
    } else {
      let e = q.current;
      e && (e.muted = !1);
    }
  }, [St]);
  let [wt, Tt] = (0, _.useState)(
      () => localStorage.getItem(`player_eqEnabled`) === `true`,
    ),
    [Et, jt] = (0, _.useState)(
      () => localStorage.getItem(`player_eqPreset`) || `Flat`,
    ),
    [Nt, Rt] = (0, _.useState)(() => {
      try {
        let e = localStorage.getItem(`player_eqBands`);
        return e ? JSON.parse(e) : [0, 0, 0, 0, 0];
      } catch {
        return [0, 0, 0, 0, 0];
      }
    });
  ((0, _.useEffect)(() => {
    localStorage.setItem(`player_eqEnabled`, String(wt));
  }, [wt]),
    (0, _.useEffect)(() => {
      localStorage.setItem(`player_eqPreset`, Et);
    }, [Et]),
    (0, _.useEffect)(() => {
      localStorage.setItem(`player_eqBands`, JSON.stringify(Nt));
    }, [Nt]));
  let q = _.useRef<HTMLVideoElement | null>(null),
    zt = _.useRef<HTMLDivElement | null>(null),
    Bt = _.useRef<HTMLCanvasElement | null>(null),
    Vt = _.useRef<any>(null),
    Ht = _.useRef<any>(null),
    [Ut, qt] = (0, _.useState)(52322);
  (0, _.useEffect)(() => {
    if (!K) return;
    // Fetch the port on mount — always returns 52322 default now so the
    // streaming URL is never empty on first render.
    K.ipcRenderer.invoke(`get-streaming-port`).then((port: unknown) => {
      if (typeof port === 'number' && port > 0) qt(port);
    });
    // When the C++ engine confirms its actual listening port, update immediately
    // so the media URL rebuilds and the video element gets a valid src.
    const onPortReady = (_evt: unknown, port: unknown) => {
      if (typeof port === 'number' && port > 0) qt(port);
    };
    K.ipcRenderer.on('streaming-port-ready', onPortReady);
    return () => {
      K?.ipcRenderer.removeListener('streaming-port-ready', onPortReady);
    };
  }, []);
  let Jt =
      T && !St
        ? y || re
          ? `http://127.0.0.1:${Ut}/transcode?path=${encodeURIComponent(T)}&start=${F}&quality=${Be}${restoreSeq ? `&_r=${restoreSeq}` : ``}`
          : `http://127.0.0.1:${Ut}/stream?path=${encodeURIComponent(T)}${restoreSeq ? `&_r=${restoreSeq}` : ``}`
        : ``,
    [Yt, Xt] = (0, _.useState)<{ hasError?: boolean; message?: string; filePath?: string } | null>(null);
  (0, _.useEffect)(() => {
    Xt(null);
  }, [T]);
  let Zt = (0, _.useCallback)(() => {
      (Xt(null),
        b(!0),
        I(0),
        s(0),
        setTimeout(() => {
          q.current &&
            ((q.current.currentTime = 0),
            q.current.load(),
            q.current.play().catch(() => {}));
        }, 50));
    }, []),
    tn = (0, _.useCallback)(
      (e, t) => {
        (w((e) => e + 1), ee(e), t && D(t), s(0), I(0), a(0), b(!1), Xt(null));
        let n = !!(e && G(e) && !at);
        (r(!n),
          S(!1),
          setTimeout(() => {
            q.current &&
              ((q.current.currentTime = 0),
              n
                ? (q.current.pause(), (q.current.muted = !0))
                : ((q.current.muted = !1),
                  q.current.load(),
                  q.current.play().catch((e) => {
                    e.name === `AbortError` ||
                      e.message?.includes(`interrupted`);
                  })));
          }, 10));
      },
      [G, at],
    ),
    nn = M
      ? {
          position: `absolute`,
          width: `1px`,
          height: `1px`,
          opacity: 0.001,
          pointerEvents: `none`,
          left: `-9999px`,
          display: `block`,
        }
      : {
          width: `100%`,
          height: `100%`,
          objectFit: f === `fit` ? `cover` : f === `fill` ? `fill` : `contain`,
          maxWidth:
            f === `16-9`
              ? `calc(100vh * 16 / 9)`
              : f === `4-3`
                ? `calc(100vh * 4 / 3)`
                : `100%`,
          maxHeight: `100%`,
          display: `block`,
        },
    rn = T
      ? `http://127.0.0.1:${Ut}/thumbnail?path=${encodeURIComponent(T)}`
      : null,
    {
      eqFiltersRef: an,
      initAudio: on,
      adjustVolume: sn,
      analyserRef: J,
    } = Gt({
      videoRef: q,
      volume: c,
      setVolume: l,
      eqEnabled: wt,
      eqBands: Nt,
    }),
    cn = (0, _.useRef)(c > 0 ? c : 100),
    ln = (0, _.useCallback)(
      (e) => {
        (e > 0 && (cn.current = e), sn(e));
      },
      [sn],
    ),
    {
      syncedVideos: un,
      syncedAudios: dn,
      currentDirVideos: fn,
      currentDirAudios: pn,
      playerSyncing: mn,
      playerSyncedDirs: hn,
      downloads: gn,
      handleSyncClick: _n,
      removeMediaItem: removeMediaFromLibrary,
    } = Wt({
      currentPath: T,
      downloadDir: O,
      setDownloadDir: k,
      setCurrentPath: ee,
      setCurrentTitle: D,
      setCurrentTime: s,
      setDuration: a,
      setForceTranscode: b,
      setSidebarTab: se,
      sidebarTab: z,
      sendTrayItems: U,
      setPrimarySubTab: de,
      setPlayerExpandedFolders: Ye,
      onOpenFile: tn,
      mediaSubTab: Xe,
      isItemArchived: G,
    }),
    vn = (() => {
      let e = O ? O.toLowerCase().replace(/[\\/]/g, `/`) : ``,
        t = gn
          .filter((e) => e.status === `completed`)
          .map((e) => ({
            name: e.filename,
            path: e.saveDir + `\\` + e.filename,
            size: e.totalBytes,
            category: [`mp3`, `m4a`, `flac`, `wav`, `ogg`, `aac`].some((t) =>
              e.filename.toLowerCase().endsWith(t),
            )
              ? `audios`
              : `videos`,
            ext: e.filename.split(`.`).pop(),
          }));
      if (z === `sendtray`)
        return U.map((e) => {
          let t = e.split(/[\\/]/).pop() || e,
            n = t.split(`.`).pop()?.toLowerCase() || ``;
          return {
            name: t,
            path: e,
            category: [`mp3`, `m4a`, `flac`, `wav`, `ogg`, `aac`].includes(n)
              ? `audios`
              : `videos`,
            ext: n,
          };
        });
      let n = z === `effects` ? ce : z,
        dlNorm = e.toLowerCase().replace(/[\\/]/g, `/`);
      if (dlNorm.endsWith(`/`)) dlNorm = dlNorm.slice(0, -1);
      let isDownloadItem = (filePath: string) => {
        if (!filePath) return !1;
        let p = filePath.toLowerCase().replace(/[\\/]/g, `/`);
        if (dlNorm && (p === dlNorm || p.startsWith(dlNorm + `/`))) return !0;
        let dirParts = p.split(`/`);
        dirParts.pop();
        let folder = dirParts.pop() || ``;
        return folder === `download` || folder === `downloads`;
      },
        a: any[] = [];
      if (n === `videos`) {
        let e = new Map();
        ((Xe === `favourites` || Xe === `archive`) &&
          t
            .filter((e) => e.category === `videos` && !isDownloadItem(e.path))
            .forEach((t) =>
              e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
            ),
          fn.forEach((t) =>
            !isDownloadItem(t.path) && e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
          ),
          un.forEach((t) =>
            !isDownloadItem(t.path) && e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
          ),
          (a = Array.from(e.values()).filter((e) => !isDownloadItem(e.path))));
      } else if (n === `audios`) {
        let e = new Map();
        ((Xe === `favourites` || Xe === `archive`) &&
          t
            .filter((e) => e.category === `audios` && !isDownloadItem(e.path))
            .forEach((t) =>
              e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
            ),
          pn.forEach((t) =>
            !isDownloadItem(t.path) && e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
          ),
          dn.forEach((t) =>
            !isDownloadItem(t.path) && e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
          ),
          (a = Array.from(e.values()).filter((e) => !isDownloadItem(e.path))));
      } else if (n === `primary`) {
        let e = new Map();
        (ue === `videos`
          ? (t
              .filter((e) => e.category === `videos`)
              .forEach((t) =>
                e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
              ),
            fn.forEach((t) => {
              isDownloadItem(t.path) &&
                e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t);
            }),
            un.forEach((t) => {
              isDownloadItem(t.path) &&
                e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t);
            }))
          : (t
              .filter((e) => e.category === `audios`)
              .forEach((t) =>
                e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t),
              ),
            pn.forEach((t) => {
              isDownloadItem(t.path) &&
                e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t);
            }),
            dn.forEach((t) => {
              isDownloadItem(t.path) &&
                e.set(t.path.replace(/[\\/]/g, `/`).toLowerCase(), t);
            })),
          (a = Array.from(e.values())));
      }
      return n === `videos` || n === `audios`
        ? Xe === `favourites`
          ? a.filter((e) => !G(e.path) && pt(e.path))
          : Xe === `archive`
            ? at
              ? a.filter((e) => G(e.path))
              : []
            : a.filter((e) => !G(e.path) && !pt(e.path))
        : a.filter((e) => !G(e.path) && !pt(e.path));
    })(),
    yn = (() => {
      let e = T ? ft(T) : ``;
      return e && U.some((t) => ft(t) === e)
        ? U.map((e) => {
            let t = e.split(/[\\/]/).pop() || e,
              n = t.split(`.`).pop()?.toLowerCase() || ``;
            return {
              name: t,
              path: e,
              category: [`mp3`, `m4a`, `flac`, `wav`, `ogg`, `aac`].includes(n)
                ? `audios`
                : `videos`,
              ext: n,
            };
          })
        : vn;
    })(),
    { favouriteCount: bn, archiveCount: xn } = (0, _.useMemo)(() => {
      let dlNorm = O ? O.toLowerCase().replace(/[\\/]/g, `/`) : ``;
      if (dlNorm.endsWith(`/`)) dlNorm = dlNorm.slice(0, -1);
      let isDownloadItem = (filePath: string) => {
        if (!filePath) return !1;
        let p = filePath.toLowerCase().replace(/[\\/]/g, `/`);
        if (dlNorm && (p === dlNorm || p.startsWith(dlNorm + `/`))) return !0;
        let dirParts = p.split(`/`);
        dirParts.pop();
        let folder = dirParts.pop() || ``;
        return folder === `download` || folder === `downloads`;
      };
      let e: any[] = [];
      if (z === `videos`) {
        let t = new Map();
        (fn.forEach((e) => !isDownloadItem(e.path) && t.set(e.path, e)),
          un.forEach((e) => !isDownloadItem(e.path) && t.set(e.path, e)),
          (e = Array.from(t.values())));
      } else if (z === `audios`) {
        let t = new Map();
        (pn.forEach((e) => !isDownloadItem(e.path) && t.set(e.path, e)),
          dn.forEach((e) => !isDownloadItem(e.path) && t.set(e.path, e)),
          (e = Array.from(t.values())));
      }
      return {
        favouriteCount: e.filter((e) => pt(e.path) && !G(e.path)).length,
        archiveCount: e.filter((e) => G(e.path)).length,
      };
    }, [z, fn, un, pn, dn, pt, G]),
    Sn = (0, _.useCallback)(() => {
      if (St) return;
      if (Yt?.hasError) {
        Zt();
        return;
      }
      let e = q.current;
      e && (e.paused ? e.play().catch(() => {}) : e.pause());
    }, [St, Yt, Zt]),
    Y = (0, _.useCallback)(
      (e) => {
        let t = q.current;
        if (!t) return;
        let n =
            t.duration &&
            !isNaN(t.duration) &&
            isFinite(t.duration) &&
            t.duration > 0
              ? t.duration
              : i || 999999,
          r = Math.max(0, Math.min(n, e));
        s(r);
        if (y || re) {
          I(r);
          setTimeout(() => {
            q.current && (q.current.load(), q.current.play().catch(() => {}));
          }, 50);
        } else {
          t.currentTime = r;
          t.play().catch(() => {});
        }
      },
      [y, re, i],
    ),
    restorePlayback = (0, _.useCallback)(
      (time: number, shouldResume: boolean, mediaData?: { filePath?: string; filename?: string }) => {
        const video = q.current;
        if (!video) return;

        if (mediaData?.filePath && mediaData.filePath !== T) {
          ee(mediaData.filePath);
          if (mediaData.filename) D(mediaData.filename);
        }

        const duration = i > 0 ? i : Number.POSITIVE_INFINITY;
        const targetTime = Math.max(0, Math.min(duration, time));
        const usesTranscode = y || re;

        s(targetTime);

        if (usesTranscode) {
          I(targetTime);
          pendingRestoreRef.current = { targetTime, shouldResume };
          setRestoreSeq((n) => n + 1);
          setTimeout(() => {
            if (q.current) {
              q.current.load();
              if (shouldResume) {
                r(!0);
                q.current.play().catch(() => {});
              }
            }
          }, 40);
          return;
        }

        // For direct streams: keep the existing stream connection intact!
        // Resume any suspended AudioContext first
        const ctx = (window as any).__panaAudioContext;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const applyDirectResume = () => {
          if (!q.current) return;
          try {
            if (Number.isFinite(targetTime) && targetTime >= 0) {
              if (Math.abs(q.current.currentTime - targetTime) > 0.3) {
                q.current.currentTime = targetTime;
              }
            }
          } catch (e) {}

          if (shouldResume) {
            r(!0);
            const playPromise = q.current.play();
            if (playPromise !== undefined) {
              playPromise.catch(() => {
                if (q.current) {
                  q.current.play().catch(() => {});
                }
              });
            }
          }
        };

        if (video.readyState >= 1) {
          applyDirectResume();
        } else {
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay);
            applyDirectResume();
          };
          video.addEventListener('canplay', onCanPlay, { once: true });
          try { video.load(); } catch (e) {}
          setTimeout(applyDirectResume, 350);
        }
      },
      [y, re, i],
    ),
    Cn = (0, _.useCallback)(() => {
      if (!q.current?.error || q.current?.seeking) {
        return;
      }
      if (q.current && (q.current.currentTime > 0.3 || q.current.readyState >= 3) && !q.current.paused) {
        return;
      }
      !y && T && !M
        ? (console.log(
            `[Player] Direct playback failed, automatically falling back to engine remuxing/transcoding...`,
          ),
          b(!0),
          setTimeout(() => {
            q.current &&
              (q.current.load(),
              q.current.play().catch(() => {}));
          }, 50))
        : (console.warn(`[Player] Playback error encountered for:`, T),
          setTimeout(() => {
            if (!q.current?.error || (q.current && (q.current.currentTime > 0.3 || q.current.readyState >= 3) && !q.current.paused)) {
              return;
            }
            Xt({
              hasError: !0,
              message: `This media file could not be played. The format may be unsupported, corrupted, or the file may have been moved.`,
              filePath: T,
            });
            r(!1);
            S(!1);
          }, 400));
    }, [y, T, M]),
    wn = (0, _.useCallback)(
      (e) => {
        Y(parseFloat(e.target.value));
      },
      [Y],
    ),
    Tn = (0, _.useCallback)(() => {
      let e = q.current;
      if (!e) return;
      let t = y || re,
        n = (t ? F : 0) + e.currentTime;
      if (!M && !t && e.currentTime > 0.6 && e.videoWidth === 0) {
        b(!0);
        return;
      }
      let r = i > 0 ? Math.min(n, i) : n;
      (s(r),
        r > 0 &&
          (localStorage.setItem(`player_lastPlayedTime`, String(r)), S(!1)),
        K &&
          K.ipcRenderer.send(`player-update-state`, {
            currentTime: r,
            duration: i || 0,
            playing: !e.paused,
            volume: c,
            filename: E,
            filePath: T,
          }));
    }, [c, E, T, y, re, F, i, M]),
    En = (0, _.useCallback)(() => {
      let e = q.current;
      if (!e) return;
      let t = y || re;
      (t
        ? i <= 1 &&
          !isNaN(e.duration) &&
          isFinite(e.duration) &&
          e.duration > 60 &&
          a(e.duration)
        : !isNaN(e.duration) &&
          isFinite(e.duration) &&
          e.duration > i &&
          a(e.duration),
        (e.playbackRate = u),
        (e.volume = Math.min(1, c / 100)));
      let n = !isNaN(e.duration) && isFinite(e.duration) ? e.duration : i || 0,
        r = Number(localStorage.getItem(`player_lastPlayedTime`)) || 0,
        o = n > 0 && r >= n - 2;
      if (ie.current) {
        if (r > 0 && !o) {
          if (!t) e.currentTime = r;
          s(r);
        } else {
          if (!t) e.currentTime = 0;
          s(0);
        }
        ie.current = !1;
      }
      e.play().catch(() => {});
    }, [u, c, y, re, i]),
    Dn = (0, _.useCallback)(() => {
      Xt(null);
      if (yn.length === 0) return;
      let e = T ? T.replace(/[\\/]/g, `/`).toLowerCase() : ``,
        t = U.some((t) => ft(t) === e);
      if (m === `folder` && !t) {
        let t = en(T),
          n = yn.filter((e) => en(e.path).toLowerCase() === t.toLowerCase());
        if (n.length > 0) {
          let cur = n.findIndex(
            (t) => t.path.replace(/[\\/]/g, `/`).toLowerCase() === e,
          );
          let target = (cur + 1) % n.length;
          let i = n[target];
          (ie.current = !0,
            Xt(null),
            ee(i.path),
            D(i.name),
            s(0),
            I(0),
            a(0),
            b(!1),
            r(!0),
            q.current &&
              ((q.current.currentTime = 0),
              q.current.load(),
              q.current.play().catch(() => {})));
          return;
        }
      }
      let cur = yn.findIndex(
        (t) => t.path.replace(/[\\/]/g, `/`).toLowerCase() === e,
      );
      let target = (cur + 1) % yn.length;
      let i = yn[target];
      (ie.current = !0,
        Xt(null),
        ee(i.path),
        D(i.name),
        s(0),
        I(0),
        a(0),
        b(!1),
        r(!0),
        q.current &&
          ((q.current.currentTime = 0),
          q.current.load(),
          q.current.play().catch(() => {})));
    }, [T, yn, m, U]),
    On = (0, _.useCallback)(() => {
      Xt(null);
      if (yn.length === 0) return;
      let e = T ? T.replace(/[\\/]/g, `/`).toLowerCase() : ``,
        t = U.some((t) => ft(t) === e);
      if (m === `folder` && !t) {
        let t = en(T),
          n = yn.filter((e) => en(e.path).toLowerCase() === t.toLowerCase());
        if (n.length > 0) {
          let cur = n.findIndex(
            (t) => t.path.replace(/[\\/]/g, `/`).toLowerCase() === e,
          );
          let target = cur <= 0 ? n.length - 1 : cur - 1;
          let i = n[target];
          (ie.current = !0,
            Xt(null),
            ee(i.path),
            D(i.name),
            s(0),
            I(0),
            a(0),
            b(!1),
            r(!0),
            q.current &&
              ((q.current.currentTime = 0),
              q.current.load(),
              q.current.play().catch(() => {})));
          return;
        }
      }
      let cur = yn.findIndex(
        (t) => t.path.replace(/[\\/]/g, `/`).toLowerCase() === e,
      );
      let target = cur <= 0 ? yn.length - 1 : cur - 1;
      let i = yn[target];
      (ie.current = !0,
        Xt(null),
        ee(i.path),
        D(i.name),
        s(0),
        I(0),
        a(0),
        b(!1),
        r(!0),
        q.current &&
          ((q.current.currentTime = 0),
          q.current.load(),
          q.current.play().catch(() => {})));
    }, [T, yn, m, U]),
    handleRemoveMissingMedia = (targetPath: string) => {
      if (!targetPath) return;
      const norm = targetPath.toLowerCase().replace(/[\\/]/g, '/');

      // Remove from React state via the hook (triggers re-render + localStorage via useEffect)
      removeMediaFromLibrary(targetPath);

      // Also clean up favourites & archive in-memory state
      try {
        const favRaw = localStorage.getItem('player_favourites');
        if (favRaw) {
          const favList = JSON.parse(favRaw);
          const newFavList = favList.filter((p: string) => p.toLowerCase().replace(/[\\/]/g, '/') !== norm);
          localStorage.setItem('player_favourites', JSON.stringify(newFavList));
          et(newFavList);
        }
      } catch (e) {}
      try {
        const arcRaw = localStorage.getItem('player_archive');
        if (arcRaw) {
          const arcList = JSON.parse(arcRaw);
          const newArcList = arcList.filter((p: string) => p.toLowerCase().replace(/[\\/]/g, '/') !== norm);
          localStorage.setItem('player_archive', JSON.stringify(newArcList));
          nt(newArcList);
        }
      } catch (e) {}

      // Notify main process to remove from its index too
      if (K) {
        K.ipcRenderer.invoke('remove-media-path', targetPath).catch(() => {});
      }

      // Dismiss error and advance to next track
      Xt(null);
      Dn();
    },
    kn = (0, _.useCallback)(() => {
      let e = q.current;
      if (e) {
        let t = y || re,
          n = t ? F + e.currentTime : e.duration;
        if (i > 10 && n < Math.max(2, i - 10)) {
          if (
            (console.warn(
              `[Player] Stream ended prematurely at ${n}s (expected ~${i}s). Preventing auto-skip.`,
            ),
            !y)
          ) {
            (console.log(`[Player] Falling back to engine transcode...`),
              b(!0),
              I(0),
              s(0),
              setTimeout(() => {
                q.current &&
                  ((q.current.currentTime = 0),
                  q.current.load(),
                  q.current.play().catch(() => {}));
              }, 50));
            return;
          }
          (r(!1), S(!1));
          return;
        }
        if ((!t && n > i && a(n), m === `one`)) {
          t
            ? (I(0),
              setTimeout(() => {
                q.current &&
                  (q.current.load(), q.current.play().catch(() => {}));
              }, 50))
            : ((e.currentTime = 0), e.play().catch(() => {}));
          return;
        }
        if (m === `off`) {
          (r(!1), S(!1), e.pause(), (e.currentTime = 0), s(0));
          return;
        }
      }
      Dn();
    }, [m, y, re, F, Dn, i]),
    An = (0, _.useCallback)(() => {
      let e = q.current;
      e && (e.pause(), (e.currentTime = 0), s(0));
    }, []),
    jn = (0, _.useCallback)(
      (e) => {
        let t = G(e.path);
        if (
          (ee(e.path), D(e.name), s(0), I(0), a(0), b(!1), Xt(null), t && !at)
        ) {
          (r(!1), q.current && q.current.pause());
          return;
        }
        (r(!0),
          q.current &&
            ((q.current.currentTime = 0),
            q.current.load(),
            q.current.play().catch(() => {})));
      },
      [G, at],
    ),
    Mn = (0, _.useCallback)((e) => {
      (e.preventDefault(),
        e.stopPropagation(),
        e.dataTransfer && (e.dataTransfer.dropEffect = `copy`));
    }, []),
    Nn = (0, _.useCallback)(
      (e) => {
        (e.preventDefault(), e.stopPropagation());
        let t = e.dataTransfer.files[0];
        if (!t) return;
        let n = ``;
        try {
          window.electronWebUtils?.getPathForFile &&
            (n = window.electronWebUtils.getPathForFile(t));
        } catch {}
        if (!n)
          try {
            K?.webUtils?.getPathForFile && (n = K.webUtils.getPathForFile(t));
          } catch {}
        if (((n ||= t.path || ``), (n ||= t.name || ``), !n)) return;
        let i = n.split(`.`).pop()?.toLowerCase() || ``;
        [
          ...ut.map((e) => e.replace(`.`, ``)),
          ...dt.map((e) => e.replace(`.`, ``)),
        ].includes(i) &&
          (ee(n),
          D(t.name),
          s(0),
          I(0),
          a(0),
          b(!1),
          r(!0),
          K &&
            n &&
            K.ipcRenderer
              .invoke(`register-media-folder`, n)
              .then(() => {
                _n();
              })
              .catch(() => {}));
      },
      [_n],
    ),
    Pn = (0, _.useCallback)(() => {
      me((e) => {
        let t = !e;
        return (
          t ? (oe(L), R(!1)) : R(ae),
          K && K.ipcRenderer.send(`player-set-fullscreen`, t),
          t
        );
      });
    }, [L, ae]),
    Fn = (0, _.useCallback)((e) => {
      (Ne(e),
        Fe(null),
        Ht.current && clearTimeout(Ht.current),
        (Ht.current = setTimeout(() => Ne(null), 1500)));
    }, []),
    In = (0, _.useCallback)((e) => {
      (Fe(e),
        Ne(null),
        Ie.current && clearTimeout(Ie.current),
        (Ie.current = setTimeout(() => Fe(null), 1500)));
    }, []),
    Ln = (0, _.useCallback)((e, t) => {
      (Re({ amount: e, direction: t }),
        ze.current && clearTimeout(ze.current),
        (ze.current = setTimeout(() => Re(null), 1200)));
    }, []),
    Rn = (0, _.useCallback)(() => {
      if (c > 0) (ln(0), Fn(0));
      else {
        let e = cn.current || 100;
        (ln(e), Fn(e));
      }
    }, [c, ln, Fn]),
    zn = (0, _.useCallback)(() => {
      (_e(!1),
        he(!0),
        Vt.current && clearTimeout(Vt.current),
        !Se &&
          !we &&
          (Vt.current = setTimeout(() => {
            (he(!1), _e(!0));
          }, 2500)));
    }, [Se, we]);
  (0, _.useEffect)(() => {
    Se || we
      ? (he(!0), _e(!1), (Vt.current &&= (clearTimeout(Vt.current), null)))
      : (Vt.current && clearTimeout(Vt.current),
        (Vt.current = setTimeout(() => {
          (he(!1), _e(!0));
        }, 2500)));
  }, [Se, we]);
  // ── right-click on media ────────────────────────────────────────────────
  //
  // Right-click opens the send-to-flash action modal for the clicked item. It
  // does not queue anything: the modal is a menu of what to do with this media
  // (convert, copy to a drive, move to a sendtray folder, favourite, archive),
  // and choosing Convert there is what adds it to the converter queue.
  //
  // This used to differ from that, adding the file to the queue on right-click
  // and skipping the modal, which took the user's other four choices away.
  let Bn = (0, _.useCallback)((_e, _t, n, r = !1) => {
    (De(n), H(r), Ae(!1));
  }, []);
  return (
    (0, _.useEffect)(() => {
      localStorage.setItem(`player_volume`, String(c));
    }, [c]),
    (0, _.useEffect)(() => {
      (localStorage.setItem(`player_speed`, String(u)),
        q.current && (q.current.playbackRate = u));
    }, [u]),
    (0, _.useEffect)(() => {
      localStorage.setItem(`player_aspectRatio`, f);
    }, [f]),
    (0, _.useEffect)(() => {
      localStorage.setItem(`player_repeatMode`, m);
    }, [m]),
    (0, _.useEffect)(() => {
      localStorage.setItem(`player_showPlaylist`, String(L));
    }, [L]),
    (0, _.useEffect)(() => {
      localStorage.setItem(`player_sendTray`, JSON.stringify(U));
    }, [U]),
    (0, _.useEffect)(() => {
      let e = () => {
        let e = window.__panaAudioContext;
        e && e.state === `suspended` && e.resume().catch(() => {});
      };
      return (
        window.addEventListener(`click`, e),
        window.addEventListener(`keydown`, e),
        () => {
          (window.removeEventListener(`click`, e),
            window.removeEventListener(`keydown`, e));
        }
      );
    }, []),
    (0, _.useEffect)(() => {
      const handleVisibility = () => {
        if (document.visibilityState !== 'visible') return;
        const video = q.current;
        if (!video || !video.src) return;
        // Resume playback if the video was playing when hidden
        if (n && video.paused) {
          video.play().catch(() => {});
        }
        // Resume any suspended AudioContext
        const ctx = (window as any).__panaAudioContext;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [n]),
    (0, _.useEffect)(() => {
      if (!restoreSeq || !pendingRestoreRef.current) return;
      const video = q.current;
      if (!video) return;

      let applied = false;
      const applyRestore = () => {
        if (applied) return;
        applied = true;
        const pending = pendingRestoreRef.current;
        pendingRestoreRef.current = null;
        if (!pending) return;

        const { targetTime, shouldResume } = pending;
        if (targetTime > 0) {
          try {
            video.currentTime = targetTime;
          } catch (e) {}
        }
        if (shouldResume) {
          r(!0);
          video.play().catch(() => {});
        }
      };

      video.addEventListener('canplay', applyRestore, { once: true });
      video.addEventListener('loadeddata', applyRestore, { once: true });
      video.addEventListener('playing', applyRestore, { once: true });

      const timer = setTimeout(() => {
        if (!applied) applyRestore();
      }, 1500);

      return () => {
        video.removeEventListener('canplay', applyRestore);
        video.removeEventListener('loadeddata', applyRestore);
        video.removeEventListener('playing', applyRestore);
        clearTimeout(timer);
      };
    }, [restoreSeq]),
    (0, _.useEffect)(() => {
      if (`mediaSession` in navigator)
        try {
          ((navigator.mediaSession.metadata = new MediaMetadata({
            title: E || `Panamedia Player`,
            artist: `Panamedia`,
            album: `Panamedia Media Player`,
            artwork: [
              { src: rn || `/player.ico`, sizes: `512x512`, type: `image/png` },
            ],
          })),
            navigator.mediaSession.setActionHandler(`play`, Sn),
            navigator.mediaSession.setActionHandler(`pause`, Sn),
            navigator.mediaSession.setActionHandler(`previoustrack`, On),
            navigator.mediaSession.setActionHandler(`nexttrack`, Dn),
            navigator.mediaSession.setActionHandler(`seekforward`, () =>
              Y(o + 10),
            ),
            navigator.mediaSession.setActionHandler(`seekbackward`, () =>
              Y(o - 10),
            ),
            navigator.mediaSession.setActionHandler(`stop`, An));
        } catch {}
    }, [E, rn, Sn, On, Dn, Y, o, An]),
    Kt({
      videoRef: q,
      videoScreenRef: zt,
      volume: c,
      currentTime: o,
      seekTo: Y,
      currentPath: T,
      sidebarTab: z,
      repeatMode: m,
      flashDriveTarget: Ee,
      togglePlay: Sn,
      adjustVolume: ln,
      toggleMute: Rn,
      showVolumeHUD: Fn,
      showMessageHUD: In,
      showSkipHUD: Ln,
      toggleFullscreen: Pn,
      handleNext: Dn,
      handlePrev: On,
      setRepeatMode: h,
      setFlashDriveTarget: De,
      setSidebarTab: se,
      showPlaylist: L,
      setShowPlaylist: R,
      invertScroll: fe,
      isMediaLocked: St,
      wakeControls: zn,
      restorePlayback,
    }),
    (0, _.useEffect)(() => {
      K &&
        K.ipcRenderer.send(`player-update-state`, {
          currentTime: o,
          duration: i,
          playing: n,
          volume: c,
          filename: E,
          filePath: T,
        });
    }, [n, o, i, c, E, T]),
    (0, _.useEffect)(() => {
      if (!K) return;
      let e = (_evt: any, t: any) => {
        (me(t), t || R(ae));
      };
      return (
        K.ipcRenderer.on(`player-fullscreen-changed`, e),
        () => {
          K.ipcRenderer.removeListener(`player-fullscreen-changed`, e);
        }
      );
    }, [ae]),
    (0, _.useEffect)(() => {
      if (!K) return;
      let onOpenReq = () => {
        K.ipcRenderer.invoke('open-converter-window').catch((error: unknown) => {
          console.error('Failed to open Converter Pro:', error);
        });
      };
      K.ipcRenderer.on('converter-open-request', onOpenReq);
      return () => {
        K.ipcRenderer.removeListener('converter-open-request', onOpenReq);
      };
    }, [T, Ee]),

    // ── Auto-remove missing files ────────────────────────────────────────────
    // When check-media-info sets 'player_pendingAutoRemove' for the current path,
    // this effect fires (after Dn and removeMediaFromLibrary are in scope) to
    // silently purge the file and advance to the next track automatically.
    (0, _.useEffect)(() => {
      const pending = localStorage.getItem('player_pendingAutoRemove');
      if (!pending || !T || pending.toLowerCase().replace(/[\\/]/g, '/') !== T.toLowerCase().replace(/[\\/]/g, '/')) return;

      console.info(`[Player] Auto-removing missing file from library: ${T}`);
      localStorage.removeItem('player_pendingAutoRemove');

      // Notify main process (also cleans settings.syncedFolders if folder is gone)
      if (K) K.ipcRenderer.invoke('remove-media-path', T).catch(() => {});

      // Remove from React state via the hook (updates playlist immediately)
      removeMediaFromLibrary(T);

      // Clean favourites & archive localStorage lists
      try {
        const norm = T.toLowerCase().replace(/[\\/]/g, '/');
        const favRaw = localStorage.getItem('player_favourites');
        if (favRaw) {
          const newFav = JSON.parse(favRaw).filter((p: string) => p.toLowerCase().replace(/[\\/]/g, '/') !== norm);
          localStorage.setItem('player_favourites', JSON.stringify(newFav));
        }
        const arcRaw = localStorage.getItem('player_archive');
        if (arcRaw) {
          const newArc = JSON.parse(arcRaw).filter((p: string) => p.toLowerCase().replace(/[\\/]/g, '/') !== norm);
          localStorage.setItem('player_archive', JSON.stringify(newArc));
        }
      } catch (_) {}

      // Skip to next track after state settles
      setTimeout(() => Dn(), 400);
    }, [T, te, Dn, removeMediaFromLibrary]),

    (0, W.jsxs)(`div`, {
      onDragOver: Mn,
      onDrop: Nn,
      style: {
        height: `100vh`,
        display: `flex`,
        flexDirection: `column`,
        background: `#09090e`,
        overflow: `hidden`,
        position: B ? `fixed` : `relative`,
        inset: B ? 0 : void 0,
        zIndex: B ? 9999 : void 0,
      },
      onMouseMove: zn,
      children: [
        !B && (0, W.jsx)(At, {
          currentTitle: E,
          onHelpClick: () => xe(!0),
          onOpenConverter: () => {
            K?.ipcRenderer.invoke('open-converter-window').catch((error: unknown) => {
              console.error('Failed to open Converter Pro:', error);
            });
          },
        }),
        (0, W.jsxs)(`div`, {
          style: {
            flex: 1,
            display: `flex`,
            overflow: `hidden`,
            minHeight: 0,
            position: `relative`,
          },
          children: [
            (0, W.jsxs)(`div`, {
              style: {
                flex: 1,
                display: `flex`,
                flexDirection: `column`,
                minWidth: 0,
                overflow: `hidden`,
                position: `relative`,
                marginRight: B && L && V ? `280px` : `0px`,
                transition: `margin-right 0.4s cubic-bezier(0.4, 0, 0.2, 1)`,
              },
              children: [
                (0, W.jsx)(Ot, {
                  videoScreenRef: zt,
                  videoRef: q,
                  canvasRef: Bt,
                  analyserRef: J,
                  isAudioFile: M,
                  isIdle: N,
                  isBuffering: x,
                  isCheckingMedia: P,
                  mediaUrl: Jt,
                  videoStyle: nn,
                  repeatMode: m,
                  speed: u,
                  hudVolume: Me,
                  hudMessage: Pe,
                  hudSkip: Le,
                  thumbnailToShow: rn,
                  imgErrors: He,
                  setImgErrors: Ue,
                  setPlaying: r,
                  setIsBuffering: S,
                  togglePlay: Sn,
                  toggleFullscreen: Pn,
                  handleTimeUpdate: Tn,
                  handleLoadedMetadata: En,
                  cursorVisible: !ge,
                  handleVideoEnded: kn,
                  handleDragOver: Mn,
                  handleDrop: Nn,
                  initAudio: on,
                  currentTitle: E,
                  onContextMenu: (e) => {
                    T && Bn(e.clientX, e.clientY, T, !1);
                  },
                  videoFilters: g,
                  onMediaError: Cn,
                  playbackError: Yt,
                  onRetryPlayback: Zt,
                  onNextTrack: Dn,
                  onDismissError: () => Xt(null),
                  onRemoveMissingMedia: handleRemoveMissingMedia,
                  isMediaLocked: St,
                  isArchiveTabActive: Ct,
                  archivePin: rt,
                  onUnlockAndResume: vt,
                  onSetArchivePinAndResume: yt,
                  onCancelLock: xt,
                }),
                (0, W.jsx)(kt, {
                  isFullscreen: B,
                  controlsVisible: V,
                  playing: n,
                  currentTime: o,
                  duration: i,
                  volume: c,
                  speed: u,
                  aspectRatio: f,
                  repeatMode: m,
                  forceTranscode: y,
                  playbackQuality: Be,
                  showSettingsPopover: ve,
                  showPlaylist: L,
                  sidebarTab: z,
                  sendTrayItems: U,
                  currentPath: T,
                  streamingPort: Ut,
                  thumbnailToShow: rn,
                  videoFilters: g,
                  setVideoFilters: v,
                  setShowSettingsPopover: ye,
                  setShowPlaylist: R,
                  setSpeed: d,
                  setAspectRatio: p,
                  setForceTranscode: b,
                  setPlaybackQuality: Ve,
                  setRepeatMode: h,
                  setSidebarTab: se,
                  invertScroll: fe,
                  setInvertScroll: pe,
                  togglePlay: Sn,
                  handlePrev: On,
                  handleNext: Dn,
                  handleStop: An,
                  handleSeek: wn,
                  adjustVolume: ln,
                  toggleMute: Rn,
                  toggleFullscreen: Pn,
                  onMouseEnter: () => Te(!0),
                  onMouseLeave: () => Te(!1),
                  isAudioFile: M,
                  isMediaLocked: St,
                }),
              ],
            }),
            L &&
              (0, W.jsxs)(`div`, {
                onMouseEnter: () => Ce(!0),
                onMouseLeave: () => Ce(!1),
                style: B
                  ? {
                      width: `280px`,
                      display: `flex`,
                      flexDirection: `column`,
                      borderLeft: `1px solid rgba(255,255,255,0.08)`,
                      background: `rgba(9, 9, 14, 0.88)`,
                      backdropFilter: `blur(20px)`,
                      position: `absolute`,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      zIndex: 1e3,
                      transition: `transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s`,
                      transform: V ? `translateX(0)` : `translateX(100%)`,
                      opacity: +!!V,
                      pointerEvents: V ? `auto` : `none`,
                    }
                  : {
                      width: `280px`,
                      display: `flex`,
                      flexDirection: `column`,
                      borderLeft: `1px solid rgba(255,255,255,0.06)`,
                      background: `rgba(9,9,14,0.6)`,
                      minHeight: 0,
                    },
                children: [
                  (0, W.jsx)(Pt, {
                    sidebarTab: z,
                    playerSyncing: mn,
                    playerSyncedDirs: hn,
                    playerSearch: We,
                    playerViewMode: Ke,
                    sendTrayItems: U,
                    mediaSubTab: Xe,
                    setMediaSubTab: Qe,
                    favouriteCount: bn,
                    archiveCount: xn,
                    isArchiveUnlocked: at,
                    onLockArchive: bt,
                    setSidebarTab: se,
                    setPlayerSearch: Ge,
                    setPlayerViewMode: qe,
                    handleSyncClick: _n,
                  }),
                  z !== `effects` &&
                    z !== `sendtray` &&
                    (0, W.jsx)(Mt, {
                      currentPlaylist: vn,
                      currentPath: T,
                      streamingPort: Ut,
                      playerSearch: We,
                      playerViewMode: Ke,
                      playerExpandedFolders: Je,
                      downloads: gn,
                      imgErrors: He,
                      setPlayerExpandedFolders: Ye,
                      setImgErrors: Ue,
                      playPlaylistItem: jn,
                      showContextMenu: Bn,
                      sidebarTab: z,
                      primarySubTab: ue,
                      setPrimarySubTab: de,
                      mediaSubTab: Xe,
                      isArchiveUnlocked: at,
                      archivePin: rt,
                      onUnlockArchive: vt,
                      onSetArchivePin: yt,
                      isItemFavourite: pt,
                      toggleFavourite: mt,
                      batchUnarchive: gt,
                      batchUnfavourite: _t,
                    }),
                  z === `effects` &&
                    (0, W.jsx)(Ft, {
                      eqEnabled: wt,
                      eqBands: Nt,
                      eqPreset: Et,
                      eqFiltersRef: an,
                      setEqEnabled: Tt,
                      setEqBands: Rt,
                      setEqPreset: jt,
                    }),
                  z === `sendtray` &&
                    (0, W.jsx)(It, {
                      sendTrayItems: U,
                      setSendTrayItems: je,
                      setFlashDriveTarget: De,
                      setIsSendTrayBatch: Ae,
                      streamingPort: Ut,
                      onPlayMedia: (e, t) => {
                        let r = t || e.split(/[\\/]/).pop() || ``;
                        T && T.toLowerCase() === e.toLowerCase()
                          ? n || Sn()
                          : tn(e, r);
                      },
                      currentPath: T,
                      isPlaying: n,
                    }),
                ],
              }),
          ],
        }),
        Ee &&
          (0, W.jsx)(Dt, {
            filePath: Ee,
            onClose: () => {
              (De(null), Ae(!1), H(!1));
            },
            isBatch: ke,
            sendTrayItems: U,
            setSendTrayItems: je,
            isFolder: Oe,
            isFavourite: pt(Ee),
            isArchived: G(Ee),
            onToggleFavourite: mt,
            onToggleArchive: (e, t) => {
              if (!G(e)) {
                let n = ft(e);
                if (
                  $e.some((e) => {
                    let t = ft(e);
                    return t === n || t.startsWith(n + `/`);
                  })
                ) {
                  ct({
                    path: e,
                    isFolder: t,
                    name: e.split(/[\\/]/).pop() || e,
                  });
                  return;
                }
              }
              ht(e, t);
            },
          }),
        be && (0, W.jsx)(Lt, { onClose: () => xe(!1) }),
        st &&
          (0, W.jsx)(`div`, {
            style: {
              position: `fixed`,
              inset: 0,
              background: `rgba(0, 0, 0, 0.78)`,
              backdropFilter: `blur(10px)`,
              display: `flex`,
              alignItems: `center`,
              justifyContent: `center`,
              zIndex: 99999,
              padding: `16px`,
            },
            onClick: () => ct(null),
            children: (0, W.jsxs)(`div`, {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: `100%`,
                maxWidth: `380px`,
                background: `linear-gradient(135deg, #181824 0%, #0e0e16 100%)`,
                border: `1px solid rgba(245, 158, 11, 0.35)`,
                borderRadius: `14px`,
                padding: `24px 20px`,
                boxShadow: `0 20px 50px rgba(0,0,0,0.85), 0 0 30px rgba(245, 158, 11, 0.1)`,
                display: `flex`,
                flexDirection: `column`,
                alignItems: `center`,
                textAlign: `center`,
              },
              children: [
                (0, W.jsx)(`div`, {
                  style: {
                    width: `48px`,
                    height: `48px`,
                    borderRadius: `50%`,
                    background: `rgba(245, 158, 11, 0.15)`,
                    border: `1px solid rgba(245, 158, 11, 0.4)`,
                    display: `flex`,
                    alignItems: `center`,
                    justifyContent: `center`,
                    color: `#f59e0b`,
                    marginBottom: `14px`,
                  },
                  children: (0, W.jsx)(Ze, { size: 24 }),
                }),
                (0, W.jsx)(`h3`, {
                  style: {
                    fontSize: `15px`,
                    fontWeight: 600,
                    color: `#fff`,
                    margin: `0 0 8px 0`,
                  },
                  children: `Remove from Favourites & Archive?`,
                }),
                (0, W.jsxs)(`p`, {
                  style: {
                    fontSize: `12px`,
                    color: `rgba(255,255,255,0.8)`,
                    lineHeight: 1.5,
                    margin: `0 0 6px 0`,
                  },
                  children: [
                    (0, W.jsxs)(`span`, {
                      style: { color: `#fef08a`, fontWeight: 600 },
                      children: [`"`, st.name, `"`],
                    }),
                    ` is currently in your Favourites.`,
                  ],
                }),
                (0, W.jsx)(`p`, {
                  style: {
                    fontSize: `11px`,
                    color: `var(--text-muted)`,
                    lineHeight: 1.45,
                    margin: `0 0 20px 0`,
                  },
                  children: `Moving it to Secured Archive will hide it from the public Favourites list to keep it secret. When restored from Archive later, its Favourite status will remain the same.`,
                }),
                (0, W.jsxs)(`div`, {
                  style: { display: `flex`, gap: `10px`, width: `100%` },
                  children: [
                    (0, W.jsx)(`button`, {
                      type: `button`,
                      onClick: () => ct(null),
                      className: `btn-secondary`,
                      style: {
                        flex: 1,
                        padding: `9px 12px`,
                        borderRadius: `8px`,
                        fontSize: `12px`,
                        border: `1px solid rgba(255,255,255,0.12)`,
                        background: `rgba(255,255,255,0.06)`,
                        color: `#fff`,
                        cursor: `pointer`,
                        fontWeight: 500,
                      },
                      children: `Cancel`,
                    }),
                    (0, W.jsx)(`button`, {
                      type: `button`,
                      onClick: () => {
                        (ht(st.path, st.isFolder), ct(null));
                      },
                      className: `btn-primary`,
                      style: {
                        flex: 1.4,
                        padding: `9px 12px`,
                        borderRadius: `8px`,
                        fontSize: `12px`,
                        background: `linear-gradient(135deg, #f59e0b 0%, #d97706 100%)`,
                        color: `#000`,
                        border: `none`,
                        cursor: `pointer`,
                        fontWeight: 700,
                      },
                      children: `Archive & Hide`,
                    }),
                  ],
                }),
              ],
            }),
          }),
        (!B || V) &&
          (0, W.jsx)(`button`, {
            onClick: () => R((e) => !e),
            style: {
              position: `absolute`,
              right: L ? `280px` : `0px`,
              top: `50%`,
              transform: `translateY(-50%)`,
              width: `18px`,
              height: `48px`,
              background: `rgba(15, 15, 22, 0.9)`,
              border: `1px solid rgba(255, 255, 255, 0.08)`,
              borderRight: L ? `none` : `1px solid rgba(255, 255, 255, 0.08)`,
              borderLeft: L ? `1px solid rgba(255, 255, 255, 0.08)` : `none`,
              borderRadius: L ? `8px 0 0 8px` : `0 8px 8px 0`,
              display: `flex`,
              alignItems: `center`,
              justifyContent: `center`,
              cursor: `pointer`,
              zIndex: 2e3,
              color: `rgba(255, 255, 255, 0.7)`,
              transition: `all 0.4s cubic-bezier(0.4, 0, 0.2, 1)`,
              outline: `none`,
              padding: 0,
            },
            onMouseEnter: (e) => {
              ((e.currentTarget.style.color = `#fff`),
                (e.currentTarget.style.background = `rgba(99, 102, 241, 0.3)`));
            },
            onMouseLeave: (e) => {
              ((e.currentTarget.style.color = `rgba(255, 255, 255, 0.7)`),
                (e.currentTarget.style.background = `rgba(15, 15, 22, 0.9)`));
            },
            title: L ? `Hide Playlist` : `Show Playlist`,
            children: L
              ? (0, W.jsx)(`svg`, {
                  viewBox: `0 0 24 24`,
                  width: `10`,
                  height: `10`,
                  fill: `none`,
                  stroke: `currentColor`,
                  strokeWidth: `3`,
                  strokeLinecap: `round`,
                  strokeLinejoin: `round`,
                  children: (0, W.jsx)(`polyline`, {
                    points: `9 18 15 12 9 6`,
                  }),
                })
              : (0, W.jsx)(`svg`, {
                  viewBox: `0 0 24 24`,
                  width: `10`,
                  height: `10`,
                  fill: `none`,
                  stroke: `currentColor`,
                  strokeWidth: `3`,
                  strokeLinecap: `round`,
                  strokeLinejoin: `round`,
                  children: (0, W.jsx)(`polyline`, {
                    points: `15 18 9 12 15 6`,
                  }),
                }),
          }),
      ],
    })
  );
}
/**
 * nn – number formatter helper (reconstructed).
 * Formats a numeric value to `t` decimal places as a string.
 * e.g. nn(1.23456, 2) => "1.23"
 * @public – retained for use by sibling components.
 */
export function nn(e: number, t = 2): string {
  return Number(e).toFixed(t);
}

// ─── End of extracted panamediaPlayer component ──────────────────────────────
// In the original app, this component (tn) is rendered from the root mn()
// component when URL param mode=player is detected.
// Example usage:
//   <PanamediaPlayer filePath="C:/Videos/movie.mp4" title="My Movie" />

import { memo } from 'react';

const PanamediaPlayerMemo = memo(tn);
export default PanamediaPlayerMemo;
export { PanamediaPlayerMemo as PanamediaPlayer };
