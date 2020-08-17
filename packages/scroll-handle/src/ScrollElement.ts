import {
  ViewportOptions,
  ResolvedViewportOptions,
  CalculatedViewportOptions,
} from './Viewport';
import { Rect } from './rect';
import { resolvePlacement, ResolvedPlacement } from './placement';

const ATTR_ID = 'data-scroll-t-id';

export class ScrollTarget<T extends Element> {
  private static elementCnt = 0;
  private static readonly elements: Record<string, ScrollTarget<Element>> = {};

  static getOrAdd<T extends Element>(_element: T): ScrollTarget<T> {
    const id = _element.getAttribute(ATTR_ID);
    const element = (id && this.elements[id]) || new ScrollTarget(_element);
    if (!this.elements[element.id]) {
      this.elements[element.id] = element;
    }
    return element;
  }

  private readonly id: string;

  private lastSeq = 0;
  private viewportOptions: Array<ResolvedViewportOptions<any, T>> = [];

  constructor(private readonly element: Element) {
    this.id = (ScrollTarget.elementCnt += 1).toString();
    element.setAttribute(ATTR_ID, this.id);
  }

  get rect(): Rect {
    return this.element.getBoundingClientRect();
  }

  addViewport({ start, end, ...options }: ViewportOptions<any, T>): void {
    this.viewportOptions.push({
      ...options,
      start: resolvePlacement(start),
      end: resolvePlacement(end),
    });
  }

  /**
   * 在一个回调函数中迭代调用其他回调，
   * 实际上能否有优化效果是未知的...
   *
   * TODO: 或许可以通过一些信息省略一部分回调操作
   * 现在的 before 或 after 应该会影响到优化的可能性
   * @param param0
   */
  onScroll({ rootRect, seq }: { rootRect: Rect; seq: number }): void {
    if (this.lastSeq !== seq) {
      this.lastSeq = seq;
      const targetRect = this.rect;
      const calcPlacement = (placement: ResolvedPlacement) => {
        return this.calcPlacement({ rootRect, targetRect }, placement);
      };
      window.requestAnimationFrame(() => {
        this.viewportOptions.forEach(({ start, end, ...options }) => {
          this.handleScrollViewport({
            ...options,
            start: calcPlacement(start),
            end: calcPlacement(end),
          });
        });
      });
    }
  }

  private handleScrollViewport(view: CalculatedViewportOptions<any, T>) {}

  private calcPlacement(
    { rootRect, targetRect }: { rootRect: Rect; targetRect: Rect },
    { percent, distance, targetPercent }: ResolvedPlacement,
  ) {
    return (
      rootRect.height * percent + distance + targetRect.height * targetPercent
    );
  }
}
