import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

/**
 * PostCSS plugin providing iPad 2 (iOS 9 Safari) fallbacks:
 * 1) Space-separated rgb(r g b / a) -> rgba(r, g, b, a)
 * 2) inset -> top/right/bottom/left
 * 3) dvh/svh/lvh -> vh fallback right before modern unit
 * 4) backdrop-filter -> -webkit-backdrop-filter prefix
 */
const legacyCssCompatPlugin = () => ({
  postcssPlugin: 'legacy-css-compat',
  Declaration(decl) {
    if (decl.value && decl.value.includes('rgb(')) {
      let nextVal = decl.value.replace(
        /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*(var\([^)]*\)|[^)]+)\s*\)/g,
        'rgba($1, $2, $3, $4)'
      );
      nextVal = nextVal.replace(
        /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)/g,
        'rgb($1, $2, $3)'
      );
      if (nextVal !== decl.value) {
        decl.value = nextVal;
      }
    }

    if (decl.value && /\b(\d*\.?\d+)(dvh|svh|lvh)\b/.test(decl.value) && !decl.__vhFallback) {
      const fallbackVal = decl.value.replace(/\b(\d*\.?\d+)(dvh|svh|lvh)\b/g, '$1vh');
      const cloned = decl.cloneBefore({ value: fallbackVal });
      cloned.__vhFallback = true;
      decl.__vhFallback = true;
    }

    if (decl.prop === 'backdrop-filter' && decl.parent && !decl.parent.__webkitBackdropAdded) {
      decl.cloneBefore({ prop: '-webkit-backdrop-filter', value: decl.value });
      decl.parent.__webkitBackdropAdded = true;
    }

    if (decl.prop === 'inset' && decl.parent && !decl.parent.__insetExpanded) {
      const parts = decl.value.trim().split(/\s+/);
      const t = parts[0];
      const r = parts[1] ?? t;
      const b = parts[2] ?? t;
      const l = parts[3] ?? r;
      decl.cloneBefore({ prop: 'top', value: t });
      decl.cloneBefore({ prop: 'right', value: r });
      decl.cloneBefore({ prop: 'bottom', value: b });
      decl.cloneBefore({ prop: 'left', value: l });
      decl.parent.__insetExpanded = true;
    }
  },
});
legacyCssCompatPlugin.postcss = true;

export default {
  plugins: [
    tailwindcss(),
    autoprefixer(),
    legacyCssCompatPlugin(),
  ],
};
