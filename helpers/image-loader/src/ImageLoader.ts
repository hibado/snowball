import imagemin from 'imagemin';
import png from 'imagemin-pngquant';
import svg from 'imagemin-svgo';
import { getOptions, interpolateName, parseQuery } from 'loader-utils';
import * as path from 'path';
import validate from 'schema-utils';
import sharp from 'sharp';
import { compilation, loader, Logger } from 'webpack';

import schema from './options.schema';
import { formatRatio, readIfDirExists, writeFileUnder } from './utils';

interface Options {
  ratios?: number[];
  name?: string | ((path: string, query?: string) => string);
  type?: 'src' | 'srcset';
  esModule?: boolean;
  quality?: number;
  qualityMin?: number;
  progressive?: boolean;
  output?: string;
  input?: string;
  errorInputNotFound?: boolean;
  context?: string;
}

type ImageInfo = { filename: string; content: Buffer; width: number };

export class ImageLoader {
  static async load(
    loaderContext: loader.LoaderContext,
    source: Buffer,
  ): Promise<string> {
    try {
      const loader = new ImageLoader(loaderContext);
      const files = await loader.resize(source);
      loader.emitFiles(files);
      return loader.getCode(files);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  private readonly options: Options;
  private readonly logger: Logger;

  constructor(private readonly loader: loader.LoaderContext) {
    const globalOptions = (getOptions(loader) as Options) || {};
    const options = Object.assign(
      {},
      globalOptions,
      loader.resourceQuery && parseQuery(loader.resourceQuery),
    );

    validate(schema, options, {
      name: ImageLoader.name,
      baseDataPath: 'options',
    });

    this.options = options;

    this.logger = (loader._compilation as compilation.Compilation).getLogger(
      ImageLoader.name,
    );
  }

  private async resize(source: Buffer): Promise<ImageInfo[]> {
    const {
      name = '[path][name]_[width]@[ratio]-[md5:contenthash:hex:6].[ext]',
      ratios = [1],
      quality = 100,
      qualityMin = quality,
      progressive = false,
      context = this.loader.rootContext,
      errorInputNotFound = false,
      output,
      input,
    } = this.options;

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
    if (!format || (format !== 'svg' && !oriWidth)) {
      throw new Error('Unsupported image');
    }

    if (format === 'svg') {
      const content = await imagemin.buffer(source, {
        plugins: [svg()],
      });
      const width = oriWidth || 1;
      return [
        {
          content,
          width,
          filename: interpolateName(this.loader, name as any, {
            content,
            context,
          })
            .replace('[width]', width.toString())
            .replace('[ratio]', formatRatio(1)),
        },
      ];
    }

    let plugin: any;
    if (format === 'jpeg') {
      img.jpeg({ quality, progressive });
    } else if (format === 'png' && quality < 100) {
      plugin = png({ quality: [qualityMin / 100, quality / 100], strip: true });
    }

    const filename = interpolateName(
      this.loader,
      `[path][name].[ext]/[sha1:contenthash:hex:24]/${qualityMin}-${quality}.[ext]`,
      { content: source, context },
    );
    const parsed = path.parse(filename);
    const inputDir = input && path.resolve(input, parsed.dir, parsed.name);
    const outputDir = output && path.resolve(output, parsed.dir, parsed.name);

    const resizeAndCompress = async (ratio: number) => {
      const width = Math.ceil((oriWidth as number) * ratio);
      const ratioStr = formatRatio(ratio);

      const tempName = `${ratioStr}${parsed.ext}`;
      let content = await readIfDirExists(tempName, inputDir);

      if (!content) {
        if (errorInputNotFound) {
          throw new Error(
            `${tempName} not found under input directory: ${inputDir}`,
          );
        }

        const resized = await img.clone().resize({ width }).toBuffer();
        const compressed = !plugin
          ? resized
          : await imagemin.buffer(resized, { plugins: [plugin] });

        if (outputDir && (!content || outputDir !== inputDir)) {
          await writeFileUnder(outputDir, tempName, compressed);
        }
        content = compressed;
      } else {
        this.logger.log(
          `Load the preprocessed image: ${path.resolve(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            inputDir!,
            tempName,
          )}`,
        );
      }

      // interpolateName 的类型声明有误，name 应当可以是 function 的
      const filename = interpolateName(this.loader, name as any, {
        content,
        context,
      });
      return {
        filename: filename
          .replace('[width]', width.toString())
          .replace('[ratio]', formatRatio(ratio)),
        width,
        content,
      };
    };

    return Promise.all(
      ratios.filter((ratio) => ratio > 0 && ratio <= 1).map(resizeAndCompress),
    );
  }

  private emitFiles(files: ImageInfo[]) {
    files.forEach(({ filename, content }) => {
      this.loader.emitFile(filename, content, undefined);
      this.logger.status(`file emitted: ${filename}`);
    });
  }

  private getCode(files: ImageInfo[]) {
    return (
      (this.options.esModule ? 'export default ' : 'module.exports = ') +
      files
        .map(({ filename, width }) => {
          let code = `__webpack_public_path__ + ${JSON.stringify(filename)}`;
          if (this.options.type === 'srcset') {
            code += ` + ' ${width}w'`;
          }
          return code;
        })
        .join(' + ", " + ')
    );
  }
}
