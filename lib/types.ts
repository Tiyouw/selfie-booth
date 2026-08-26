export type GridCount = 1 | 2 | 3;

export type FrameRatio = '16:9' | '9:16';

export interface PhotoSlot {
  id: string;
  /** dataURL of the photo (jpeg/png) or null if empty */
  src: string | null;
  /** zoom scale (1 = fit cover) */
  zoom: number;
  /** offset within the slot, normalized -1..1 */
  ox: number;
  oy: number;
}

export interface BoothState {
  grid: GridCount;
  /** frame overlay as dataURL (PNG with transparency) or null */
  frameSrc: string | null;
  frameRatio: FrameRatio;
  slots: PhotoSlot[];
}
