export { start, Game, type StartOptions, type GameEvent } from './game.ts'
export { Simulation, type SimulationOptions, type InstanceView } from './simulation.ts'
export { Input, ManualInput, BrowserInput, keyIndex } from './input.ts'
export {
  BrowserAssetLoader,
  StaticAssetLoader,
  collectImageSources,
  loadImages,
  type AssetLoader,
  type LoadedImage,
} from './assets.ts'
export { NullRenderer, RecordingRenderer, type Renderer, type DrawCall, type TextAlign } from './render/renderer.ts'
export { Canvas2DRenderer, computeScale, type CanvasScale } from './render/canvas2d.ts'
export { drawWorld } from './render/draw-world.ts'
export { FixedLoop, browserScheduler, type FrameScheduler, type LoopHooks } from './loop.ts'
export { Catalog, ProgramShapeError, type ThingType, type ResolvedLook } from './catalog.ts'
export { World } from './world.ts'
export { SpatialHash } from './spatial-hash.ts'
export { formatNumber } from './text.ts'
export * as config from './config.ts'
