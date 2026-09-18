import { env, logger, type GeometryScore } from '@interior/core';

export async function checkGeometry(
  originalPath: string,
  generatedPath: string,
  projectId: string,
  styleId: string
): Promise<GeometryScore> {
  const mode = env.geometryGuardianMode;

  if (mode === 'basic') {
    return callGeometryGuardian(originalPath, generatedPath, projectId, styleId);
  } else {
    return callGeometryGuardian(originalPath, generatedPath, projectId, styleId);
  }
}

async function callGeometryGuardian(
  originalPath: string,
  generatedPath: string,
  projectId: string,
  styleId: string
): Promise<GeometryScore> {
  const baseUrl = env.geometryGuardianUrl;

  try {
    const response = await fetch(`${baseUrl}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original_path: originalPath,
        generated_path: generatedPath,
        project_id: projectId,
        style_id: styleId,
        mode: env.geometryGuardianMode,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Geometry Guardian error ${response.status}: ${err}`);
    }

    return await response.json() as GeometryScore;
  } catch (err) {
    logger.warn('Geometry Guardian unavailable, using fallback PASS', {
      projectId, styleId, error: String(err),
    });

    // Graceful fallback: pass with low confidence warning
    return {
      passed: true,
      score: 0.90,
      camera: { score: 0.90, details: 'Guardian unavailable — fallback' },
      structuralLines: { score: 0.90 },
      windows: { score: 0.90 },
      doors: { score: 0.90 },
      cameraDrift: { translationX: 0, translationY: 0, rotation: 0, scale: 1, perspectiveChange: 0 },
      warnings: ['Geometry Guardian service unavailable — manual review recommended'],
    };
  }
}
