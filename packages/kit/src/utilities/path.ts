import { join, dirname } from 'node:path';
import { lstatSync, existsSync, readdirSync } from 'node:fs';

import { autocomplete } from '../prompts/autocomplete.js';

import type { CommonOptions } from './common.js';

export interface PathOptions extends CommonOptions {
  root?: string;
  directory?: boolean;
  initialValue?: string;
  message: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}

export const path = (opts: PathOptions) => {
  const validate = opts.validate;

  return autocomplete({
    ...opts,
    initialUserInput: opts.initialValue ?? opts.root ?? process.cwd(),
    maxItems: 5,
    validate(value: any) {
      if (Array.isArray(value)) {
        // Shouldn't ever happen since we don't enable `multiple: true`
        return undefined;
      }
      if (!value) {
        return 'Please select a path';
      }
      if (validate) {
        return validate(value);
      }
      return undefined;
    },
    options() {
      const userInput = this.userInput;
      if (userInput === '') {
        return [];
      }

      try {
        let searchPath: string;

        if (!existsSync(userInput)) {
          searchPath = dirname(userInput);
        } else {
          const stat = lstatSync(userInput);
          if (stat.isDirectory() && (!opts.directory || userInput.endsWith('/'))) {
            searchPath = userInput;
          } else {
            searchPath = dirname(userInput);
          }
        }

        // Strip trailing slash so startsWith matches the directory itself among its siblings
        const prefix =
          userInput.length > 1 && userInput.endsWith('/') ? userInput.slice(0, -1) : userInput;

        const items = readdirSync(searchPath)
          .map((item) => {
            const itemPath = join(searchPath, item);
            const stats = lstatSync(itemPath);
            return {
              name: item,
              path: itemPath,
              isDirectory: stats.isDirectory(),
            };
          })
          .filter(
            ({ path: itemPath, isDirectory }) =>
              itemPath.startsWith(prefix) && (isDirectory || !opts.directory)
          );

        return items.map((item) => ({
          value: item.path,
        }));
      } catch (_e) {
        return [];
      }
    },
  });
};
