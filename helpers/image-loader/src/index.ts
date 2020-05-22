import imagemin from 'imagemin';
import jpeg from 'imagemin-mozjpeg';
import png from 'imagemin-pngquant';
import { getOptions, interpolateName, parseQuery } from 'loader-utils';
import validate from 'schema-utils';
import sharp from 'sharp';
import { compilation, loader, Logger } from 'webpack';

import schema from './options.schema';

interface Options {
  ratios?: number[];
  name?: string;
  type?: 'src' | 'srcset';
  esModule?: boolean;
  quality?: number;
  progressive?: boolean;
}

const LOADER_NAME = 'ImageLoader';

async function resize(
  source: Buffer | string,
  ratios = [1],
  logger: typeof console | Logger = console,
) {
  const img = sharp(source);
  const meta = await img.metadata();
  const oriWidth = meta.width;
  const format = meta.format as
    | 'jpeg'
    | 'png'
    | 'webp'
    | 'gif'
    | 'svg'
    | undefined;
  if (!oriWidth || !format) {
    throw new Error('Unsupported image');
  }
  logger.log({
    source: typeof source === 'string' ? source : 'Buffer',
    format,
    width: oriWidth,
    ratios,
  });
  if (format === 'jpeg') {
    img.jpeg({ quality: 100 });
  }

  return {
    format,
    images: ratios
      .filter((ratio) => ratio > 0 && ratio <= 1)
      .map(async (ratio) => {
        const width = Math.round(oriWidth * ratio);
        const content = await img.resize({ width }).toBuffer();
        return { content, format, width, ratio };
      }),
  };
}

function emitFiles(
  loader: loader.LoaderContext,
  files: Array<{ filename: string; content: Buffer }>,
) {
  files.forEach(({ filename, content }) => {
    loader.emitFile(filename, content, undefined);
  });
}

export const raw = true;
export default async function(
  this: loader.LoaderContext,
  source?: Buffer,
  result?: string,
  ...files: Array<{ filename: string; content: Buffer }>
) {
  /**
   * 通过重复 loader 使得 cache-loader 可以缓存 emitFile 的文件
   */
  if (!source) {
    emitFiles(this, files);
    return result;
  }

  if (this.cacheable) {
    this.cacheable(true);
  }

  const callback = this.async() as Function;
  if (!callback) {
    throw new Error('async() failed');
  }

  const logger = (this._compilation as compilation.Compilation).getLogger(
    LOADER_NAME,
  );

  const options = (getOptions(this) as Options) || {};
  const {
    ratios = options.ratios,
    name = options.name,
    type = options.type,
    esModule = options.esModule,
    quality = options.quality || 100,
    progressive = options.progressive || true,
  } = (this.resourceQuery && parseQuery(this.resourceQuery)) || {};

  validate(
    schema,
    {
      ratios,
      name,
      type,
      esModule,
    },
    {
      name: LOADER_NAME,
      baseDataPath: 'options',
    },
  );

  try {
    const { format, images } = await resize(source, ratios, logger);
    const plugins =
      quality < 100 && ['png', 'jpeg'].includes(format)
        ? format === 'png'
          ? [png({ quality: [0.5, quality / 100], strip: true })]
          : [jpeg({ quality, progressive })]
        : undefined;
    const files = await Promise.all(
      images.map(async (p) => {
        const { content, width, ratio } = await p;
        const filename = interpolateName(
          this,
          name
            .replace('[width]', width)
            .replace('[ratio]', ratio.toString().replace('0.', 'd')),
          {
            content,
            context: this.rootContext,
          },
        );
        const resBuffer = !plugins
          ? content
          : await imagemin.buffer(content, { plugins });
        return { filename, width, content: resBuffer };
      }),
    );
    const res =
      (esModule ? 'export default ' : 'module.exports = ') +
      files
        .map(({ filename, width }) => {
          let code = `__webpack_public_path__ + ${JSON.stringify(filename)}`;
          if (type === 'srcset') {
            code += ` + ' ${width}w'`;
          }
          return code;
        })
        .join(' + ", " + ');

    if (this.loaderIndex === 0) {
      /** 没有使用缓存，直接 emitFile */
      emitFiles(this, files);
      return callback(undefined, res);
    }

    callback(undefined, undefined, res, ...(files as any));
  } catch (e) {
    logger.error(e);
    callback(e);
  }
}
