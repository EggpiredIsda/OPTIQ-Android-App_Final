/**
 * Generates 3D-looking glass lens images from LENS_TYPES tint data.
 * Supports frame-specific lens shapes: round, cat-eye, aviator, wayfarer, custom.
 * Returns an array of data URL strings (one per lens type).
 */

function hexToRgb(n) {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lensShapePath(ctx, cx, cy, r, shape) {
  switch (shape) {
    case "cat-eye": {
      // Upswept dramatic lens — wider at top-outer, swept corners
      const w = r * 1.1;
      const h = r * 0.85;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h);
      // top-right sweep up
      ctx.bezierCurveTo(cx + w * 0.5, cy - h * 1.15, cx + w * 1.0, cy - h * 0.7, cx + w, cy - h * 0.15);
      // right side down
      ctx.bezierCurveTo(cx + w * 0.95, cy + h * 0.4, cx + w * 0.7, cy + h * 0.9, cx + w * 0.35, cy + h);
      // bottom
      ctx.bezierCurveTo(cx + w * 0.1, cy + h * 1.02, cx - w * 0.1, cy + h * 1.02, cx - w * 0.35, cy + h);
      // left side up
      ctx.bezierCurveTo(cx - w * 0.7, cy + h * 0.9, cx - w * 0.95, cy + h * 0.4, cx - w, cy - h * 0.15);
      // top-left sweep up
      ctx.bezierCurveTo(cx - w * 1.0, cy - h * 0.7, cx - w * 0.5, cy - h * 1.15, cx, cy - h);
      ctx.closePath();
      break;
    }
    case "aviator": {
      // Teardrop shape — wider at bottom
      const w = r * 1.05;
      const h = r * 0.95;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.85);
      // top right
      ctx.bezierCurveTo(cx + w * 0.55, cy - h * 0.9, cx + w * 0.95, cy - h * 0.5, cx + w, cy);
      // bottom right — teardrop bulge
      ctx.bezierCurveTo(cx + w * 0.95, cy + h * 0.6, cx + w * 0.6, cy + h * 1.0, cx, cy + h);
      // bottom left
      ctx.bezierCurveTo(cx - w * 0.6, cy + h * 1.0, cx - w * 0.95, cy + h * 0.6, cx - w, cy);
      // top left
      ctx.bezierCurveTo(cx - w * 0.95, cy - h * 0.5, cx - w * 0.55, cy - h * 0.9, cx, cy - h * 0.85);
      ctx.closePath();
      break;
    }
    case "wayfarer": {
      // Bold rectangular with rounded corners — wider top, slightly tapered bottom
      const w = r * 1.05;
      const h = r * 0.78;
      const rr = r * 0.18; // corner radius
      ctx.beginPath();
      ctx.moveTo(cx - w + rr, cy - h);
      ctx.lineTo(cx + w - rr, cy - h);
      ctx.quadraticCurveTo(cx + w, cy - h, cx + w, cy - h + rr);
      ctx.lineTo(cx + w * 0.92, cy + h - rr);
      ctx.quadraticCurveTo(cx + w * 0.92, cy + h, cx + w * 0.92 - rr, cy + h);
      ctx.lineTo(cx - w * 0.92 + rr, cy + h);
      ctx.quadraticCurveTo(cx - w * 0.92, cy + h, cx - w * 0.92, cy + h - rr);
      ctx.lineTo(cx - w, cy - h + rr);
      ctx.quadraticCurveTo(cx - w, cy - h, cx - w + rr, cy - h);
      ctx.closePath();
      break;
    }
    case "custom": {
      // Rounded rectangle
      const w = r * 1.0;
      const h = r * 0.7;
      const rr = r * 0.25;
      ctx.beginPath();
      ctx.moveTo(cx - w + rr, cy - h);
      ctx.lineTo(cx + w - rr, cy - h);
      ctx.quadraticCurveTo(cx + w, cy - h, cx + w, cy - h + rr);
      ctx.lineTo(cx + w, cy + h - rr);
      ctx.quadraticCurveTo(cx + w, cy + h, cx + w - rr, cy + h);
      ctx.lineTo(cx - w + rr, cy + h);
      ctx.quadraticCurveTo(cx - w, cy + h, cx - w, cy + h - rr);
      ctx.lineTo(cx - w, cy - h + rr);
      ctx.quadraticCurveTo(cx - w, cy - h, cx - w + rr, cy - h);
      ctx.closePath();
      break;
    }
    default: // "round"
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
  }
}

function generateLensImage(tint, shape = "round") {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  const [cr, cg, cb] = hexToRgb(tint.color);
  const baseAlpha = 0.4 + (1 - tint.transmission) * 0.6;

  // Use lens shape as clip for all rendering
  ctx.save();
  lensShapePath(ctx, cx, cy, r, shape);
  ctx.clip();

  // 1) Dark background fill
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, size, size);

  // 2) Base lens color — radial gradient
  const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  baseGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${baseAlpha})`);
  baseGrad.addColorStop(0.6, `rgba(${cr}, ${cg}, ${cb}, ${baseAlpha * 0.85})`);
  baseGrad.addColorStop(1, `rgba(${Math.max(0, cr - 40)}, ${Math.max(0, cg - 40)}, ${Math.max(0, cb - 40)}, ${Math.min(1, baseAlpha * 1.3)})`);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // 3) Inner glow / refraction ring
  const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 0.85);
  glowGrad.addColorStop(0, `rgba(${Math.min(255, cr + 60)}, ${Math.min(255, cg + 60)}, ${Math.min(255, cb + 60)}, 0.08)`);
  glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, size, size);

  // 4) Specular highlight (upper-left offset for 3D depth)
  const specX = cx - r * 0.25;
  const specY = cy - r * 0.3;
  const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, r * 0.6);
  specGrad.addColorStop(0, "rgba(255, 255, 255, 0.35)");
  specGrad.addColorStop(0.3, "rgba(255, 255, 255, 0.12)");
  specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = specGrad;
  ctx.fillRect(0, 0, size, size);

  // 5) Rim shadow for depth
  const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
  rimGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  rimGrad.addColorStop(0.7, "rgba(0, 0, 0, 0.15)");
  rimGrad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.restore();

  // 6) Rim highlight stroke (follows shape)
  ctx.save();
  lensShapePath(ctx, cx, cy, r - 1, shape);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 7) Secondary specular (lower-right, clipped to shape)
  ctx.save();
  lensShapePath(ctx, cx, cy, r, shape);
  ctx.clip();
  const spec2X = cx + r * 0.3;
  const spec2Y = cy + r * 0.25;
  const spec2Grad = ctx.createRadialGradient(spec2X, spec2Y, 0, spec2X, spec2Y, r * 0.2);
  spec2Grad.addColorStop(0, "rgba(255, 255, 255, 0.1)");
  spec2Grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = spec2Grad;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

export function generateLensImages(lensTypes, frameShape = "round") {
  return lensTypes.map((lt) => generateLensImage(lt.tint, frameShape));
}
