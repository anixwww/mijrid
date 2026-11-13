import { FamilyTreeData, Person } from '../types/tree';
import { CARD_WIDTH, CARD_HEIGHT, generateConnections, calculateGenerations } from './treeLayout';
import { getCardDates } from './dateUtils';
import { buildClanMap } from './lineageUtils';
import { autoArrangeTree } from './autoLayout';
import { buildBranchLinkArcGeometry, normalizeBranchLineShape } from './branchLinkGeometry';

export interface TreeSvgExportOptions {
  forPrint?: boolean;
  showGrid?: boolean;
  includeHeader?: boolean;
  imageDataUrlMap?: Record<string, string>;
}

export interface PrintOptimizationOptions {
  layoutMode: 'compact' | 'preserve';
  orientation: 'auto' | 'landscape' | 'portrait';
  showGrid: boolean;
  includeHeader: boolean;
}

export interface PreparedPrintTree {
  svgMarkup: string;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  personCount: number;
  generationCount: number;
  title: string;
}

const imageDataUrlCache = new Map<string, string>();

async function fetchUrlAsDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (imageDataUrlCache.has(url)) return imageDataUrlCache.get(url) || null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (dataUrl) {
      imageDataUrlCache.set(url, dataUrl);
    }
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Resolves relative/remote avatar and crest URLs into inline base64 data URLs
 * so exported SVG, PNG, and Print/PDF snapshots render all photos reliably.
 */
export async function resolveTreeImageDataUrls(tree: FamilyTreeData): Promise<Record<string, string>> {
  const urls = new Set<string>();
  Object.values(tree.persons || {}).forEach((p) => {
    if (p.avatarUrl && !p.avatarUrl.startsWith('data:')) {
      urls.add(p.avatarUrl);
    }
  });
  Object.values(tree.clanCoatOfArms || {}).forEach((crest) => {
    const u = typeof crest === 'string' ? crest : crest?.url;
    if (u && !u.startsWith('data:')) {
      urls.add(u);
    }
  });

  const map: Record<string, string> = {};
  await Promise.all(
    Array.from(urls).map(async (u) => {
      const dataUrl = await fetchUrlAsDataUrl(u);
      if (dataUrl) map[u] = dataUrl;
    })
  );
  return map;
}

/**
 * Builds a complete standalone SVG document of the family tree
 */
export function generateFullTreeSvg(
  tree: FamilyTreeData,
  options: TreeSvgExportOptions = {}
): string {
  const {
    forPrint = false,
    showGrid = !forPrint,
    includeHeader = true,
    imageDataUrlMap = {},
  } = options;

  const persons = Object.values(tree.persons);
  if (persons.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><rect width="800" height="600" fill="#ffffff"/><text x="400" y="300" text-anchor="middle" fill="#78716c" font-family="Plus Jakarta Sans, sans-serif" font-size="16">Дерево порожнє</text></svg>`;
  }

  const paddingX = forPrint ? 48 : 80;
  const paddingTop = includeHeader ? (forPrint ? 88 : 96) : forPrint ? 48 : 80;
  const paddingBottom = forPrint ? 48 : 80;

  const minX = Math.min(...persons.map((p) => p.x)) - paddingX;
  const minY = Math.min(...persons.map((p) => p.y)) - paddingTop;
  const maxX = Math.max(...persons.map((p) => p.x + CARD_WIDTH)) + paddingX;
  const maxY = Math.max(...persons.map((p) => p.y + CARD_HEIGHT)) + paddingBottom;

  const width = Math.max(640, maxX - minX);
  const height = Math.max(420, maxY - minY);

  const clanMap = buildClanMap(tree.persons, tree.clanCoatOfArms);
  const clanRecord = Object.fromEntries(clanMap.entries());

  const connections = generateConnections(
    tree.persons,
    tree.connectionOverrides,
    tree.verifiedColor || '#64748b',
    clanRecord
  );

  // Generate SVG lines
  const linesSvg = connections
    .map(
      (c) =>
        `<path d="${c.path}" fill="none" stroke="${c.color}" stroke-width="${
          c.isMainBranch ? '3.5' : c.isVerified ? '2.0' : '1.6'
        }" stroke-dasharray="${c.isDashed ? '5,4' : 'none'}" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    .join('\n');

  // Generate SVG godparent / wavy card-to-card lines
  const godparentMarkers = new Map<string, { id: string; color: string; strokeWidth: number }>();
  const godparentSvgParts: string[] = [];
  const exportedBidirectionalPairs = new Set<string>();
  persons.forEach((source) => {
    (source.branchLinks || []).forEach((bl) => {
      const target = tree.persons[bl.targetPersonId];
      if (!target || target.id === source.id) return;
      const lineShape = normalizeBranchLineShape(bl.lineShape);
      if (bl.linkKind !== 'godparent' && lineShape !== 'wavy') return;

      const linkKind = bl.linkKind === 'godparent' ? 'godparent' : 'branch';
      const reverseLink = target.branchLinks?.find(
        (rev) =>
          rev.targetPersonId === source.id &&
          (rev.linkKind === 'godparent' ? 'godparent' : 'branch') === linkKind
      );
      if (reverseLink) {
        const pairKey = [source.id, target.id].sort().join('::') + `:${linkKind}`;
        if (exportedBidirectionalPairs.has(pairKey) || source.id > target.id) return;
        exportedBidirectionalPairs.add(pairKey);
      }

      const scx = source.x + CARD_WIDTH / 2;
      const scy = source.y + CARD_HEIGHT / 2;
      const tcx = target.x + CARD_WIDTH / 2;
      const tcy = target.y + CARD_HEIGHT / 2;
      const color = bl.color || '#d97706';
      const sw =
        typeof bl.strokeWidth === 'number' && bl.strokeWidth >= 1 && bl.strokeWidth <= 10
          ? Math.round(bl.strokeWidth)
          : 2;
      const symEndPad = 10 + Math.max(0, sw - 2) * 0.45;
      const isBidirectional = Boolean(reverseLink);
      const { pathD, midX, midY, startPt } = buildBranchLinkArcGeometry({
        scx,
        scy,
        tcx,
        tcy,
        cardWidth: CARD_WIDTH,
        cardHeight: CARD_HEIGHT,
        lineShape,
        hasReverseSameLine: false,
        strokeWidth: sw,
        startPad: isBidirectional ? symEndPad : 5,
      });

      const safeColorKey = color.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
      const markerKey = `${safeColorKey}-w${sw}`;
      const markerId = `export-gp-arrow-${markerKey}`;
      if (!godparentMarkers.has(markerKey)) {
        godparentMarkers.set(markerKey, { id: markerId, color, strokeWidth: sw });
      }

      const labelText = bl.label?.trim() || reverseLink?.label?.trim() || 'Хресний / Хресна';
      const badgeW = Math.min(130, Math.max(54, labelText.length * 5.6 + 18));
      const dotR = Math.max(2.5, Math.min(5.2, sw * 0.7 + 1.1));
      godparentSvgParts.push(
        `<g>
          <path d="${pathD}" fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="${sw + 2.6}" stroke-linecap="butt" stroke-linejoin="round"/>
          <path d="${pathD}" fill="none" stroke="${escapeXml(color)}" stroke-width="${sw}" ${
            lineShape === 'wavy' ? '' : 'stroke-dasharray="7,4"'
          } stroke-linecap="${lineShape === 'wavy' ? 'round' : 'butt'}" stroke-linejoin="round" ${
            isBidirectional ? `marker-start="url(#${markerId})" ` : ''
          }marker-end="url(#${markerId})"/>
          ${
            isBidirectional
              ? ''
              : `<circle cx="${startPt.x.toFixed(1)}" cy="${startPt.y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${escapeXml(color)}" stroke="#ffffff" stroke-width="1.2"/>`
          }
          <rect x="${(midX - badgeW / 2).toFixed(1)}" y="${(midY - 8).toFixed(1)}" width="${badgeW.toFixed(
          1
        )}" height="16" rx="8" fill="#ffffff" stroke="${escapeXml(color)}" stroke-width="1"/>
          <text x="${midX.toFixed(1)}" y="${(midY + 3).toFixed(
          1
        )}" font-family="Plus Jakarta Sans, sans-serif" font-size="8" font-weight="bold" fill="#292524" text-anchor="middle">${escapeXml(
          truncateLabel(labelText, 20)
        )}</text>
        </g>`
      );
    });
  });

  const godparentDefsSvg =
    godparentMarkers.size > 0
      ? `<defs>
          ${Array.from(godparentMarkers.values())
            .map((m) => {
              const arrowLen = Math.max(11, Math.min(24, 9 + m.strokeWidth * 1.4));
              const arrowHalfH = Math.max(5.5, Math.min(12, 4.2 + m.strokeWidth * 0.75));
              const refX = Math.max(2, Number((arrowLen * 0.62).toFixed(1)));
              const notchX = Number((arrowLen * 0.2).toFixed(1));
              return `<marker id="${m.id}" viewBox="0 0 ${arrowLen} ${arrowHalfH * 2}" refX="${refX}" refY="${arrowHalfH}" markerWidth="${arrowLen}" markerHeight="${
                arrowHalfH * 2
              }" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M 0 0 L ${arrowLen} ${arrowHalfH} L 0 ${arrowHalfH * 2} L ${notchX} ${arrowHalfH} z" fill="${escapeXml(
                m.color
              )}"/>
              </marker>`;
            })
            .join('\n')}
        </defs>`
      : '';
  const godparentLinesSvg = godparentSvgParts.join('\n');

  // Generate SVG cards
  const cardsSvg = persons
    .map((p) => {
      const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '?';
      const nickname = p.nickname ? `«${p.nickname}»` : '';

      const clan = clanRecord[p.lastName] || clanRecord[p.clanName || ''];
      const cardBg = p.cardBgColor || clan?.bgColor || '#f4f4f5';
      const cardBorder = clan?.borderColor || '#d4d4d8';
      const resolvedAvatar = p.avatarUrl ? imageDataUrlMap[p.avatarUrl] || p.avatarUrl : undefined;

      const avatarSvg = resolvedAvatar
        ? `<clipPath id="avatar-clip-${escapeXml(p.id)}">
             <rect x="${p.x + CARD_WIDTH / 2 - 22}" y="${p.y + 11}" width="44" height="44" rx="7"/>
           </clipPath>
           <image href="${escapeXml(resolvedAvatar)}" x="${p.x + CARD_WIDTH / 2 - 22}" y="${p.y + 11}" width="44" height="44" clip-path="url(#avatar-clip-${escapeXml(p.id)})" preserveAspectRatio="xMidYMid slice"/>`
        : p.gender === 'female'
        ? `<ellipse cx="${p.x + CARD_WIDTH / 2}" cy="${p.y + 24}" rx="6.5" ry="5.5" fill="#333"/>
           <ellipse cx="${p.x + CARD_WIDTH / 2}" cy="${p.y + 32}" rx="8.5" ry="9.5" fill="#333"/>
           <path d="M ${p.x + CARD_WIDTH / 2 - 11} ${p.y + 50} C ${p.x + CARD_WIDTH / 2 - 6} ${p.y + 40}, ${p.x + CARD_WIDTH / 2 + 6} ${p.y + 40}, ${p.x + CARD_WIDTH / 2 + 11} ${p.y + 50} Z" fill="#333"/>`
        : p.gender === 'male'
        ? `<ellipse cx="${p.x + CARD_WIDTH / 2}" cy="${p.y + 30}" rx="8.5" ry="9.5" fill="#333"/>
           <path d="M ${p.x + CARD_WIDTH / 2 - 12} ${p.y + 50} C ${p.x + CARD_WIDTH / 2 - 6} ${p.y + 40}, ${p.x + CARD_WIDTH / 2 + 6} ${p.y + 40}, ${p.x + CARD_WIDTH / 2 + 12} ${p.y + 50} Z" fill="#333"/>`
        : `<text x="${p.x + CARD_WIDTH / 2}" y="${p.y + 37}" font-family="sans-serif" font-weight="bold" font-size="16" fill="#555" text-anchor="middle">?</text>`;

      const houseBadgeSvg = p.houseNumber
        ? `<g transform="translate(${p.x + CARD_WIDTH - 28}, ${p.y + 4})">
            <rect x="0" y="0" width="26" height="13" rx="4" fill="#ffffff" stroke="#e5e7eb" stroke-width="0.9"/>
            <text x="13" y="9.5" font-family="monospace" font-size="7.5" font-weight="bold" fill="#1c1917" text-anchor="middle">№${escapeXml(
              p.houseNumber
            )}</text>
          </g>`
        : '';

      const datesInfo = getCardDates(p);
      const datesSvg = datesInfo.displayLine1
        ? datesInfo.isSingleLine
          ? `<text x="${p.x + CARD_WIDTH / 2}" y="${p.y + (nickname ? 98 : 90)}" font-family="monospace" font-size="8" fill="#57534e" text-anchor="middle">${escapeXml(datesInfo.displayLine1)}</text>`
          : `<text x="${p.x + CARD_WIDTH / 2}" y="${p.y + (nickname ? 94 : 86)}" font-family="monospace" font-size="7.8" fill="#44403c" text-anchor="middle">${escapeXml(datesInfo.displayLine1)}</text>
             <text x="${p.x + CARD_WIDTH / 2}" y="${p.y + (nickname ? 104 : 96)}" font-family="monospace" font-size="7.2" fill="#78716c" text-anchor="middle">${escapeXml(datesInfo.displayLine2)}</text>`
        : '';

      const validBranchLinks = (p.branchLinks || []).filter((bl) => Boolean(tree.persons[bl.targetPersonId]));
      const firstBranchLink = validBranchLinks[0];
      const firstTarget = firstBranchLink ? tree.persons[firstBranchLink.targetPersonId] : null;
      const branchLabel =
        validBranchLinks.length > 1
          ? `↗ ${validBranchLinks.length} зв.`
          : firstBranchLink && firstTarget
          ? `↗ ${truncateLabel(firstBranchLink.label || [firstTarget.firstName, firstTarget.lastName].filter(Boolean).join(' '), 14)}`
          : '';
      const branchBadgeColor = firstBranchLink?.color || '#4f46e5';
      const branchBadgeSvg = branchLabel
        ? `<g transform="translate(${p.x + CARD_WIDTH - 68}, ${p.y + CARD_HEIGHT - 10})">
            <rect x="0" y="0" width="64" height="13" rx="6.5" fill="${escapeXml(branchBadgeColor)}" stroke="#ffffff" stroke-width="0.8"/>
            <text x="32" y="9" font-family="Plus Jakarta Sans, sans-serif" font-size="6.8" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(
              branchLabel
            )}</text>
          </g>`
        : '';

      const isBlankScreenshot = Boolean(p.isBlankScreenshot);
      const isGhost = Boolean(p.isGhost && !isBlankScreenshot);
      const isProposal = Boolean(p.isProposal && !isGhost && !isBlankScreenshot);
      const ghostNoteText = (p.ghostNote || p.notes || '').trim();

      if (isBlankScreenshot) {
        const clipId = `blank-clip-${escapeXml(p.id)}`;
        const preserveMode = p.screenshotFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
        const shotSvg = p.screenshotUrl
          ? `<defs><clipPath id="${clipId}"><rect x="${p.x}" y="${p.y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="6"/></clipPath></defs>
             ${p.screenshotFit === 'contain' ? `<rect x="${p.x}" y="${p.y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="6" fill="#18181b"/>` : ''}
             <image href="${escapeXml(p.screenshotUrl)}" x="${p.x}" y="${p.y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="${preserveMode}" clip-path="url(#${clipId})"/>
             <rect x="${p.x}" y="${p.y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="6" fill="none" stroke="#a8a29e" stroke-width="1.2"/>`
          : `<rect x="${p.x}" y="${p.y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="6" fill="#fafaf9" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5,3"/>
             <text x="${p.x + CARD_WIDTH / 2}" y="${p.y + CARD_HEIGHT / 2}" font-family="Plus Jakarta Sans, sans-serif" font-size="8.5" font-weight="600" fill="#64748b" text-anchor="middle">${escapeXml(
               truncateLabel(fullName || 'Порожня картка', 18)
             )}</text>`;

        return `
      <g id="card-${escapeXml(p.id)}">
        ${shotSvg}
        ${branchBadgeSvg}
      </g>
    `;
      }

      const ghostBadgeSvg = isGhost
        ? `<g transform="translate(${p.x + 4}, ${p.y + 4})">
            <rect x="0" y="0" width="38" height="12" rx="6" fill="#475569" stroke="#ffffff" stroke-width="0.7"/>
            <text x="19" y="8.5" font-family="Plus Jakarta Sans, sans-serif" font-size="6.5" font-weight="bold" fill="#ffffff" text-anchor="middle">Примара</text>
          </g>`
        : isProposal
        ? `<g transform="translate(${p.x + 4}, ${p.y + 4})">
            <rect x="0" y="0" width="46" height="12" rx="6" fill="#0284c7" stroke="#ffffff" stroke-width="0.7"/>
            <text x="23" y="8.5" font-family="Plus Jakarta Sans, sans-serif" font-size="6.2" font-weight="bold" fill="#ffffff" text-anchor="middle">Пропозиція</text>
          </g>`
        : '';
      const ghostNoteSvg =
        isGhost && ghostNoteText
          ? `<text x="${p.x + CARD_WIDTH / 2}" y="${p.y + (datesInfo.displayLine1 ? 111 : 94)}" font-family="Plus Jakarta Sans, sans-serif" font-size="7.2" font-style="italic" fill="#475569" text-anchor="middle">${escapeXml(
              truncateLabel(ghostNoteText, 24)
            )}</text>`
          : '';

      const frameStyle = p.cardFrame && p.cardFrame !== 'none' ? p.cardFrame : null;
      const frameColorMap: Record<string, string> = {
        gilded_corners: '#d97706',
        archival_double: '#44403c',
        vyshyvanka: '#be123c',
        botanical_wreath: '#047857',
        cozy_stitch: '#92400e',
        royal_seal: '#0f766e',
      };
      const frameSvg = frameStyle
        ? `<rect x="${p.x - 2.5}" y="${p.y - 2.5}" width="${CARD_WIDTH + 5}" height="${CARD_HEIGHT + 5}" rx="8" fill="none" stroke="${
            frameColorMap[frameStyle] || cardBorder
          }" stroke-width="${frameStyle === 'archival_double' || frameStyle === 'royal_seal' ? '1.8' : '1.4'}"${
            frameStyle === 'cozy_stitch' ? ' stroke-dasharray="4,2.5"' : ''
          }/>`
        : '';

      return `
      <g id="card-${escapeXml(p.id)}"${isGhost ? ' opacity="0.86"' : ''}>
        ${frameSvg}
        <rect x="${p.x}" y="${p.y}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="6" fill="${cardBg}" stroke="${
          isGhost ? '#64748b' : isProposal ? '#0284c7' : cardBorder
        }" stroke-width="${isGhost || isProposal ? '1.6' : '1.2'}"${isGhost ? ' stroke-dasharray="5,3"' : ''}/>
        <rect x="${p.x + CARD_WIDTH / 2 - 23}" y="${p.y + 10}" width="46" height="46" rx="8" fill="#ffffff" stroke="${isProposal ? '#0284c7' : cardBorder}" stroke-width="1"/>
        ${avatarSvg}
        ${ghostBadgeSvg}
        ${houseBadgeSvg}
        <text x="${p.x + CARD_WIDTH / 2}" y="${p.y + 68}" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" font-weight="600" fill="#1c1917" text-anchor="middle">
          ${escapeXml(truncateLabel(fullName, 20))}
        </text>
        ${
          nickname
            ? `<text x="${p.x + CARD_WIDTH / 2}" y="${p.y + 80}" font-family="Plus Jakarta Sans, sans-serif" font-size="9" font-style="italic" fill="#57534e" text-anchor="middle">${escapeXml(truncateLabel(nickname, 20))}</text>`
            : ''
        }
        ${datesSvg}
        ${ghostNoteSvg}
        ${branchBadgeSvg}
      </g>
    `;
    })
    .join('\n');

  const bgColor = forPrint ? '#ffffff' : '#f8faf8';
  const gridLayer = showGrid
    ? `<defs>
        <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e3ece5" stroke-width="0.8"/>
        </pattern>
      </defs>
      <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#grid)"/>`
    : '';

  const genMap = calculateGenerations(tree.persons);
  const genCount = persons.length > 0 ? Math.max(1, new Set(Object.values(genMap)).size) : 0;
  const dateStr = new Date().toLocaleDateString('uk-UA');
  const subtitle = `${persons.length} осіб · ${genCount} поколінь · ${tree.version || 'v0.1'} · ${dateStr}`;

  const headerLayer = includeHeader
    ? `<g id="tree-header">
        <text x="${minX + 32}" y="${minY + 38}" font-family="Cormorant Garamond, Georgia, serif" font-size="24" font-weight="bold" fill="#1c1917">
          ${escapeXml(tree.title || 'Родове дерево')}
        </text>
        <text x="${minX + 32}" y="${minY + 56}" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#57534e">
          ${escapeXml(subtitle)}
        </text>
        <line x1="${minX + 32}" y1="${minY + 66}" x2="${minX + width - 32}" y2="${minY + 66}" stroke="#e7e5e4" stroke-width="1"/>
      </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bgColor}"/>
  ${gridLayer}
  ${headerLayer}
  <g id="connections">
    ${godparentDefsSvg}
    ${linesSvg}
    ${godparentLinesSvg}
  </g>
  <g id="cards">
    ${cardsSvg}
  </g>
</svg>`;
}

/**
 * Optimizes a cloned copy of the tree for clean print/PDF export without mutating live canvas state.
 */
export async function prepareTreeForPrint(
  tree: FamilyTreeData,
  options: PrintOptimizationOptions
): Promise<PreparedPrintTree> {
  let workingPersons: Record<string, Person> = {};
  Object.entries(tree.persons || {}).forEach(([id, p]) => {
    workingPersons[id] = { ...p };
  });

  if (options.layoutMode === 'compact' && Object.keys(workingPersons).length > 0) {
    const arranged = autoArrangeTree(workingPersons, tree.connectionOverrides, {
      mode: 'classic',
      generationGap: 205,
      cardGap: 34,
      branchGap: 52,
    });
    workingPersons = arranged.persons;
  }

  const optimizedTree: FamilyTreeData = {
    ...tree,
    persons: workingPersons,
  };

  const imageMap = await resolveTreeImageDataUrls(optimizedTree);
  const svgMarkup = generateFullTreeSvg(optimizedTree, {
    forPrint: true,
    showGrid: options.showGrid,
    includeHeader: options.includeHeader,
    imageDataUrlMap: imageMap,
  });

  const widthMatch = svgMarkup.match(/width="([\d.]+)"/);
  const heightMatch = svgMarkup.match(/height="([\d.]+)"/);
  const width = widthMatch ? Number(widthMatch[1]) : 800;
  const height = heightMatch ? Number(heightMatch[1]) : 600;

  const resolvedOrientation: 'landscape' | 'portrait' =
    options.orientation === 'auto' ? (width >= height ? 'landscape' : 'portrait') : options.orientation;

  const genMap = calculateGenerations(workingPersons);
  const personCount = Object.keys(workingPersons).length;
  const generationCount = personCount > 0 ? Math.max(1, new Set(Object.values(genMap)).size) : 0;

  return {
    svgMarkup,
    width,
    height,
    orientation: resolvedOrientation,
    personCount,
    generationCount,
    title: tree.title || 'Родове дерево',
  };
}

function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Downloads SVG file directly to user's computer (with embedded images)
 */
export async function downloadTreeSvgFile(tree: FamilyTreeData): Promise<void> {
  const imageMap = await resolveTreeImageDataUrls(tree);
  const svgContent = generateFullTreeSvg(tree, { imageDataUrlMap: imageMap });
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(tree.title || 'родовід').toLowerCase().replace(/\s+/g, '_')}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Renders SVG to HTML5 Canvas at 2x resolution and downloads PNG
 */
export async function downloadTreePngFile(tree: FamilyTreeData): Promise<void> {
  const imageMap = await resolveTreeImageDataUrls(tree);
  const svgString = generateFullTreeSvg(tree, { imageDataUrlMap: imageMap });

  return new Promise((resolve, reject) => {
    try {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        const scale = 2; // High-resolution export
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Не вдалося створити контекст канвасу'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            URL.revokeObjectURL(url);
            reject(new Error('Не вдалося створити PNG'));
            return;
          }
          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `${(tree.title || 'родовід').toLowerCase().replace(/\s+/g, '_')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
          resolve();
        }, 'image/png');
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Помилка завантаження SVG для генерації PNG'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}
