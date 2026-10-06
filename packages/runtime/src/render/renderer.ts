// Renderer interface. All coordinates are internal (game) pixels in screen
// space; the renderer owns scaling to the real canvas. A WebGL renderer can
// implement this same interface later.

import type { LoadedImage } from '../assets.ts'

export type TextAlign = 'left' | 'center'

export interface Renderer {
  begin(background: string): void
  box(x: number, y: number, w: number, h: number, color: string): void
  /** Ellipse inscribed in the box. */
  ellipse(x: number, y: number, w: number, h: number, color: string): void
  image(image: LoadedImage, x: number, y: number, w: number, h: number): void
  /** `y` is the top of the text for left align, the middle for center align. */
  text(text: string, x: number, y: number, color: string, align: TextAlign): void
  end(): void
}

export class NullRenderer implements Renderer {
  begin(): void {}
  box(): void {}
  ellipse(): void {}
  image(): void {}
  text(): void {}
  end(): void {}
}

export type DrawCall =
  | { op: 'begin'; background: string }
  | { op: 'box'; x: number; y: number; w: number; h: number; color: string }
  | { op: 'ellipse'; x: number; y: number; w: number; h: number; color: string }
  | { op: 'image'; src: string; x: number; y: number; w: number; h: number }
  | { op: 'text'; text: string; x: number; y: number; color: string; align: TextAlign }
  | { op: 'end' }

/** Records draw calls. For tests and debugging tools. */
export class RecordingRenderer implements Renderer {
  calls: DrawCall[] = []

  begin(background: string): void {
    this.calls = [{ op: 'begin', background }]
  }
  box(x: number, y: number, w: number, h: number, color: string): void {
    this.calls.push({ op: 'box', x, y, w, h, color })
  }
  ellipse(x: number, y: number, w: number, h: number, color: string): void {
    this.calls.push({ op: 'ellipse', x, y, w, h, color })
  }
  image(image: LoadedImage, x: number, y: number, w: number, h: number): void {
    this.calls.push({ op: 'image', src: image.src, x, y, w, h })
  }
  text(text: string, x: number, y: number, color: string, align: TextAlign): void {
    this.calls.push({ op: 'text', text, x, y, color, align })
  }
  end(): void {
    this.calls.push({ op: 'end' })
  }
}
