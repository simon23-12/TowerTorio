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

// tile icons for the tower upgrade track
export function towerUpIcon(id, level = 0) {
  const lit = level > 0 ? 1 : 0.45;
  const tower = `<rect x="38" y="46" width="24" height="40" fill="#5a5650"/><rect x="30" y="40" width="40" height="9" fill="#6a6660"/>
    <rect x="28" y="84" width="44" height="8" fill="#34312e"/><polygon points="50,18 58,32 50,40 42,32" fill="#ffd090" opacity="${lit}"/>`;
  const bug = (x, y, c = '#ff5a4a') => `<ellipse cx="${x}" cy="${y}" rx="9" ry="6" fill="${c}"/><circle cx="${x + 7}" cy="${y - 2}" r="2" fill="#fff"/>`;
  let fx = '';
  switch (id) {
    case 'rapid': fx = [0, 1, 2].map(i => `<line x1="60" y1="${28 + i * 5}" x2="${88 - i * 6}" y2="${18 + i * 12}" stroke="#ffa040" stroke-width="3" stroke-linecap="round" opacity="${lit}"/>`).join(''); break;
    case 'twin': fx = `<line x1="50" y1="30" x2="86" y2="20" stroke="#ffd090" stroke-width="3" opacity="${lit}"/><line x1="50" y1="30" x2="86" y2="54" stroke="#60ffe0" stroke-width="3" opacity="${lit}"/>${bug(88, 20)}${bug(88, 56)}`; break;
    case 'chain': fx = `<polyline points="50,30 80,16 88,44 74,66" fill="none" stroke="#b070ff" stroke-width="3" opacity="${lit}"/>${bug(80, 16)}${bug(88, 44)}${bug(74, 66)}`; break;
    case 'crit': fx = `<circle cx="80" cy="30" r="13" fill="none" stroke="#ffff60" stroke-width="3" opacity="${lit}"/><line x1="80" y1="12" x2="80" y2="48" stroke="#ffff60" stroke-width="2"/><line x1="62" y1="30" x2="98" y2="30" stroke="#ffff60" stroke-width="2"/>`; break;
    case 'regen': fx = `<path d="M18 62 Q50 4 82 62" fill="none" stroke="#46ff88" stroke-width="4" opacity="${lit}"/><rect x="76" y="14" width="6" height="18" fill="#46ff88"/><rect x="70" y="20" width="18" height="6" fill="#46ff88"/>`; break;
    case 'frost': fx = `<line x1="50" y1="30" x2="82" y2="40" stroke="#9fe8ff" stroke-width="3" opacity="${lit}"/>${bug(86, 44, '#7fb8ff')}${[0, 60, 120].map(a => `<line x1="${86 - 12 * Math.cos(a * Math.PI / 180)}" y1="${26 - 12 * Math.sin(a * Math.PI / 180)}" x2="${86 + 12 * Math.cos(a * Math.PI / 180)}" y2="${26 + 12 * Math.sin(a * Math.PI / 180)}" stroke="#cff4ff" stroke-width="2"/>`).join('')}`; break;
    case 'bounty': fx = `<circle cx="80" cy="26" r="11" fill="#ffd046" opacity="${lit}"/><circle cx="86" cy="40" r="9" fill="#e0b030" opacity="${lit}"/><text x="80" y="31" font-size="13" text-anchor="middle" fill="#5a4010" font-family="sans-serif" font-weight="bold">◈</text>`; break;
  }
  return `<svg viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" rx="6" fill="#141820"/>${tower}${fx}</svg>`;
}

const GLYPHS = { ember: '✶', stone: '◆', swift: '»', hawk: '◎', rime: '❄', greed: '◈', storm: 'ϟ', twinfang: '‖', aegis: '⛨', titan: '▲', inferno: '✹', chronos: '⧗' };
export function runeIcon(id, color, edge = '#9aa4b8') {
  return `<svg viewBox="0 0 100 100"><polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="#141820" stroke="${edge}" stroke-width="4"/>
    <polygon points="50,16 79,33 79,67 50,84 21,67 21,33" fill="${color}" opacity="0.22"/>
    <text x="50" y="64" font-size="42" text-anchor="middle" fill="${color}" font-family="sans-serif" font-weight="bold">${GLYPHS[id] || '?'}</text></svg>`;
}
