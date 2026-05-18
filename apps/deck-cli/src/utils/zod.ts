import * as z from 'zod/mini';

/**
 * @see https://zod.dev/packages/mini?id=no-default-locale#no-default-locale
 */
export function setZodLocale() {
  z.config(z.locales.en());
}
