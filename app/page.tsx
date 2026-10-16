"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BoothState,
  FrameRatio,
  GridCount,
  PhotoSlot,
} from "../lib/types";
import {
  clearDraft,
  defaultState,
  hasPhotos,
  loadDraft,
  saveDraft,
  visibleSlots,
} from "../lib/state";
import { renderBoothBlob } from "../lib/render";
import { renderBoothGifBlob } from "../lib/gif";
import { downloadBlob, fileToFrame, fileToPhotoDataURL } from "../lib/image";
import Image from "next/image";
import {
  addFrameToLibrary,
  loadFrameLibrary,
  removeFrameFromLibrary,
  type SavedFrame,
} from "../lib/frameLibrary";
import {
  addCommunityFrame,
  communityEnabled,
  communityFrameDataURL,
  deleteCommunityFrame,
  listCommunityFrames,
  type CommunityFrame,
} from "../lib/communityFrames";
import {
  boothLayout,
  clamp,
  photoInset,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../lib/layout";
import { downloadTemplateGuide, downloadTemplatePNG } from "../lib/template";
import LayoutChoices from "../components/LayoutChoices";
import {
  findBuiltinFrame,
  frameVariant,
  framesForRatio,
  isBuiltinFrame,
} from "../lib/frames";
import { shareProvider, type ShareLink } from "../lib/share";
import PhotoSlotView from "../components/PhotoSlotView";
import CameraModal from "../components/CameraModal";
import { mergeCapturedSlots } from "../components/camera/session";
import ShareModal from "../components/ShareModal";
import { Toast, useToast } from "../components/useToast";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  DownloadIcon,
  ImageIcon,
  PlusIcon,
  ResetIcon,
  ShareIcon,
  UploadIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../components/icons";
import AddFrameModal from "../components/AddFrameModal";

export default function Home() {
  const [state, setState] = useState<BoothState>(() => defaultState(3));
  const [hydrated, setHydrated] = useState(false);
  const [draftSaved, setDraftSaved] = useState<boolean | null>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [captureTargets, setCaptureTargets] = useState<number[] | null>(null);
  const [showFrame, setShowFrame] = useState(true);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [frameLibrary, setFrameLibrary] = useState<SavedFrame[]>([]);
  const [communityFrames, setCommunityFrames] = useState<CommunityFrame[]>([]);
  const [frameCode, setFrameCode] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [frameUnlocked, setFrameUnlocked] = useState(false);
  const [frameError, setFrameError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [busy, setBusy] = useState<"download" | "share" | "gif" | null>(null);
  const { toast, show } = useToast();
  const frameInputRef = useRef<HTMLInputElement>(null);
  const frameReelRef = useRef<HTMLDivElement>(null);
  const scrollFrameReel = useCallback((dir: 1 | -1) => {
    const el = frameReelRef.current;
    if (!el) return;
    const step = 264;
    const atStart = el.scrollLeft <= 2;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    // Nonstop reel: past the last frame wraps back to the first (and vice versa).
    if (dir > 0) el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: "smooth" });
    else el.scrollTo({ left: atStart ? el.scrollWidth : el.scrollLeft - step, behavior: "smooth" });
  }, []);
  const currentState = useRef(state);
  currentState.current = state;
  const photoRequests = useRef([0, 0, 0, 0]);
  const frameRequest = useRef(0);
  const communitySources = useRef(new Map<string, string>());
  const shareRequest = useRef(0);

  // The frame access code lives for the whole browser session (matching the
  // modal copy) so community actions keep working after a page reload.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("selfie-booth:frame-code");
      if (saved) {
        setFrameCode(saved);
        setFrameUnlocked(true);
      }
    } catch {}
  }, []);
  const updateFrameCode = useCallback((value: string) => {
    setFrameCode(value);
    try {
      if (value) sessionStorage.setItem("selfie-booth:frame-code", value);
      else sessionStorage.removeItem("selfie-booth:frame-code");
    } catch {}
  }, []);

  // Load: shared link first, then local draft.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const shared = await shareProvider.resolve(window.location);
      if (cancelled) return;
      if (shared) {
        setState(shared);
        // strip the payload so edits don't look like they update the shared link
        window.history.replaceState(null, "", window.location.pathname);
        show("Desain dari link berhasil dimuat", "success");
      } else {
        const draft = loadDraft();
        if (draft) {
          setState(draft);
          if (hasPhotos(draft)) show("Draft terakhir dipulihkan", "info");
        }
      }
      setFrameLibrary(loadFrameLibrary());
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  // Community frames are served by the booth API and shared by every visitor.
  useEffect(() => {
    if (!communityEnabled()) return;
    let cancelled = false;
    listCommunityFrames(state.frameRatio)
      .then((frames) => {
        if (!cancelled) setCommunityFrames(frames);
      })
      .catch(() => {
        if (!cancelled) setCommunityFrames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state.frameRatio]);

  // Autosave draft (debounced).
  useEffect(() => {
    if (!hydrated) return;
    setDraftSaved(null);
    const t = setTimeout(() => setDraftSaved(saveDraft(state)), 400);
    return () => clearTimeout(t);
  }, [state, hydrated]);

  const layout = useMemo(() => boothLayout(state), [state]);
  const slots = visibleSlots(state);
  const filled = slots.filter((s) => s.src).length;
  const activePhoto = slots[activeSlot] as PhotoSlot | undefined;
  const customFrame = !!state.frameSrc && !isBuiltinFrame(state.frameSrc);
  const libraryFrames = useMemo(
    () => frameLibrary.filter((f) => f.ratio === state.frameRatio),
    [frameLibrary, state.frameRatio],
  );

  // Preview scale: measure the preview box to convert export px → screen px.
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setPreviewWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = previewWidth ? previewWidth / layout.w : 1;

  const updateSlot = useCallback((index: number, patch: Partial<PhotoSlot>) => {
    setState((s) => ({
      ...s,
      slots: s.slots.map((sl, i) => (i === index ? { ...sl, ...patch } : sl)),
    }));
  }, []);

  const setPhoto = useCallback(
    (index: number, src: string | null) => {
      photoRequests.current[index]++;
      updateSlot(index, { src, zoom: 1, ox: 0, oy: 0 });
      setActiveSlot(index);
    },
    [updateSlot],
  );

  const setGrid = useCallback((grid: GridCount) => {
    setState((s) => ({ ...s, grid, layoutVersion: 2 }));
    setActiveSlot((a) => Math.min(a, grid - 1));
  }, []);

  const setRatio = useCallback((ratio: FrameRatio) => {
    frameRequest.current++;
    setState((s) => {
      if (s.frameRatio === ratio) return s;
      const variant = frameVariant(s.frameSrc, ratio);
      const grid = ratio !== "16:9" && s.grid === 4 ? 3 : s.grid;
      return {
        ...s,
        grid,
        layoutVersion: 2,
        frameRatio: ratio,
        frameSrc: variant ? variant.src : null,
        frameInset: undefined,
        frameGrid: undefined,
      };
    });
    setActiveSlot(0);
  }, []);

  const chooseFrame = useCallback((src: string | null) => {
    frameRequest.current++;
    setState((s) => {
      const builtin = findBuiltinFrame(src);
      return {
        ...s,
        frameSrc: src,
        frameRatio: builtin ? builtin.ratio : s.frameRatio,
        frameInset: undefined,
        frameGrid: undefined,
      };
    });
  }, []);

  const uploadPhoto = useCallback(
    async (index: number, file: File) => {
      const request = ++photoRequests.current[index];
      try {
        const src = await fileToPhotoDataURL(file);
        if (photoRequests.current[index] !== request) return;
        setPhoto(index, src);
      } catch (e) {
        if (photoRequests.current[index] !== request) return;
        show((e as Error).message || "Gagal memproses gambar", "error");
      }
    },
    [setPhoto, show],
  );

  const pickFile = useCallback(
    (index: number) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const f = input.files?.[0];
        if (f) uploadPhoto(index, f);
      };
      input.click();
    },
    [uploadPhoto],
  );

  const firstEmptyOrActive = () => {
    const i = slots.findIndex((s) => !s.src);
    return i >= 0 ? i : activeSlot;
  };

  const openSession = () => {
    const empty = slots.flatMap((slot, i) => (slot.src ? [] : [i]));
    setCaptureTargets(empty.length ? empty : slots.map((_, i) => i));
  };

  const moveSlot = useCallback(
    (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= currentState.current.grid) return;
      photoRequests.current[index]++;
      photoRequests.current[target]++;
      setState((s) => {
        const j = index + dir;
        if (j < 0 || j >= s.grid) return s;
        const slots = [...s.slots];
        [slots[index], slots[j]] = [slots[j], slots[index]];
        return {
          ...s,
          slots: slots.map((sl, i) => ({ ...sl, id: `slot-${i}` })),
        };
      });
      setActiveSlot(clamp(index + dir, 0, state.grid - 1));
    },
    [state.grid],
  );

  const handleFrameUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const request = ++frameRequest.current;
      const original = currentState.current;
      try {
        const size = boothLayout(original);
        const { src, ratio, inset, windowCount } = await fileToFrame(
          file,
          original.frameRatio,
        );
        if (frameRequest.current !== request) return;
        if (currentState.current !== original)
          throw new Error(
            "Desain berubah. Pilih ulang frame untuk layout terbaru.",
          );
        // The uploaded PNG's own transparent windows drive the layout —
        // not whichever base frame happened to be selected (docs/TEMPLATES.md).
        const detectedGrid =
          windowCount >= 1 &&
          windowCount <= 4 &&
          windowCount !== original.grid &&
          !(ratio !== "16:9" && windowCount === 4)
            ? (windowCount as GridCount)
            : null;
        const grid = detectedGrid ?? original.grid;
        const name = file.name.replace(/\.png$/i, "").slice(0, 40) || "Frame";
        const applyFrame = () => {
          setState((s) => ({
            ...s,
            frameSrc: src,
            frameRatio: ratio,
            grid,
            frameGrid: grid,
            layoutVersion: 2,
            frameInset: inset ?? photoInset(original, size.w, size.h),
          }));
          setActiveSlot((a) => Math.min(a, grid - 1));
        };

        if (communityEnabled()) {
          // One collection: adding a frame requires the access code, and the
          // API validates it at upload time — a wrong code rejects the frame
          // entirely (nothing is applied or stored locally).
          const code = frameCode.trim();
          if (!code) {
            setFrameError("Masukkan kode akses dulu.");
            setAddOpen(true);
            return;
          }
          try {
            await addCommunityFrame({ name, code, dataUrl: src });
          } catch (err) {
            if (frameRequest.current !== request) return;
            const message = (err as Error).message;
            setFrameError(message);
            if (message.includes("Kode akses salah")) setFrameUnlocked(false);
            show(message, "error");
            return;
          }
          if (frameRequest.current !== request) return;
          applyFrame();
          setCommunityFrames(await listCommunityFrames(ratio));
          setFrameError("");
          setAddOpen(false);
          show("Frame ditambahkan ke koleksi", "success");
        } else {
          // No collection API configured: keep the device-local library.
          applyFrame();
          const { frames, saved } = addFrameToLibrary({
            name,
            src,
            ratio,
            grid,
            inset,
          });
          setFrameLibrary(frames);
          setAddOpen(false);
          const detail = [
            inset ? "jendela foto diukur otomatis" : "frame diterapkan",
            detectedGrid ? `· frame ini untuk ${detectedGrid} foto` : "",
            saved
              ? "· tersimpan ke koleksi"
              : "· penyimpanan penuh, frame belum tersimpan",
          ]
            .filter(Boolean)
            .join(" ");
          show(detail, saved ? "success" : "info");
        }
      } catch (err) {
        if (frameRequest.current !== request) return;
        show((err as Error).message || "Gagal memuat frame", "error");
      }
    },
    [show, frameCode],
  );

  const applySavedFrame = useCallback((frame: SavedFrame) => {
    frameRequest.current++;
    setState((s) => {
      if (frame.ratio !== s.frameRatio) return s;
      return {
        ...s,
        frameSrc: frame.src,
        frameRatio: frame.ratio,
        grid: frame.grid,
        frameGrid: frame.grid,
        frameInset: frame.inset ?? undefined,
        layoutVersion: 2,
      };
    });
    setActiveSlot((a) => Math.min(a, frame.grid - 1));
  }, []);

  const removeSavedFrame = useCallback(
    (id: string) => {
      setFrameLibrary(removeFrameFromLibrary(id));
      show("Frame dihapus dari koleksi perangkat ini", "info");
    },
    [show],
  );

  const applyCommunityFrame = useCallback(
    async (frame: CommunityFrame) => {
      const request = ++frameRequest.current;
      try {
        const src =
          communitySources.current.get(frame.id) ??
          (await communityFrameDataURL(frame));
        if (
          frameRequest.current !== request ||
          currentState.current.frameRatio !== frame.ratio
        )
          return;
        communitySources.current.set(frame.id, src);
        setState((s) => {
          if (frame.ratio !== s.frameRatio) return s;
          return {
            ...s,
            frameSrc: src,
            frameRatio: frame.ratio,
            grid: frame.grid,
            frameGrid: frame.grid,
            frameInset: frame.inset ?? undefined,
            layoutVersion: 2,
          };
        });
        setActiveSlot((a) => Math.min(a, frame.grid - 1));
      } catch (err) {
        if (frameRequest.current === request)
          show((err as Error).message, "error");
      }
    },
    [show],
  );

  const removeCommunityFrame = useCallback(
    async (frame: CommunityFrame) => {
      const code = frameCode.trim();
      if (!code) {
        show("Isi kode akses dulu untuk menghapus frame komunitas.", "info");
        return;
      }
      try {
        await deleteCommunityFrame(frame.id, code);
        setCommunityFrames((list) => list.filter((f) => f.id !== frame.id));
        // A selected frame is an embedded snapshot and remains usable after deletion.
        show("Frame dihapus dari koleksi komunitas", "info");
      } catch (err) {
        show((err as Error).message, "error");
      }
    },
    [frameCode, show],
  );

  const resetAll = useCallback(() => {
    if (
      state.slots.some((s) => s.src) &&
      !window.confirm(
        "Mulai baru? Semua foto, termasuk yang tersembunyi, akan dihapus.",
      )
    )
      return;
    photoRequests.current = photoRequests.current.map((request) => request + 1);
    frameRequest.current++;
    shareRequest.current++;
    clearDraft();
    setState(defaultState(3));
    setActiveSlot(0);
    setShareLink(null);
  }, [state]);

  const handleDownload = useCallback(async () => {
    setBusy("download");
    try {
      const blob = await renderBoothBlob(state);
      downloadBlob(blob, `selfie-booth-${Date.now()}.png`);
      show("PNG berhasil diunduh", "success");
    } catch (e) {
      console.error(e);
      show("Gagal membuat PNG. Coba lagi.", "error");
    } finally {
      setBusy(null);
    }
  }, [state, show]);

  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    !!navigator.canShare;

  const handleShareImage = useCallback(async () => {
    setBusy("share");
    try {
      const blob = await renderBoothBlob(state);
      const file = new File([blob], "selfie-booth.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Selfie Booth" });
      } else {
        downloadBlob(blob, file.name);
        show("Share file tidak didukung, PNG diunduh", "info");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        show("Gagal membagikan gambar", "error");
    } finally {
      setBusy(null);
    }
  }, [state, show]);

  const handleDownloadGif = useCallback(async () => {
    setBusy("gif");
    try {
      const blob = await renderBoothGifBlob(state);
      downloadBlob(blob, `selfie-booth-${Date.now()}.gif`);
      show("GIF berhasil diunduh", "success");
    } catch (e) {
      console.error(e);
      show("Gagal membuat GIF. Coba lagi.", "error");
    } finally {
      setBusy(null);
    }
  }, [state, show]);

  const handleShareGif = useCallback(async () => {
    setBusy("gif");
    try {
      const blob = await renderBoothGifBlob(state);
      const file = new File([blob], "selfie-booth.gif", { type: "image/gif" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Selfie Booth" });
      } else {
        downloadBlob(blob, file.name);
        show("Share file tidak didukung, GIF diunduh", "info");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        show("Gagal membagikan GIF", "error");
    } finally {
      setBusy(null);
    }
  }, [state, show]);

  const openShare = useCallback(async () => {
    const request = ++shareRequest.current;
    setShareOpen(true);
    setShareLink(null);
    setShareLoading(true);
    try {
      const link = await shareProvider.createLink(state);
      if (shareRequest.current === request) setShareLink(link);
    } catch {
      if (shareRequest.current !== request) return;
      show("Gagal membuat link", "error");
      setShareOpen(false);
    } finally {
      if (shareRequest.current === request) setShareLoading(false);
    }
  }, [state, show]);

  const closeShare = useCallback(() => {
    shareRequest.current++;
    setShareOpen(false);
  }, []);

  // Keyboard: zoom / nudge / delete for the active photo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (captureTargets !== null || shareOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      const slot = slots[activeSlot];
      if (!slot?.src) return;
      const step = 0.05;
      switch (e.key) {
        case "+":
        case "=":
          updateSlot(activeSlot, {
            zoom: clamp(slot.zoom + 0.1, MIN_ZOOM, MAX_ZOOM),
          });
          break;
        case "-":
          updateSlot(activeSlot, {
            zoom: clamp(slot.zoom - 0.1, MIN_ZOOM, MAX_ZOOM),
          });
          break;
        case "ArrowLeft":
          updateSlot(activeSlot, { ox: clamp(slot.ox + step, -1, 1) });
          break;
        case "ArrowRight":
          updateSlot(activeSlot, { ox: clamp(slot.ox - step, -1, 1) });
          break;
        case "ArrowUp":
          updateSlot(activeSlot, { oy: clamp(slot.oy + step, -1, 1) });
          break;
        case "ArrowDown":
          updateSlot(activeSlot, { oy: clamp(slot.oy - step, -1, 1) });
          break;
        case "Delete":
        case "Backspace":
          setPhoto(activeSlot, null);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slots, activeSlot, captureTargets, shareOpen, updateSlot, setPhoto]);

  const portrait = state.frameRatio !== "16:9";

  return (
    <main
      className="glow-bg min-h-screen pb-6"
      inert={!hydrated}
      aria-busy={!hydrated}
    >
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg">
              <Image
                src="assets/himasif.png"
                alt="Logo Selfie Booth"
                width={36}
                height={36}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">
                HIMASIF<span className="text-gradient"> Booth</span>
              </h1>
              <p className="text-[11px] text-ink-600">by MediatekAstra</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={resetAll}
              aria-label="Mulai baru"
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-ink-600 hover:bg-white/5 hover:text-cream sm:px-3"
              title="Mulai desain baru"
            >
              <ResetIcon size={16} />{" "}
              <span className="hidden sm:inline">Mulai baru</span>
            </button>
            <button
              type="button"
              onClick={openShare}
              disabled={filled === 0}
              aria-label="Bagikan"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-2 text-sm font-medium hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3"
              title={filled === 0 ? "Tambahkan foto dulu" : "Bagikan"}
            >
              <ShareIcon size={16} />{" "}
              <span className="hidden sm:inline">Bagikan</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy !== null || filled === 0}
              aria-label="Download PNG"
              className="flex items-center gap-1.5 rounded-lg bg-brand px-2 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
              title={filled === 0 ? "Tambahkan foto dulu" : "Download PNG"}
            >
              <DownloadIcon size={16} />
              <span className="hidden sm:inline">
                {busy === "download" ? "Menyiapkan…" : "Download PNG"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[1fr_360px]">
        {/* Preview */}
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between text-xs text-ink-600">
            <span>
              Preview · {layout.w}×{layout.h}px
            </span>
            <span className={filled === state.grid ? "text-emerald-400" : ""}>
              {filled === state.grid ? (
                <span className="inline-flex items-center gap-1">
                  <CheckIcon size={13} /> Semua foto terisi
                </span>
              ) : (
                `${filled}/${state.grid} foto terisi`
              )}
            </span>
          </div>

          <div
            ref={previewRef}
            data-testid="booth-preview"
            className="relative mx-auto overflow-hidden rounded-2xl bg-[#0d0d0d] shadow-2xl"
            style={{
              aspectRatio: `${layout.w} / ${layout.h}`,
              width: portrait
                ? `min(100%, ${(72 * layout.w) / layout.h}vh)`
                : "100%",
            }}
          >
            {slots.map((slot, i) => {
              const cell = layout.cells[i];
              if (!cell) return null;
              return (
                <div
                  key={slot.id}
                  className="absolute"
                  style={{
                    left: `${(cell.x / layout.w) * 100}%`,
                    top: `${(cell.y / layout.h) * 100}%`,
                    width: `${(cell.w / layout.w) * 100}%`,
                    height: `${(cell.h / layout.h) * 100}%`,
                  }}
                >
                  <PhotoSlotView
                    slot={slot}
                    index={i}
                    total={state.grid}
                    cell={cell}
                    scale={scale}
                    active={activeSlot === i}
                    onActivate={() => setActiveSlot(i)}
                    onAdjust={(patch) => updateSlot(i, patch)}
                    onCapture={() => setCaptureTargets([i])}
                    onUpload={(file) => uploadPhoto(i, file)}
                    onRemove={() => setPhoto(i, null)}
                    onMove={(dir) => moveSlot(i, dir)}
                  />
                </div>
              );
            })}

            {state.frameSrc && showFrame && (
              <img
                src={state.frameSrc}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            )}
          </div>

          <label className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-600">
            <input
              type="checkbox"
              checked={showFrame}
              onChange={(e) => setShowFrame(e.target.checked)}
              className="accent-[#FF7E1D]"
            />
            Tampilkan frame · tidak mengubah hasil unduhan
          </label>

          {/* Adjust active photo */}
          <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/60 p-4">
            {activePhoto?.src ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Atur Foto {activeSlot + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateSlot(activeSlot, { zoom: 1, ox: 0, oy: 0 })
                    }
                    className="flex items-center gap-1 text-xs text-ink-600 hover:text-cream"
                  >
                    <ResetIcon size={13} /> Reset posisi
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Perkecil"
                    onClick={() =>
                      updateSlot(activeSlot, {
                        zoom: clamp(activePhoto.zoom - 0.1, MIN_ZOOM, MAX_ZOOM),
                      })
                    }
                    className="rounded-lg p-1.5 text-ink-600 hover:bg-white/5 hover:text-cream"
                  >
                    <ZoomOutIcon size={18} />
                  </button>
                  <input
                    type="range"
                    aria-label="Zoom"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={activePhoto.zoom}
                    onChange={(e) =>
                      updateSlot(activeSlot, {
                        zoom: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-[#FF7E1D]"
                  />
                  <button
                    type="button"
                    aria-label="Perbesar"
                    onClick={() =>
                      updateSlot(activeSlot, {
                        zoom: clamp(activePhoto.zoom + 0.1, MIN_ZOOM, MAX_ZOOM),
                      })
                    }
                    className="rounded-lg p-1.5 text-ink-600 hover:bg-white/5 hover:text-cream"
                  >
                    <ZoomInIcon size={18} />
                  </button>
                  <span className="w-12 text-right font-mono text-xs text-ink-600">
                    {activePhoto.zoom.toFixed(2)}×
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-ink-600">
                  Seret foto untuk menggeser · scroll untuk zoom · panah ⇐ ⇒ di
                  foto untuk menukar urutan · keyboard: +/− zoom, panah geser,
                  Delete hapus
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-600">
                Klik <span className="text-cream">Kamera</span> atau{" "}
                <span className="text-cream">Upload</span> pada kotak untuk
                mengisi foto. Kamu juga bisa seret file gambar langsung ke
                kotak.
              </p>
            )}
          </div>
        </section>

        {/* Controls */}
        <aside className="min-w-0 space-y-4">
          <Panel step={1} title="Layout" open>
            <LayoutChoices
              state={state}
              locked={customFrame}
              onRatio={setRatio}
              onCount={setGrid}
            />
          </Panel>

          <Panel step={2} title="Frame">
            {/* One nonstop reel: builtin + saved + community frames, then the
                single "+" entry point (code-locked) for adding frames. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollFrameReel(-1)}
                aria-label="Geser frame ke kiri"
                className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-ink-950/90 p-1.5 text-ink-600 transition hover:border-brand hover:text-cream"
              >
                <ArrowLeftIcon size={14} />
              </button>
              <div
                ref={frameReelRef}
                className="flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="w-24 shrink-0">
                  <FrameChoice
                    selected={!state.frameSrc}
                    onClick={() => chooseFrame(null)}
                    label="Tanpa"
                    ratio={state.frameRatio}
                  >
                    <div className="flex h-full w-full items-center justify-center text-ink-600">
                      <XIcon size={16} />
                    </div>
                  </FrameChoice>
                </div>
                {framesForRatio(state.frameRatio).map((f) => (
                  <div key={f.id} className="w-24 shrink-0">
                    <FrameChoice
                      selected={state.frameSrc === f.src}
                      onClick={() => chooseFrame(f.src)}
                      label={f.name}
                      ratio={f.ratio}
                    >
                      <img src={f.src} alt="" className="h-full w-full" />
                    </FrameChoice>
                  </div>
                ))}
                {libraryFrames.map((f) => (
                  <div key={f.id} className="group relative w-24 shrink-0">
                    <FrameChoice
                      selected={state.frameSrc === f.src}
                      onClick={() => applySavedFrame(f)}
                      label={f.name}
                      ratio={f.ratio}
                    >
                      <img
                        src={f.src}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </FrameChoice>
                    <button
                      type="button"
                      onClick={() => removeSavedFrame(f.id)}
                      aria-label={`Hapus ${f.name} dari koleksi`}
                      title={`Hapus ${f.name} dari koleksi`}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-950 p-1 text-ink-600 opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                    >
                      <XIcon size={11} />
                    </button>
                  </div>
                ))}
                {communityFrames.map((f) => (
                  <div key={f.id} className="group relative w-24 shrink-0">
                    <FrameChoice
                      selected={
                        state.frameSrc === f.imageUrl ||
                        state.frameSrc === communitySources.current.get(f.id)
                      }
                      onClick={() => applyCommunityFrame(f)}
                      label={f.name}
                      ratio={f.ratio}
                    >
                      <img
                        src={f.imageUrl}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </FrameChoice>
                    <button
                      type="button"
                      onClick={() => removeCommunityFrame(f)}
                      aria-label={`Hapus ${f.name} dari koleksi komunitas`}
                      title="Hapus dari koleksi komunitas"
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-950 p-1 text-ink-600 opacity-0 transition hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                    >
                      <XIcon size={11} />
                    </button>
                  </div>
                ))}
                <div className="w-24 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFrameError("");
                      setAddOpen(true);
                    }}
                    aria-label="Tambah frame"
                    className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 p-1.5 text-ink-600 transition hover:border-brand hover:text-brand"
                  >
                    <PlusIcon size={18} />
                    <span className="text-[10px] font-medium">Tambah</span>
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => scrollFrameReel(1)}
                aria-label="Geser frame ke kanan"
                className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-ink-950/90 p-1.5 text-ink-600 transition hover:border-brand hover:text-cream"
              >
                <ArrowRightIcon size={14} />
              </button>
            </div>
            <input
              ref={frameInputRef}
              type="file"
              accept="image/png"
              aria-label="Upload frame PNG"
              className="hidden"
              onChange={handleFrameUpload}
            />

            <div className="mt-3 space-y-2">
              {customFrame && (
                <div className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/5 p-2">
                  <div className="flex items-center gap-2">
                    <img
                      src={state.frameSrc!}
                      alt="frame custom"
                      className="h-8 w-12 rounded-sm bg-ink-800 object-contain"
                    />
                    <div>
                      <p className="text-xs font-medium">Frame custom</p>
                      <p className="text-[11px] text-ink-600">
                        {state.frameRatio}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseFrame(null)}
                    aria-label="Hapus frame custom"
                    className="rounded-sm p-1 text-ink-600 hover:text-red-400"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold">
                Buat frame sendiri · {state.grid} foto
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => downloadTemplateGuide(state)}
                  className="rounded-lg bg-white/10 px-2 py-2 text-xs hover:bg-white/20"
                >
                  Unduh panduan SVG
                </button>
                <button
                  type="button"
                  disabled={templateBusy}
                  onClick={async () => {
                    setTemplateBusy(true);
                    try {
                      await downloadTemplatePNG(state);
                    } catch {
                      show("Gagal membuat template PNG", "error");
                    } finally {
                      setTemplateBusy(false);
                    }
                  }}
                  className="rounded-lg bg-white/10 px-2 py-2 text-xs hover:bg-white/20 disabled:opacity-40"
                >
                  {templateBusy ? "Menyiapkan…" : "Unduh template PNG"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-ink-600">
                Panduan berisi koordinat, ukuran jendela foto, dan area aman.
                Edit PNG tanpa mengubah ukuran atau jendela transparan — saat
                upload, jendela transparan diukur otomatis dan foto menyesuaikan
                posisinya. Ukuran jendela mengikuti frame dasar yang sedang
                dipilih — pilih dulu frame dasarnya (mis. Polaroid) bila ingin
                margin seperti itu.
              </p>
            </div>
          </Panel>

          <Panel step={3} title="Foto">
            <div className="mb-3 flex gap-1.5">
              {slots.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSlot(i)}
                  aria-label={`Pilih foto ${i + 1}`}
                  className={`h-1.5 flex-1 rounded-full transition ${
                    s.src ? "bg-emerald-400" : "bg-white/10"
                  } ${activeSlot === i ? "ring-2 ring-brand ring-offset-2 ring-offset-ink-900" : ""}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openSession}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-bright"
              >
                <CameraIcon size={16} /> Buka kamera
              </button>
              <button
                type="button"
                onClick={() => pickFile(firstEmptyOrActive())}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-sm font-medium hover:bg-white/20"
              >
                <UploadIcon size={16} /> Upload
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink-600">
              {filled < state.grid
                ? `Satu Mulai untuk ${state.grid - filled} foto kosong. Foto yang sudah ada tetap disimpan.`
                : "Kamera memulai sesi baru; foto lama baru diganti setelah Pakai semua. Upload mengganti foto yang dipilih."}
            </p>
          </Panel>

          <Panel step={4} title="Simpan">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={busy !== null || filled === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-40"
              >
                <DownloadIcon size={16} />{" "}
                {busy === "download" ? "Menyiapkan…" : "PNG"}
              </button>
              <button
                type="button"
                onClick={openShare}
                disabled={filled === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShareIcon size={16} /> Bagikan
              </button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-600">
              <ImageIcon size={13} className="mt-0.5 shrink-0" />
              Hasil {layout.w}×{layout.h}px.{" "}
              {draftSaved === true
                ? "Draft tersimpan di browser ini."
                : draftSaved === false
                  ? "Draft tidak tersimpan: penyimpanan browser penuh atau tidak tersedia. Unduh hasil agar aman."
                  : "Menyimpan draft…"}
            </p>
          </Panel>
        </aside>
      </div>

      <Toast toast={toast} />

      {captureTargets !== null && (
        <CameraModal
          state={state}
          targets={captureTargets}
          onClose={() => setCaptureTargets(null)}
          onConfirm={(photos, capturedIndices) => {
            capturedIndices.forEach((index) => photoRequests.current[index]++);
            setState((s) => ({
              ...s,
              slots: mergeCapturedSlots(s.slots, photos, capturedIndices),
            }));
            setActiveSlot(captureTargets[0]);
            setCaptureTargets(null);
            show("Foto sesi diterapkan", "success");
          }}
        />
      )}

      {shareOpen && (
        <ShareModal
          link={shareLink}
          loading={shareLoading}
          canShareImage={canShareFiles}
          onShareImage={handleShareImage}
          onDownload={handleDownload}
          onDownloadGif={handleDownloadGif}
          onShareGif={handleShareGif}
          gifBusy={busy === "gif"}
          gifEnabled={filled > 0}
          onClose={closeShare}
          onCopied={(ok) =>
            show(
              ok ? "Link tersalin" : "Gagal menyalin, salin manual",
              ok ? "success" : "error",
            )
          }
          onDeleted={(ok) => {
            show(
              ok ? "Link dihapus dari server" : "Gagal menghapus link",
              ok ? "success" : "error",
            );
            if (ok) setShareLink(null);
          }}
        />
      )}
      <AddFrameModal
        open={addOpen}
        code={frameCode}
        onCodeChange={updateFrameCode}
        unlocked={frameUnlocked}
        error={frameError}
        busy={false}
        requiresCode={communityEnabled()}
        templateSize={{ w: layout.w, h: layout.h }}
        onUnlock={() => {
          if (frameCode.trim()) {
            setFrameError("");
            setFrameUnlocked(true);
          }
        }}
        onBackToCode={() => {
          setFrameUnlocked(false);
          setFrameError("");
        }}
        onClose={() => {
          setAddOpen(false);
          setFrameError("");
        }}
        onPickFile={() => frameInputRef.current?.click()}
      />
    </main>
  );
}

function Panel({
  step,
  title,
  open = false,
  children,
}: {
  step: number;
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      className="group rounded-xl border border-white/10 bg-ink-900/60 transition-colors open:border-brand/30"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 text-sm font-semibold text-cream transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[11px] text-ink-600">
            {step}
          </span>
          {title}
        </span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-ink-600 transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-white/10 px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

function FrameChoice({
  selected,
  onClick,
  label,
  ratio,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  ratio: FrameRatio;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition ${
        selected
          ? "border-brand bg-brand/10"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      <div
        className="preview-checker w-full overflow-hidden rounded-sm bg-ink-800"
        style={{
          aspectRatio: ratio.replace(":", " / "),
          height: 56,
          width: "auto",
          maxWidth: "100%",
        }}
      >
        {children}
      </div>
      <span
        className={`text-[10px] font-medium ${selected ? "text-brand" : "text-ink-600"}`}
      >
        {label}
      </span>
    </button>
  );
}
