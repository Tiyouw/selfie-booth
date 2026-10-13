import assert from 'node:assert/strict';
import test from 'node:test';
import { PHOTO_MAX_DIM, PHOTO_QUALITY } from '../../lib/image';
import { cameraCaptureSize, captureCameraPhoto } from './capture';

test('capture dimensions preserve the raw camera ratio without upscaling', () => {
  assert.deepEqual(cameraCaptureSize(1920, 1080), { w: PHOTO_MAX_DIM, h: Math.round(PHOTO_MAX_DIM * 9 / 16) });
  assert.deepEqual(cameraCaptureSize(1080, 1920), { w: Math.round(PHOTO_MAX_DIM * 9 / 16), h: PHOTO_MAX_DIM });
  assert.deepEqual(cameraCaptureSize(640, 480), { w: 640, h: 480 });
  for (const dimensions of [[0, 720], [1280, 0], [-1, 2], [Infinity, 720], [NaN, 720]]) {
    assert.throws(() => cameraCaptureSize(dimensions[0], dimensions[1]));
  }
});

test('capture draws only the raw video, applying mirror to the photo before JPEG encoding', (t) => {
  const operations: unknown[][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: (type: string) => {
      assert.equal(type, '2d');
      return {
        translate: (...args: number[]) => operations.push(['translate', ...args]),
        scale: (...args: number[]) => operations.push(['scale', ...args]),
        drawImage: (...args: unknown[]) => operations.push(['drawImage', ...args]),
      };
    },
    toDataURL: (type: string, quality: number) => {
      operations.push(['encode', type, quality]);
      return 'data:image/jpeg;base64,raw-camera-photo';
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: (tag: string) => { assert.equal(tag, 'canvas'); return canvas; },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const video = { readyState: 2, videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;
  const { w, h } = cameraCaptureSize(video.videoWidth, video.videoHeight);
  assert.equal(captureCameraPhoto(video, true), 'data:image/jpeg;base64,raw-camera-photo');
  assert.equal(canvas.width, w);
  assert.equal(canvas.height, h);
  assert.deepEqual(operations, [
    ['translate', w, 0], ['scale', -1, 1], ['drawImage', video, 0, 0, w, h], ['encode', 'image/jpeg', PHOTO_QUALITY],
  ]);

  operations.length = 0;
  captureCameraPhoto(video, false);
  assert.deepEqual(operations, [['drawImage', video, 0, 0, w, h], ['encode', 'image/jpeg', PHOTO_QUALITY]]);
  canvas.toDataURL = () => 'data:,';
  assert.throws(() => captureCameraPhoto(video, false), /menyimpan foto/);
});

test('capture rejects videos without decoded frames before creating a canvas', () => {
  for (const video of [{ readyState: 1, videoWidth: 1280, videoHeight: 720 }, { readyState: 4, videoWidth: 0, videoHeight: 0 }]) {
    assert.throws(() => captureCameraPhoto(video as HTMLVideoElement, false), /mengirim gambar/);
  }
});
