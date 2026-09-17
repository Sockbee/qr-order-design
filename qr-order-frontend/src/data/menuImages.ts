import soju from '../assets/menu/soju.png'
import beer from '../assets/menu/beer.png'

/** Bundled defaults for menus without an image configured in the catalog. */
export const menuImages: Partial<Record<string, string>> = { soju, beer }

export function menuImageClassName(imageUrl: string): string {
  return imageUrl === soju || imageUrl === beer
    ? 'block w-full h-full object-contain bg-white p-2'
    : 'block w-full h-full object-contain p-2'
}
