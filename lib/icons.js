/* ===================================================
   Rastin — Lucide Icon Set
   Lightweight inline icons (no external dependency)
   =================================================== */

/**
 * Each icon is an array of path `d` strings.
 * Shared attributes: viewBox="0 0 24 24" fill="none"
 *   stroke="currentColor" stroke-width="2"
 *   stroke-linecap="round" stroke-linejoin="round"
 */
const ICONS = {
  globe: ['M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  'arrow-left-right': ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
  zap: [
    'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  ],
  'rotate-ccw': ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  'loader-circle': ['M21 12a9 9 0 1 1-6.219-8.56'],
  languages: ['m5 8 6 6', 'm4 14 6-6 2-3', 'M2 5h12', 'M7 2h1', 'm22 22-5-10-5 10', 'M14 18h6'],
  check: ['M20 6 9 17l-5-5'],
  'text-select': ['M3 3h18', 'M3 9h18', 'M3 15h18', 'M3 21h18'],
};

/**
 * Generate an SVG icon element.
 * @param {string} name — key in ICONS
 * @param {number} [size=20]
 * @param {string} [className='']
 * @returns {SVGSVGElement}
 */
function createIcon(name, size, className) {
  size = size || 20;
  className = className || '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (className) svg.setAttribute('class', className);

  var paths = ICONS[name];
  if (!paths) return svg;

  for (var i = 0; i < paths.length; i++) {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', paths[i]);
    svg.appendChild(p);
  }
  return svg;
}

/**
 * Replace all placeholder elements with Lucide icons.
 * Placeholder: <i class="lci" data-icon="globe" data-size="20"></i>
 */
function mountIcons(root) {
  root = root || document;
  var els = root.querySelectorAll('.lci[data-icon]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var name = el.getAttribute('data-icon');
    var size = parseInt(el.getAttribute('data-size'), 10) || 20;
    var svg = createIcon(name, size, 'lci-svg');
    el.parentNode.replaceChild(svg, el);
  }
}
