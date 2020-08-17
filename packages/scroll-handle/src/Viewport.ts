import { Placement, ResolvedPlacement } from './placement';
import { Rect } from './rect';

export interface Viewport {
  start: Placement;
  end: Placement;
}
export interface ResolvedViewport {
  start: ResolvedPlacement;
  end: ResolvedPlacement;
}
export interface CalculatedViewport {
  start: number;
  end: number;
}

interface HandlerParams<T extends Element, TRoot extends Element | Window>
  extends CalculatedViewport {
  target: T;
  targetRect: Rect;
  root: TRoot;
  rootRect: Rect;
}
type Handler<ROOT extends Window | HTMLElement, TARGET extends Element> = (
  params: HandlerParams<TARGET, ROOT>,
) => void;

export interface Options<
  ROOT extends Window | HTMLElement,
  TARGET extends Element
> {
  forceBoundary?: boolean;
  onBefore?: Handler<ROOT, TARGET>;
  onDuring?: Handler<ROOT, TARGET>;
  onAfter?: Handler<ROOT, TARGET>;
  // onStateChange?:
}

export interface ViewportOptions<
  ROOT extends Window | HTMLElement,
  TARGET extends Element
> extends Viewport, Options<ROOT, TARGET> {}

export interface ResolvedViewportOptions<
  ROOT extends Window | HTMLElement,
  TARGET extends Element
> extends ResolvedViewport, Options<ROOT, TARGET> {}

export interface CalculatedViewportOptions<
  ROOT extends Window | HTMLElement,
  TARGET extends Element
> extends CalculatedViewport, Options<ROOT, TARGET> {}
