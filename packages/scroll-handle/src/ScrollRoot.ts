import { windowSize, getWindowRect } from './windowSize';
import { Rect, rectFrom } from './rect';
import { ScrollTarget } from './ScrollElement';
import { ViewportOptions } from './Viewport';

type Root = Window | HTMLElement;
type RootLike = Root | Document;

const ATTR_ID = 'data-scroll-r-id';

function windowEquivalent(container: RootLike): container is Window | Document {
  return (
    container instanceof Window ||
    container instanceof Document ||
    container === window.document.documentElement ||
    container === window.document.body
  );
}

function notWindowEquivalent(container: RootLike): container is HTMLElement {
  return !windowEquivalent(container);
}

export class ScrollRoot<ROOT extends Root> {
  private static rootCnt = 0;
  private static readonly roots: Record<
    string,
    ScrollRoot<Window> | ScrollRoot<HTMLElement>
  > = Object.create(null);

  static getOrAdd(element: Window | Document): ScrollRoot<Window>;
  static getOrAdd(element: HTMLElement): ScrollRoot<HTMLElement>;
  static getOrAdd(
    element: RootLike,
  ): ScrollRoot<Window> | ScrollRoot<HTMLElement> {
    let root: ScrollRoot<Window> | ScrollRoot<HTMLElement> | undefined;
    if (notWindowEquivalent(element)) {
      const id = element.getAttribute(ATTR_ID);
      root = (id && this.roots[id]) || new ScrollRoot<HTMLElement>(element);
    } else {
      root = this.roots.window || new ScrollRoot<Window>(element);
    }
    if (!this.roots[root.id]) {
      this.roots[root.id] = root;
    }
    return root;
  }

  private readonly id: string;
  private readonly element: Root;
  private readonly elements: Array<ScrollTarget<any>> = [];
  private seq = 0;

  private _rect?: Rect;
  private removeSizeListener?: () => void;

  private scrollHandler = () => this.onScroll();

  private constructor(_element: RootLike) {
    if (notWindowEquivalent(_element)) {
      this.element = _element;
      this.id = (ScrollRoot.rootCnt += 1).toString();
    } else {
      this.element = window;
      this.id = 'window';
    }
    this.element.addEventListener('scroll', this.scrollHandler, {
      passive: true,
      capture: false,
    });
  }

  get rect(): Rect {
    if (this._rect) {
      return this._rect;
    }
    this._rect = this.queryRect();
    /**
     * 实际上当 root 不是 window 时，应该使用 ResizeObserver。
     * 但 ResizeObserver 兼容性不佳，
     * 以及目前实际情况下直接监听 window 的 resize 事件勉强能接受，
     * 故此处依然监听 window 的 resize 事件。
     */
    windowSize.addSizeListener(() => {
      this._rect = this.queryRect();
    });
    return this._rect;
  }

  addElement<TARGET extends Element>(
    element: TARGET,
    options: ViewportOptions<ROOT, TARGET>,
  ): ScrollTarget<TARGET> {
    const scrollElement = ScrollTarget.getOrAdd(element);
    scrollElement.addViewport(options);
    this.elements.push(scrollElement);
    return scrollElement;
  }

  onScroll(): void {
    const { rect } = this;
    const seq = (this.seq += 1);
    this.elements.forEach((element) => {
      element.onScroll({ rootRect: rect, seq });
    });
  }

  destroy(): void {
    this.element.removeEventListener('scroll', this.scrollHandler);
    if (this.removeSizeListener) {
      this.removeSizeListener();
    }
  }

  private queryRect() {
    return this.element instanceof Window
      ? rectFrom(getWindowRect())
      : this.element.getBoundingClientRect();
  }
}
