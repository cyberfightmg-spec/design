import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { InteriorStyle, StyleCategory } from './types.js';

export type { InteriorStyle, StyleCategory, StyleGenerationProfile } from './types.js';
export { STYLE_CATEGORIES } from './types.js';

function loadStyles(): InteriorStyle[] {
  // Resolve from process.cwd() (project root)
  const configPath = resolve(process.cwd(), 'config', 'styles.json');
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as { styles: InteriorStyle[] };
  return parsed.styles.sort((a, b) => a.sortOrder - b.sortOrder);
}

let _styles: InteriorStyle[] | null = null;

function getStyles(): InteriorStyle[] {
  if (!_styles) _styles = loadStyles();
  return _styles;
}

export function getAllStyles(): InteriorStyle[] {
  return getStyles();
}

export function getStyleById(id: string): InteriorStyle | undefined {
  return getStyles().find(s => s.id === id);
}

export function getStylesByCategory(category: StyleCategory): InteriorStyle[] {
  return getStyles().filter(s => s.category === category);
}

export function getAllStyleIds(): string[] {
  return getStyles().map(s => s.id);
}

export function buildStylePromptProfile(style: InteriorStyle): string {
  const p = style.generationProfile;
  const lines: string[] = [
    `Style: ${style.displayName}`,
    `Mood: ${p.mood.join(', ')}`,
    `Color palette: ${p.palette.join(', ')}`,
    `Materials: ${p.materials.join(', ')}`,
    `Furniture: ${p.furniture.join(', ')}`,
    `Lighting: ${p.lighting.join(', ')}`,
    `Decor elements: ${p.decor.join(', ')}`,
  ];
  if (style.architectureWarnings.length > 0) {
    lines.push('');
    lines.push('ARCHITECTURE CONSTRAINTS FOR THIS STYLE:');
    style.architectureWarnings.forEach(w => lines.push(`- ${w}`));
  }
  return lines.join('\n');
}

export function buildMasterPrompt(style: InteriorStyle): string {
  const styleProfile = buildStylePromptProfile(style);

  return `You are performing a photorealistic interior renovation of the UPLOADED ORIGINAL PHOTOGRAPH.

THIS IS AN IMAGE EDITING TASK, NOT A NEW SCENE GENERATION TASK.

ABSOLUTE ARCHITECTURE LOCK.

The uploaded photograph is the single source of truth.

CAMERA LOCK:
Preserve the exact original camera position.
Preserve the exact camera height.
Preserve the exact viewing direction.
Preserve the exact perspective.
Preserve the exact focal perspective.
Preserve the exact framing.
Preserve the exact crop.
Preserve the exact vanishing points.

ARCHITECTURE LOCK:
Preserve every existing wall in exactly the same position.
Preserve every window in exactly the same position, size and shape.
Preserve every door and doorway in exactly the same position, size and shape.
Preserve every opening.
Preserve every column.
Preserve every structural beam.
Preserve every staircase.
Preserve every level.
Preserve every ceiling boundary.
Preserve every floor boundary.
Preserve every niche and architectural projection.

DO NOT:
move walls,
remove walls,
add walls,
move windows,
resize windows,
change window shapes,
add windows,
remove windows,
move doors,
resize doors,
change doorway shapes,
add doors,
remove doors,
change the room dimensions,
change the ceiling height,
change the camera,
change perspective,
change lens perspective,
change framing,
change crop,
create another room,
create another floor,
change architectural geometry.

The geometry of the building must remain visually locked to the uploaded reference.

ONLY RENOVATE THE INTERIOR.

You MUST repair, restore, and finish the space:
- Install proper glass windows with high-quality frames into all existing window openings. All windows must have transparent clean glass panes and complete window sills.
- Repair and finish damaged walls, ceilings, and floors into completed, habitable living condition.
- Replace broken railings and missing elements with fully constructed, finished architectural elements.

You may change and decorate:
wall finishes and plaster,
ceiling finishes,
floor finishes and tile/wood,
glass windows and window frames,
doors and trims,
paint,
surface materials,
furniture,
lighting fixtures and chandeliers,
decor,
textiles and curtains,
art,
rugs,
plants,
interior objects.

TARGET INTERIOR STYLE:
${style.displayName}

STYLE PROFILE:
${styleProfile}

The completed interior should look professionally designed, realistic and buildable.

Photorealistic architectural photography.
Natural physically believable materials.
Realistic global illumination.
Realistic shadows.
Realistic reflections.
Realistic scale.
No fantasy architecture.
No text.
No labels.
No watermark.

FINAL PRIORITY ORDER:
1. Preserve architecture.
2. Preserve camera.
3. Preserve perspective.
4. Apply the requested interior style.
5. Photorealism.

If a stylistic feature would require altering the architecture, DO NOT use that feature.
Find another way to communicate the style through finishes, furniture, materials, lighting and decor.`;
}

export function buildRetryPrompt(style: InteriorStyle, attempt: number): string {
  return `CRITICAL CORRECTION — ATTEMPT ${attempt}:

The previous result changed the architectural geometry.

Regenerate from the ORIGINAL uploaded photograph.

The camera and all architectural boundaries must remain unchanged.

Do NOT redesign the architecture.

Preserve the exact positions and dimensions of all walls, windows, doors and openings.

${buildMasterPrompt(style)}`;
}

export interface LocalizedStyleText {
  displayName: string;
  voiceText: string;
}

export const STYLE_EN_TEXTS: Record<string, LocalizedStyleText> = {
  classicismo: { displayName: 'CLASSICISM', voiceText: 'Classicism.' },
  neoclassic: { displayName: 'NEOCLASSICAL', voiceText: 'Neoclassical.' },
  baroque_rococo: { displayName: 'BAROQUE & ROCOCO', voiceText: 'Baroque and Rococo.' },
  empire: { displayName: 'EMPIRE', voiceText: 'Empire.' },
  art_nouveau: { displayName: 'ART NOUVEAU', voiceText: 'Art Nouveau.' },
  gothic: { displayName: 'GOTHIC', voiceText: 'Gothic.' },
  minimalism: { displayName: 'MINIMALISM', voiceText: 'Minimalism.' },
  loft: { displayName: 'LOFT', voiceText: 'Loft.' },
  high_tech: { displayName: 'HIGH-TECH', voiceText: 'High-tech.' },
  contemporary: { displayName: 'CONTEMPORARY', voiceText: 'Contemporary.' },
  bauhaus: { displayName: 'BAUHAUS', voiceText: 'Bauhaus.' },
  brutalism: { displayName: 'BRUTALISM', voiceText: 'Brutalism.' },
  scandinavian: { displayName: 'SCANDINAVIAN', voiceText: 'Scandinavian.' },
  japandi: { displayName: 'JAPANDI', voiceText: 'Japandi.' },
  provence: { displayName: 'PROVENCE', voiceText: 'Provence.' },
  mediterranean: { displayName: 'MEDITERRANEAN', voiceText: 'Mediterranean.' },
  moroccan: { displayName: 'MOROCCAN', voiceText: 'Moroccan.' },
  american_classic: { displayName: 'AMERICAN CLASSIC', voiceText: 'American Classic.' },
  mid_century: { displayName: 'MID-CENTURY', voiceText: 'Mid-century.' },
  art_deco: { displayName: 'ART DECO', voiceText: 'Art Deco.' },
  retro: { displayName: 'RETRO', voiceText: 'Retro.' },
  shabby_chic: { displayName: 'SHABBY CHIC', voiceText: 'Shabby Chic.' },
  boho: { displayName: 'BOHO', voiceText: 'Boho.' },
  eco: { displayName: 'ECO STYLE', voiceText: 'Eco style.' },
  chalet: { displayName: 'CHALET', voiceText: 'Chalet.' },
  rustic: { displayName: 'RUSTIC', voiceText: 'Rustic.' },
  eclectic: { displayName: 'ECLECTIC', voiceText: 'Eclectic.' },
};

export function getStyleTextByLocale(style: InteriorStyle, locale: 'ru' | 'en'): LocalizedStyleText {
  if (locale === 'en') {
    return STYLE_EN_TEXTS[style.id] || { displayName: style.displayName, voiceText: style.displayName };
  }
  return { displayName: style.displayName, voiceText: style.voiceText };
}
