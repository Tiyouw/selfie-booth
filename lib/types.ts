export type GridCount = 1 | 2 | 3 | 4;

export type FrameRatio = '16:9' | '9:16' | '1:3';

export interface PhotoSlot {
  id: string;
  /** dataURL of the photo (jpeg/png) or null if empty */
  src: string | null;
  /** zoom scale (1 = fit cover) */
  zoom: number;
  /** offset within the slot as a fraction of the overflow, -1..1 */
  ox: number;
  oy: number;
}

export interface BoothState {
  grid: GridCount;
  /**
   * Frame overlay: either a built-in frame path (`/frames/...`) or an
   * uploaded PNG dataURL. null = no frame.
   */
  frameSrc: string | null;
  frameRatio: FrameRatio;
  /** Missing in legacy payloads, whose portrait-three layout must not change. */
  layoutVersion?: 1 | 2;
  /** Native-pixel geometry captured when importing a custom PNG template. */
  frameInset?: Inset;
  frameGrid?: GridCount;
  slots: PhotoSlot[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
