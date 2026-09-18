import type { InteriorStyle } from '@interior/styles';
import { buildStylePromptProfile } from '@interior/styles';

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

You may change:
wall finishes,
ceiling finishes,
floor finishes,
paint,
surface materials,
furniture,
lighting fixtures,
decor,
textiles,
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
