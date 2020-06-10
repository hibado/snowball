import { loader } from 'webpack';

import { ImageLoader } from './ImageLoader';

export const raw = true;
export default function(this: loader.LoaderContext, source: Buffer) {
  if (this.cacheable) {
    this.cacheable(true);
  }

  const callback = this.async() as Function;
  if (!callback) {
    throw new Error('async() failed');
  }
  ImageLoader.load(this, source)
    .then((code) => callback(undefined, code))
    .catch((e) => callback(e));
}
