/* The Liquid dialect the templates were written in (Jekyll's), on liquidjs: shared by the
   Eleventy build and by the bundler, which renders the js/*.liquid data scripts itself. */
import { Liquid } from 'liquidjs';

export const liquidOptions = { jekyllInclude: true, dynamicPartials: false };

export const filters = {
  // Jekyll's own filter: any value as JSON.
  jsonify: value => JSON.stringify(value === undefined ? null : value),
  // Ruby Liquid divides two whole numbers as whole numbers (7 / 6 is 1); liquidjs would give 1.1666….
  divided_by: (a, b) => {
    const x = Number(a), y = Number(b);
    return Number.isInteger(x) && Number.isInteger(y) ? Math.floor(x / y) : x / y;
  }
};

export function createLiquid(root) {
  const engine = new Liquid({ ...liquidOptions, root: [root + '/_includes'], extname: '' });
  for (const [name, fn] of Object.entries(filters)) engine.registerFilter(name, fn);
  return engine;
}
