// Small inline SVG "tiles" that mirror the in-game buildings, for the upgrade & research screens.

const MK = ['#8090a0', '#40e0ff', '#ffc040'];

export function buildingIcon(type, level = 0, color = '#ff5a46') {
  const band = MK[level];
  switch (type) {
    case 'belt':
      return `<svg viewBox="0 0 100 100"><rect x="6" y="22" width="88" height="56" rx="4" fill="#23272f"/>
        <rect x="6" y="18" width="88" height="7" fill="${['#c8a030', '#40e0ff', '#ff5060'][level]}"/><rect x="6" y="75" width="88" height="7" fill="${['#c8a030', '#40e0ff', '#ff5060'][level]}"/>
        ${[18, 46, 74].map(x => `<polyline points="${x},34 ${x + 14},50 ${x},66" fill="none" stroke="#7d8aa3" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
        <circle cx="30" cy="50" r="7" fill="${color}"/><polygon points="62,42 70,50 62,58 54,50" fill="#9fe8ff"/></svg>`;
    case 'miner':
      return `<svg viewBox="0 0 100 100"><rect x="8" y="58" width="84" height="30" rx="3" fill="#2c313c"/>
        ${[0, 1, 2].map(i => `<circle cx="${22 + i * 28}" cy="92" r="5" fill="${color}" opacity="0.8"/>`).join('')}
        <rect x="16" y="34" width="68" height="28" rx="3" fill="#50586a"/><rect x="16" y="46" width="68" height="6" fill="${band}"/>
        <rect x="40" y="10" width="20" height="26" fill="#9aa2b0"/><polygon points="36,14 64,14 58,6 42,6" fill="#c8ced8"/>
        <circle cx="26" cy="40" r="4" fill="${color}"/><polygon points="84,62 96,70 84,78" fill="#fff"/></svg>`;
    case 'refinery':
      return `<svg viewBox="0 0 100 100"><rect x="8" y="64" width="84" height="24" rx="3" fill="#2c313c"/>
        <rect x="14" y="34" width="72" height="34" rx="3" fill="#4a4f5a"/><rect x="14" y="52" width="72" height="6" fill="${band}"/>
        <rect x="20" y="10" width="9" height="26" fill="#2c313c"/><rect x="34" y="16" width="8" height="20" fill="#2c313c"/>
        <circle cx="62" cy="30" r="13" fill="${color}"/><circle cx="62" cy="30" r="20" fill="${color}" opacity="0.25"/>
        <polygon points="84,64 96,72 84,80" fill="#fff"/></svg>`;
    case 'teleporter':
      return `<svg viewBox="0 0 100 100"><rect x="38" y="0" width="24" height="70" fill="#60e8ff" opacity="${0.18 + level * 0.12}"/>
        <ellipse cx="50" cy="80" rx="42" ry="14" fill="#252a38"/><ellipse cx="50" cy="76" rx="32" ry="10" fill="none" stroke="#60e8ff" stroke-width="4"/>
        <ellipse cx="50" cy="44" rx="20" ry="20" fill="none" stroke="#60e8ff" stroke-width="3"/><ellipse cx="50" cy="44" rx="8" ry="20" fill="none" stroke="#60e8ff" stroke-width="3"/>
        ${[14, 86].map(x => `<rect x="${x - 3}" y="52" width="6" height="26" fill="#50586a"/><circle cx="${x}" cy="50" r="4" fill="#60e8ff"/>`).join('')}
        <rect x="6" y="6" width="${18 + level * 8}" height="8" rx="2" fill="${band}"/></svg>`;
  }
  return '';
}

export function oreIcon(color) {
  return `<svg viewBox="0 0 100 100"><rect x="6" y="6" width="88" height="88" rx="6" fill="#1a1d24"/>
    <rect x="6" y="6" width="88" height="88" rx="6" fill="${color}" opacity="0.18"/>
    <polygon points="30,78 22,52 34,30 46,52 40,78" fill="${color}"/>
    <polygon points="52,82 46,46 60,18 74,46 68,82" fill="${color}" opacity="0.85"/>
    <polygon points="60,18 74,46 60,40" fill="#fff" opacity="0.35"/>
    <polygon points="72,84 70,64 80,52 88,66 84,84" fill="${color}" opacity="0.7"/></svg>`;
}
