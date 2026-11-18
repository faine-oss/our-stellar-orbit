(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = 2.399963;
  const CAMERA_DISTANCE = 4.05;
  const HOME_YAW = 0.18;
  const HOME_PITCH = -0.075;
  const MIN_ZOOM = 0.75;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 1.23;
  const PALETTES = {
    galaxy: { rgb: "154, 129, 255", edge: "#e1d5ff" },
    heart: { rgb: "232, 133, 174", edge: "#ffcfdd" },
    tree: { rgb: "242, 186, 101", edge: "#ffe2ad" },
    fireworks: { rgb: "155, 114, 255", edge: "#dac6ff" },
  };

  const galaxyHeroes = [
    [-0.59, 0.05, 0.61],
    [0.64, 0.31, 0.45],
    [-0.86, -0.31, 0.36],
    [0.84, -0.46, 0.38],
  ];

  function galaxyDisk(horizontal, vertical, elevation = 0) {
    const tilted = vertical * 0.76 - elevation * 0.65;
    return {
      x: horizontal * 0.963 - tilted * 0.269,
      y: horizontal * 0.269 + tilted * 0.963,
      z: vertical * 0.65 + elevation * 0.76,
    };
  }

  function galaxyPoint(progress, arm, lane = 0, elevation = 0) {
    const angle = arm * Math.PI + progress * 4.90 - 4.53 + Math.sin(progress * Math.PI) * 0.14;
    const radius = Math.max(0.025, 0.13 + progress * 1.17 + lane);
    return galaxyDisk(Math.cos(angle) * radius, Math.sin(angle) * radius, elevation);
  }

  const galaxyArc = [{ progress: 0, length: 0 }];
  let lastGalaxyPoint = galaxyPoint(0, 0);
  for (let index = 1; index <= 160; index += 1) {
    const progress = index / 160;
    const point = galaxyPoint(progress, 0);
    const length = galaxyArc[index - 1].length
      + Math.hypot(point.x - lastGalaxyPoint.x, point.y - lastGalaxyPoint.y, point.z - lastGalaxyPoint.z);
    galaxyArc.push({ progress, length });
    lastGalaxyPoint = point;
  }

  function galaxyHeroCount(count) {
    return Math.min(galaxyHeroes.length, Math.floor(count / 6));
  }

  function galaxyHaloCount(count) {
    return count < 24 ? 0 : Math.round((count - galaxyHeroCount(count)) * 0.22);
  }

  function galaxyPosition(index, count) {
    const heroCount = galaxyHeroCount(count);
    if (index < heroCount) return galaxyDisk(...galaxyHeroes[index]);

    const haloCount = galaxyHaloCount(count);
    if (index >= count - haloCount) {
      const slot = index - (count - haloCount);
      const angle = (slot + 0.35) / haloCount * TAU + Math.sin(index * GOLDEN_ANGLE) * 0.095;
      const radius = 1.25 + Math.sin(index * 1.7) * 0.17;
      const elevation = Math.sin(index * GOLDEN_ANGLE) * 0.46;
      return galaxyDisk(Math.cos(angle) * radius, Math.sin(angle) * radius, elevation);
    }

    const slot = index - heroCount;
    const arm = slot % 2;
    const armCount = Math.ceil((count - heroCount - haloCount - arm) / 2);
    const step = Math.floor(slot / 2);
    const fraction = (step + 0.52) / armCount;
    const distance = (0.105 + fraction * 0.86) * galaxyArc[galaxyArc.length - 1].length;
    const next = galaxyArc.findIndex((sample) => sample.length >= distance);
    const previous = galaxyArc[next - 1];
    const current = galaxyArc[next];
    const progress = lerp(previous.progress, current.progress, (distance - previous.length) / (current.length - previous.length));
    const lane = ((step + arm) % 3 - 1) * (0.15 + fraction * 0.035);
    const jitter = Math.sin(index * GOLDEN_ANGLE) * 0.041;
    const elevation = Math.cos(index * GOLDEN_ANGLE) * (0.24 + 0.23 * fraction);
    return galaxyPoint(progress, arm, lane + jitter, elevation);
  }

  function photoScale(index, count, mode) {
    if (mode !== "galaxy") return Math.pow(Math.min(1, 42 / count), 0.44);
    if (index < galaxyHeroCount(count)) return 1.46;
    if (index >= count - galaxyHaloCount(count)) return 0.67;
    return 0.79 + Math.sin(index * GOLDEN_ANGLE) * 0.083;
  }

  const heartHalf = [
    [[0, 0.35], [0.135, 0.35], [0.18, 0.72], [0.46, 0.77]],
    [[0.46, 0.77], [0.69, 0.811], [1, 0.64], [1, 0.36]],
    [[1, 0.36], [1, 0.05], [0.71, -0.25], [0.46, -0.47]],
    [[0.46, -0.47], [0.286, -0.623], [0.095, -0.83], [0, -0.83]],
  ];

  function heartPoint(progress) {
    const mirror = progress > 0.5 ? -1 : 1;
    const along = (mirror === 1 ? progress : 1 - progress) * heartHalf.length * 2;
    const index = Math.min(heartHalf.length - 1, Math.floor(along));
    const t = along - index;
    const inverse = 1 - t;
    const [a, b, c, d] = heartHalf[index];
    const coordinate = (axis) => inverse ** 3 * a[axis] + 3 * inverse ** 2 * t * b[axis]
      + 3 * inverse * t * t * c[axis] + t ** 3 * d[axis];
    const tangent = (axis) => inverse ** 2 * (b[axis] - a[axis])
      + 2 * inverse * t * (c[axis] - b[axis]) + t * t * (d[axis] - c[axis]);
    return { x: coordinate(0) * mirror, y: coordinate(1), tx: tangent(0), ty: tangent(1) * mirror };
  }

  // The horizontal tangents at the notch and tip meet their mirrored halves without a cusp.
  const heartArc = [{ length: 0, progress: 0, point: heartPoint(0) }];
  for (let index = 1; index <= 320; index += 1) {
    const progress = index / 320;
    const point = heartPoint(progress);
    const previous = heartArc[index - 1];
    const length = previous.length + Math.hypot(point.x - previous.point.x, point.y - previous.point.y);
    heartArc.push({ length, progress, point });
  }
  const HEART_DEPTH = 0.55;

  function heartContour(fraction) {
    const distance = ((fraction % 1 + 1) % 1) * heartArc[heartArc.length - 1].length;
    const next = Math.max(1, heartArc.findIndex((sample) => sample.length >= distance));
    const previous = heartArc[next - 1];
    const current = heartArc[next];
    const amount = (distance - previous.length) / (current.length - previous.length);
    return heartPoint(previous.progress + (current.progress - previous.progress) * amount);
  }

  function heartSurface(contour, latitude) {
    const radius = Math.cos(latitude);
    const elevation = Math.sin(latitude);
    const ellipse = Math.hypot(contour.x / 0.77, contour.y / 0.44);
    const ellipseSlope = (contour.x * contour.tx / 0.77 ** 2 + contour.y * contour.ty / 0.44 ** 2) / ellipse;
    const centerX = contour.x / ellipse;
    const centerY = contour.y / ellipse;
    const centerTX = (contour.tx - centerX * ellipseSlope) / ellipse;
    const centerTY = (contour.ty - centerY * ellipseSlope) / ellipse;
    const contourWeight = radius * radius;
    const x = radius * (centerX + (contour.x - centerX) * contourWeight);
    const y = radius * (centerY + (contour.y - centerY) * contourWeight);
    const tangentX = centerTX + (contour.tx - centerTX) * contourWeight;
    const tangentY = centerTY + (contour.ty - centerTY) * contourWeight;
    const radialX = centerX + (contour.x - centerX) * contourWeight * 3;
    const radialY = centerY + (contour.y - centerY) * contourWeight * 3;
    const nx = -tangentY * HEART_DEPTH * radius;
    const ny = tangentX * HEART_DEPTH * radius;
    const nz = elevation * (tangentX * radialY - tangentY * radialX);
    const length = Math.hypot(nx, ny, nz) || 1;
    return { x, y, z: HEART_DEPTH * elevation, normal: { x: nx / length, y: ny / length, z: nz / length } };
  }

  function heartMesh(segments, bands) {
    const contours = Array.from({ length: segments }, (_, index) => heartContour(index / segments));
    const faceContours = Array.from({ length: segments }, (_, index) => heartContour((index + 0.5) / segments));
    const vertices = [];
    const faces = [];
    let previousRing;
    for (let row = 0; row <= bands; row += 1) {
      const latitude = (row / bands - 0.5) * Math.PI;
      const start = vertices.length;
      const pole = row === 0 || row === bands;
      if (pole) {
        const direction = row === 0 ? -1 : 1;
        vertices.push({ x: 0, y: 0, z: HEART_DEPTH * direction, normal: { x: 0, y: 0, z: direction } });
      } else {
        for (const contour of contours) vertices.push(heartSurface(contour, latitude));
      }
      const ring = contours.map((_, index) => pole ? start : start + index);
      if (previousRing) {
        for (let column = 0; column < segments; column += 1) {
          const next = (column + 1) % segments;
          const corners = [previousRing[column], previousRing[next], ring[next], ring[column]];
          const latitudeAtFace = latitude - Math.PI / (bands * 2);
          const normal = heartSurface(faceContours[column], latitudeAtFace).normal;
          faces.push({ corners, normal });
        }
      }
      previousRing = ring;
    }
    return { vertices, faces };
  }

  const heartFitPoints = Array.from({ length: 58 }, (_, index) => {
    const contour = heartContour(index / 58);
    return [-1.06, -0.72, -0.36, 0, 0.36, 0.72, 1.06].map((latitude) => heartSurface(contour, latitude));
  }).flat();

  function heartScreenEdges(points) {
    const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y);
    const half = (ordered) => {
      const outline = [];
      for (const point of ordered) {
        while (outline.length >= 2) {
          const first = outline[outline.length - 2];
          const last = outline[outline.length - 1];
          const cross = (last.x - first.x) * (point.y - last.y) - (last.y - first.y) * (point.x - last.x);
          if (cross > 0) break;
          outline.pop();
        }
        outline.push(point);
      }
      return outline.slice(0, -1);
    };
    const outline = half(sorted).concat(half(sorted.reverse()));
    return outline.map((point, index) => {
      const next = outline[(index + 1) % outline.length];
      const x = next.x - point.x;
      const y = next.y - point.y;
      const length = Math.hypot(x, y);
      return { x: point.x, y: point.y, nx: -y / length, ny: x / length };
    });
  }

  function heartCardClearance(card, edges) {
    let clearance = Infinity;
    for (const edge of edges) {
      const center = (card.x - edge.x) * edge.nx + (card.y - edge.y) * edge.ny;
      const halfWidth = Math.abs(card.uX * edge.nx + card.uY * edge.ny) * card.w / 2;
      const halfHeight = Math.abs(card.vX * edge.nx + card.vY * edge.ny) * card.h / 2;
      clearance = Math.min(clearance, center - halfWidth - halfHeight);
    }
    return clearance;
  }

  const treeBranches = [
    { width: 4.8, points: [[0, -0.86, 0], [-0.12, -0.48, 0], [0.13, -0.21, 0.01], [-0.04, 0.29, 0]] },
    { width: 2.5, points: [[-0.01, -0.32, 0], [-0.16, -0.14, -0.08], [-0.63, -0.21, -0.22], [-0.84, 0.24, -0.31]] },
    { width: 2.6, points: [[0.02, -0.32, 0], [0.21, -0.09, 0.13], [0.66, -0.19, 0.31], [0.85, 0.26, 0.45]] },
    { width: 1.8, points: [[0.025, -0.09, 0], [-0.18, 0.10, -0.16], [-0.44, 0.19, -0.42], [-0.49, 0.56, -0.62]] },
    { width: 1.7, points: [[0.05, 0.02, 0], [0.12, 0.28, 0.17], [0.45, 0.34, 0.33], [0.53, 0.58, 0.48]] },
    { width: 1.5, points: [[0.00, -0.76, 0], [-0.08, -0.83, 0.02], [-0.23, -0.85, 0.1], [-0.33, -0.89, 0.12]] },
    { width: 1.7, points: [[0.00, -0.78, 0], [0.09, -0.81, 0.04], [0.22, -0.85, 0.17], [0.33, -0.87, 0.22]] },
    { width: 1, points: [[0.01, -0.79, 0], [0.04, -0.83, -0.05], [0.11, -0.87, -0.19], [0.19, -0.88, -0.27]] },
  ].map(({ width, points }) => ({ width, points: points.map(([x, y, z]) => ({ x, y, z })) }));
  const treeRootOrbit = Array.from({ length: 65 }, (_, index) => {
    const angle = index / 64 * TAU;
    return { x: Math.cos(angle) * 0.54, y: -0.89 + Math.sin(angle) * 0.039, z: Math.sin(angle) * 0.48 };
  });

  function heartPosition(index, count) {
    const rimCount = count < 12 ? 0 : Math.round(count * 0.30);
    const faceTotal = count - rimCount;
    if (index >= faceTotal) {
      const rimIndex = index - faceTotal;
      const side = rimIndex % 2;
      const row = Math.floor(rimIndex / 2);
      const rows = Math.ceil((rimCount - side) / 2);
      const fraction = 0.174 + (row + 0.53) / rows * 0.249;
      const latitude = [0.31, -0.31, 0.03][row % 3] + Math.sin(row * GOLDEN_ANGLE) * 0.045;
      const point = heartSurface(heartContour(side ? 1 - fraction : fraction), latitude);
      return mountHeartPhoto(point, 0.018);
    }
    const back = index % 2;
    const slot = Math.floor(index / 2);
    const faceCount = Math.ceil((faceTotal - back) / 2);
    const outline = Math.min(faceCount, Math.max(5, Math.round(faceCount * 0.60)));
    const interior = slot - outline;
    const outside = interior < 0;
    const fraction = outside ? 0.049 + (slot + 0.41 + back * 0.20) / outline * 0.902
      : interior * 0.381966 + back * 0.14;
    const radius = outside ? 0.755 + Math.sin(slot * GOLDEN_ANGLE) * 0.031
      : 0.15 + Math.sqrt((interior + 0.28) / (faceCount - outline)) * 0.46;
    const flank = outside ? Math.max(0, 1 - Math.abs(Math.min(fraction, 1 - fraction) - 0.265) / 0.15) * 0.083 : 0;
    const point = heartSurface(heartContour(fraction), Math.acos(radius + flank) * (back ? -1 : 1));
    return mountHeartPhoto(point, 0.025);
  }

  function mountHeartPhoto(point, lift) {
    return {
      x: point.x + point.normal.x * lift,
      y: point.y + point.normal.y * lift,
      z: point.z + point.normal.z * lift,
      normal: point.normal,
    };
  }

  function treePosition(index, count) {
    const frontCount = Math.min(count, Math.max(10, Math.round(count * 0.65)));
    const rear = index >= frontCount;
    const layerIndex = rear ? index - frontCount : index;
    const layerCount = rear ? count - frontCount : frontCount;
    const tiers = [0.18, 0.50, 0.81, 1].map((share) => Math.round(layerCount * share));
    const tier = tiers.findIndex((end) => layerIndex < end);
    const start = tier > 0 ? tiers[tier - 1] : 0;
    const size = tiers[tier] - start;
    const spread = size === 1 ? 0 : (layerIndex - start) / (size - 1) * 2 - 1;
    const width = [0.62, 0.94, 0.83, 0.46][tier];
    const depth = (rear ? -0.70 : 0.24) + Math.cos(index * GOLDEN_ANGLE) * 0.34;
    return {
      x: spread * width * (rear ? 0.95 : 1) + Math.sin(index * GOLDEN_ANGLE) * 0.065,
      y: -0.26 + tier * 0.29 - Math.abs(spread) ** 1.7 * 0.08 + Math.sin(index * 1.8) * 0.043 + (rear ? 0.14 : 0),
      z: depth,
    };
  }

  function fireworkPosition(index, count) {
    const outerCount = Math.min(count, Math.max(7, Math.round(count * 0.54)));
    const middleEnd = Math.min(count, Math.max(outerCount, Math.round(count * 0.83)));
    const ring = index < outerCount ? 0 : index < middleEnd ? 1 : 2;
    const starts = [0, outerCount, middleEnd];
    const ends = [outerCount, middleEnd, count];
    const fraction = (index - starts[ring] + ring * 0.36) / (ends[ring] - starts[ring]);
    const angle = fraction * TAU - Math.PI / 2;
    const radius = [0.98, 0.67, 0.35][ring] + Math.sin(index * GOLDEN_ANGLE) * 0.065;
    const depth = [0.04, -0.59, 0.54][ring] + Math.cos(angle * 2 + ring) * 0.45;
    return { x: Math.cos(angle) * radius * 1.13, y: Math.sin(angle) * radius * 0.87, z: depth };
  }

  const SHAPES = {
    galaxy: galaxyPosition, heart: heartPosition, tree: treePosition, fireworks: fireworkPosition,
  };

  const lerp = (from, to, amount) => from + (to - from) * amount;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
  const blend = (from, to, amount) => ({
    x: lerp(from.x, to.x, amount), y: lerp(from.y, to.y, amount), z: lerp(from.z, to.z, amount),
  });

  function latticeValue(x, y, seed) {
    let value = Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801) ^ seed;
    value = Math.imul(value ^ (value >>> 15), 2246822519);
    return ((value ^ (value >>> 13)) >>> 0) / 4294967295;
  }

  function fieldNoise(x, y, seed) {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const fractionX = x - left;
    const fractionY = y - top;
    const smoothX = fractionX * fractionX * (3 - 2 * fractionX);
    const smoothY = fractionY * fractionY * (3 - 2 * fractionY);
    const first = lerp(latticeValue(left, top, seed), latticeValue(left + 1, top, seed), smoothX);
    const second = lerp(latticeValue(left, top + 1, seed), latticeValue(left + 1, top + 1, seed), smoothX);
    return lerp(first, second, smoothY);
  }

  // Bake cloud grain once so the moving nebula is a set of inexpensive sprites.
  function nebulaTexture(seed, dark, light) {
    const size = 128;
    const texture = document.createElement("canvas");
    texture.width = size;
    texture.height = size;
    const surface = texture.getContext("2d");
    const pixels = surface.createImageData(size, size);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const x = (column + 0.5) / size * 2 - 1;
        const y = (row + 0.5) / size * 2 - 1;
        const envelope = Math.max(0, 1 - x * x - y * y);
        if (!envelope) continue;
        const warp = fieldNoise(x * 2.3 + 4.1, y * 2.9 - 2.7, seed);
        const broad = fieldNoise(x * 3.2 + warp * 1.5, y * 5.5 + warp * 2.1, seed + 11);
        const wisps = fieldNoise(x * 6.4 - warp * 1.8, y * 12.1 + broad * 1.3, seed + 29);
        const grain = fieldNoise(x * 21.4, y * 23.9 + warp * 3, seed + 47);
        const density = clamp((broad * 0.61 + wisps * 0.29 + grain * 0.10 - 0.16) / 0.70, 0, 1);
        const brightness = clamp(density * 0.78 + wisps * 0.19, 0, 1);
        const pixel = (row * size + column) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          pixels.data[pixel + channel] = lerp(dark[channel], light[channel], brightness);
        }
        pixels.data[pixel + 3] = envelope ** 1.8 * density ** 1.24 * 218;
      }
    }
    surface.putImageData(pixels, 0, 0);
    return texture;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function drawPhotoCover(ctx, image, width, height) {
    const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * cover;
    const imageHeight = image.naturalHeight * cover;
    ctx.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
  }

  function createHeartRenderer(cloud) {
    try {
      const surface = document.createElement("canvas");
      const gl = surface.getContext("webgl", { alpha: true, antialias: true, preserveDrawingBuffer: true });
      if (!gl) return null;
      let contextLost = false;
      surface.addEventListener("webglcontextlost", () => { contextLost = true; });
      const vertexShader = `
        precision mediump float;
        attribute vec3 position;
        attribute vec3 normal;
        uniform vec4 view;
        uniform vec2 scale;
        uniform vec2 center;
        uniform float distance;
        uniform float focal;
        varying vec3 surfaceNormal;
        varying vec3 surfacePosition;
        varying vec3 bodyPosition;
        vec3 rotate(vec3 p) {
          float x = p.x * view.x + p.z * view.y;
          float z = p.z * view.x - p.x * view.y;
          return vec3(x, p.y * view.z - z * view.w, p.y * view.w + z * view.z);
        }
        void main() {
          vec3 p = rotate(position);
          float w = distance - p.z;
          gl_Position = vec4(p.xy * scale * focal + center * w, -p.z, w);
          surfaceNormal = rotate(normal);
          surfacePosition = p;
          bodyPosition = position;
        }
      `;
      const fragmentShader = `
        precision mediump float;
        uniform float distance;
        uniform sampler2D cloud;
        varying vec3 surfaceNormal;
        varying vec3 surfacePosition;
        varying vec3 bodyPosition;
        void main() {
          vec3 n = normalize(surfaceNormal);
          vec3 eye = normalize(vec3(0.0, 0.0, distance) - surfacePosition);
          vec3 key = normalize(vec3(-0.46, 0.57, 0.70));
          vec3 cool = normalize(vec3(0.63, -0.10, 0.70));
          float diffuse = max(dot(n, key), 0.0);
          float fill = max(dot(n, cool), 0.0);
          float facing = max(dot(n, eye), 0.0);
          float highlight = max(dot(n, normalize(key + eye)), 0.0);
          float reflection = 0.17 * pow(highlight, 5.0) + 0.13 * pow(highlight, 18.0);
          float rim = pow(1.0 - facing, 2.6);
          vec3 glass = mix(vec3(0.224, 0.076, 0.170), vec3(0.555, 0.237, 0.375),
            smoothstep(-0.77, 0.80, bodyPosition.y));
          vec2 veil = bodyPosition.xy * vec2(0.41, 0.49) + vec2(0.49, 0.52)
            + bodyPosition.z * vec2(0.24, -0.12);
          vec2 deepVeil = bodyPosition.zy * vec2(0.76, 0.46) + vec2(0.48, 0.52)
            + bodyPosition.x * vec2(0.13, 0.16);
          vec4 dust = texture2D(cloud, veil);
          vec4 deepDust = texture2D(cloud, deepVeil);
          vec3 vapor = dust.rgb * dust.a * 0.68 + deepDust.rgb * deepDust.a * 0.36;
          vec3 color = glass * (0.59 + 0.53 * diffuse);
          color += vec3(0.107, 0.061, 0.135) * fill;
          color += vec3(1.0, 0.725, 0.796) * reflection;
          color += vapor * (0.60 + facing * 0.17);
          color += mix(vec3(0.46, 0.22, 0.31), vec3(0.25, 0.116, 0.233), fill) * rim;
          float rimLight = smoothstep(0.035, 0.22, facing) * (1.0 - smoothstep(0.20, 0.66, facing));
          color += vec3(0.31, 0.14, 0.22) * rimLight;
          vec3 shade = vec3(1.0) - clamp(color, 0.0, 1.0);
          color = vec3(1.0) - shade * shade * shade * vec3(0.42, 0.56, 0.49);
          float opacity = 0.017 + 0.552 * smoothstep(0.012, 0.36, facing) + 0.085 * rimLight;
          gl_FragColor = vec4(color * opacity, opacity);
        }
      `;
      const program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, fragmentShader]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
      gl.useProgram(program);
      const mesh = heartMesh(128, 30);
      const values = new Float32Array(mesh.vertices.flatMap(({ x, y, z, normal }) => [x, y, z, normal.x, normal.y, normal.z]));
      const indices = new Uint16Array(mesh.faces.flatMap(({ corners: [a, b, c, d] }) => [a, b, c, a, c, d]));
      const attributes = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, attributes);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
      ["position", "normal"].forEach((name, index) => {
        const attribute = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 24, index * 12);
      });
      const triangles = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangles);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cloud);
      gl.uniform1i(gl.getUniformLocation(program, "cloud"), 0);
      const locations = Object.fromEntries(["view", "scale", "center", "distance", "focal"]
        .map((name) => [name, gl.getUniformLocation(program, name)]));

      return ({ width, height, ratio, scaleX, scaleY, centerX, centerY, view, distance, focal }) => {
        if (contextLost || gl.isContextLost()) return null;
        const resolution = Math.min(1.35, ratio);
        const pixelWidth = Math.max(1, Math.round(width * resolution));
        const pixelHeight = Math.max(1, Math.round(height * resolution));
        if (surface.width !== pixelWidth || surface.height !== pixelHeight) {
          surface.width = pixelWidth;
          surface.height = pixelHeight;
          gl.viewport(0, 0, pixelWidth, pixelHeight);
        }
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform4fv(locations.view, view);
        gl.uniform2f(locations.scale, 2 * scaleX / width, 2 * scaleY / height);
        gl.uniform2f(locations.center, 2 * centerX / width - 1, 1 - 2 * centerY / height);
        gl.uniform1f(locations.distance, distance);
        gl.uniform1f(locations.focal, focal);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        return surface;
      };
    } catch {
      return null;
    }
  }

  window.createStarScene = ({ canvas, onPhoto, onZoomChange }) => {
    const ctx = canvas.getContext("2d");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let mode = "galaxy";
    let records = [];
    let projected = [];
    let width = 0;
    let height = 0;
    let ratio = 1;
    let scale = 1;
    let baseScaleX = 1;
    let baseScaleY = 1;
    let scaleX = 1;
    let scaleY = 1;
    let centerX = 0;
    let centerY = 0;
    let yaw = HOME_YAW;
    let pitch = HOME_PITCH;
    let goalYaw = HOME_YAW;
    let goalPitch = HOME_PITCH;
    let zoom = 1;
    let goalZoom = 1;
    let projectionDistance = CAMERA_DISTANCE;
    let projectionFocal = CAMERA_DISTANCE;
    let cosYaw = 1;
    let sinYaw = 0;
    let cosPitch = 1;
    let sinPitch = 0;
    let morph = 1;
    let elapsed = 0;
    let burstAt = -Infinity;
    let frame = 0;
    let previousTime = 0;
    let paused = false;
    let hasShownPhotos = false;
    let introducing = false;
    let nebulaTextures;
    let renderHeart;
    let fallbackHeart;
    let heartCloud;
    let heartFallbackLayer;
    let rearHeartLayer;
    let treeRig;
    let treeOnCanvas = false;
    let pointer = null;
    let drag = null;
    let pinch = null;
    const activeTouches = new Map();
    let keyboardIndex = -1;

    let seed = 287390;
    function random() {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    const stars = Array.from({ length: 148 }, (_, index) => ({
      x: random(), y: random(), size: 0.28 + random() ** 2 * 1.2,
      phase: random() * TAU, alpha: 0.14 + random() * 0.63, cross: index % 19 === 0,
    }));

    const orbitStars = Array.from({ length: 78 }, () => ({
      angle: random() * TAU, radius: 1.01 + random() * 0.86, height: (random() - 0.5) * 2.4,
      size: 0.35 + random() * 0.9, phase: random() * TAU, glint: random() < 0.15,
    }));

    // Keep the fireworks and galaxy patterns stable when other effects change.
    seed = 3278261922;

    const mainBursts = [
      { origin: { x: 0.03, y: 0.12, z: 0.44 }, delay: 0.23, spread: 1.20, count: 104,
        colors: ["#fff3cf", "#ffbfdb", "#ed74b5", "#ffad8e"], gravity: 0.14 },
      { origin: { x: -0.91, y: 0.28, z: -0.68 }, delay: 0.48, spread: 0.86, count: 74,
        colors: ["#c1efff", "#82bfff", "#9b91ff", "#eee2ff"], gravity: 0.10 },
      { origin: { x: 0.93, y: 0.32, z: -0.25 }, delay: 0.75, spread: 0.91, count: 82,
        colors: ["#fff6d5", "#ffcb83", "#ffd49c", "#ffa076"], gravity: 0.12 },
      { origin: { x: -0.53, y: -0.15, z: 0.34 }, delay: 1.21, spread: 0.79, count: 62,
        colors: ["#eac9ff", "#aa94ff", "#ff83c4", "#fff0d9"], gravity: 0.15 },
      { origin: { x: 0.42, y: 0.19, z: 0.28 }, delay: 1.69, spread: 1.16, count: 116,
        colors: ["#fff8db", "#ffc984", "#ffa6d2", "#adcdff"], gravity: 0.20 },
    ].map((burst) => ({ ...burst, sparks: makeSparks(burst, false) }));

    const secondaryBursts = mainBursts.flatMap((burst, index) => {
      const count = index === mainBursts.length - 1 ? 3 : 2;
      return Array.from({ length: count }, (_, slot) => {
        const spark = burst.sparks[(slot * 41 + index * 13 + 7) % burst.sparks.length];
        const duration = 0.50 + slot * 0.13 + random() * 0.09;
        const pop = {
          origin: sparkPosition(burst, spark, duration),
          delay: burst.delay + duration,
          spread: 0.24 + random() * 0.15,
          count: 13,
          colors: ["#fff9e7", burst.colors[(slot + 1) % burst.colors.length], "#f5d8ff"],
          gravity: 0.10,
          secondary: true,
        };
        return { ...pop, sparks: makeSparks(pop, true) };
      });
    });
    const fireworkBursts = [...mainBursts, ...secondaryBursts];

    // The galaxy texture is independent of the number of fireworks particles.
    seed = 3090411090;
    const galaxyClouds = Array.from({ length: 22 }, (_, index) => {
      const arm = index % 2;
      const progress = 0.08 + Math.floor(index / 2) * 0.087;
      const lane = (random() - 0.5) * 0.21;
      const elevation = (random() - 0.5) * 0.45;
      return {
        point: galaxyPoint(progress, arm, lane, elevation),
        tangent: galaxyPoint(progress + 0.025, arm, lane, elevation),
        size: 0.30 + progress * 0.12 + random() * 0.073,
        alpha: 0.48 + random() * 0.22,
        texture: arm === 0 ? index % 4 === 0 ? 0 : 3 : index % 5 === 0 ? 2 : 1,
      };
    });

    const galaxyColors = ["#a5baff", "#d3c5ff", "#8bafff", "#f5acd9", "#fff1df", "#fcdaaf"];
    const galaxyDust = Array.from({ length: 658 }, (_, index) => ({
      zone: index < 76 ? "core" : index < 524 ? "arm" : "halo",
      arm: index % 2,
      progress: random() ** 1.19,
      lane: (random() + random() - 1) * 0.46,
      elevation: (random() + random() - 1) * 0.57,
      angle: random() * TAU,
      radius: Math.sqrt(random()),
      speed: 0.004 + random() * 0.010,
      size: 0.34 + random() ** 2 * 1.37,
      phase: random() * TAU,
      color: galaxyColors[index % galaxyColors.length],
      glint: index % 31 === 0,
    }));

    function requestFrame() {
      if (!frame) frame = requestAnimationFrame(drawFrame);
    }

    function measure() {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      centerX = width / 2;
      centerY = height * 0.49;
      baseScaleX = Math.min(width * 0.45, height * 0.66);
      baseScaleY = height * 0.453;
      requestFrame();
    }

    function rotate(point) {
      const x = point.x * cosYaw + point.z * sinYaw;
      const rotatedZ = point.z * cosYaw - point.x * sinYaw;
      const y = point.y * cosPitch - rotatedZ * sinPitch;
      const z = point.y * sinPitch + rotatedZ * cosPitch;
      return { x, y, z };
    }

    // Rotate the model in world space and project using a perspective camera.
    function project(point) {
      const { x, y, z } = rotate(point);
      const perspective = projectionFocal / (projectionDistance - z);
      return {
        x: centerX + x * scaleX * perspective, y: centerY - y * scaleY * perspective,
        cameraX: x, cameraY: y, z, perspective,
      };
    }

    function faceVisibility(normal, point) {
      const eyeZ = projectionDistance - point.z;
      const eyeLength = Math.hypot(point.cameraX, point.cameraY, eyeZ);
      return (-normal.x * point.cameraX - normal.y * point.cameraY + normal.z * eyeZ) / eyeLength;
    }

    function currentPosition(record) {
      return blend(record.from, record.to, transitionAmount());
    }

    function transitionAmount() {
      return morph * morph * (3 - 2 * morph);
    }

    function currentPhotoScale(record) {
      return lerp(record.fromSize, record.toSize, transitionAmount());
    }

    function targetPosition(shape, index, count) {
      return shape === "tree" && treeRig ? treeRig.position(index) : SHAPES[shape](index, count);
    }

    function targetPhotoScale(shape, index, count) {
      if (shape === "tree" && treeRig) return .86 + (index % 6 === 0 ? .14 : 0) + .09 * Math.sin(index * 2.31);
      return photoScale(index, count, shape);
    }

    function projectCards(viewYaw) {
      const isTree = mode === "tree" && Boolean(treeRig);
      const compact = width < 600;
      centerY = height * (isTree ? (compact ? .51 : .55) : .49);
      scaleX = baseScaleX;
      scaleY = baseScaleY;
      if (mode === "heart") {
        const heartScale = Math.min(scaleX / 1.12, scaleY) * 0.98;
        scaleX = heartScale * 1.12;
        scaleY = heartScale;
      } else if (isTree) {
        scaleX = scaleY = Math.min(width * .44, height * .548);
      }
      scale = Math.sqrt(scaleX * scaleY);
      if (!scale) return [];

      const density = isTree ? Math.pow(30 / Math.max(20, records.length), .31) : Math.pow(20 / Math.max(12, records.length), .25);
      const cardSize = clamp(scale * (isTree ? .245 : .275) * density, isTree ? 14 : 22, 84);
      const padding = compact ? 11 : 16;
      const limitX = Math.max(1, centerX - padding);
      const limitY = Math.max(1, Math.min(centerY, height - centerY) - padding);
      const heroCount = mode === "galaxy" ? galaxyHeroCount(records.length) : 0;
      const heartReveal = mode === "heart" ? clamp((morph - 0.20) / 0.65, 0, 1) : 0;
      let heartOutline;
      let fit = 1;
      const treeTop = centerY - padding;
      const treeBottom = height - centerY - (compact ? 48 : 26);

      // Keep the extended tips and roots in the neutral frame, with room
      // below the tree for the mobile zoom controls.
      function fitTreePoint(point, extentX = 0, extentY = 0) {
        const neutralScale = CAMERA_DISTANCE / (CAMERA_DISTANCE - point.z) / point.perspective;
        fit = Math.min(fit,
          limitX / Math.max(1, (Math.abs(point.x - centerX) + extentX) * neutralScale),
          treeTop / Math.max(1, (centerY - point.y + extentY) * neutralScale),
          treeBottom / Math.max(1, (point.y - centerY + extentY) * neutralScale));
      }
      if (isTree) treeRig.fitPoints.forEach((point) => fitTreePoint(project(point)));

      if (mode === "heart") {
        heartOutline = heartFitPoints.map(project);
        for (const point of heartOutline) {
          fit = Math.min(fit, limitX / Math.abs(point.x - centerX), limitY / Math.abs(point.y - centerY));
        }
      }

      const cards = records.map((record, index) => {
        const position = currentPosition(record);
        const settling = isTree ? transitionAmount() : 0;
        position.y += Math.sin(elapsed * 0.94 + index * 0.91) * 0.015 * (1 - settling);
        // Hold the photos just in front of their branch tips, even as the tree turns.
        position.x -= sinYaw * .106 * settling;
        position.z += cosYaw * .106 * settling;
        const point = project(position);
        const featured = index < heroCount;
        const scaleLimit = compact ? 1.36 : Infinity;
        const w = cardSize * point.perspective * Math.min(currentPhotoScale(record), scaleLimit);
        const h = w * 0.73;

        // Local photo plane axes follow the derivative of the camera projection.
        let planeYaw = record.tiltYaw + Math.sin(viewYaw + record.angle) * 0.31;
        let planePitch = record.tiltPitch + pitch * 0.34;
        planeYaw *= 1 - .71 * settling;
        planePitch *= 1 - .66 * settling;
        let visibility = 1;
        let rearVisibility = 0;
        if (heartReveal && record.to.normal) {
          const normal = rotate(record.to.normal);
          const facing = faceVisibility(normal, point);
          visibility = lerp(1, clamp((facing - 0.15) / 0.28, 0, 1), heartReveal);
          rearVisibility = 0.49 * clamp((-facing - 0.17) / 0.40, 0, 1) * heartReveal;
          const direction = facing < 0 ? -1 : 1;
          const angle = Math.max(0.10, normal.z * direction);
          const alignment = heartReveal * clamp(Math.abs(facing) / 0.27, 0, 1);
          planeYaw = lerp(planeYaw, clamp(-Math.atan2(normal.x * direction, angle), -0.82, 0.82), alignment * 0.76);
          planePitch = lerp(planePitch, clamp(Math.atan2(normal.y * direction, angle), -0.65, 0.65), alignment * 0.72);
        }
        const depthX = Math.sin(planeYaw) / (projectionDistance - point.z);
        const depthY = Math.sin(planePitch) / (projectionDistance - point.z);
        const horizontalX = Math.cos(planeYaw) + point.cameraX * depthX;
        const horizontalY = -point.cameraY * depthX * scaleY / scaleX;
        const verticalX = point.cameraX * depthY * scaleX / scaleY;
        const verticalY = Math.cos(planePitch) - point.cameraY * depthY;
        const roll = (record.angle + Math.sin(viewYaw) * 0.115) * (1 - .48 * settling);
        const cos = Math.cos(roll);
        const sin = Math.sin(roll);
        const uX = horizontalX * cos + verticalX * sin;
        const uY = horizontalY * cos + verticalY * sin;
        const vX = verticalX * cos - horizontalX * sin;
        const vY = verticalY * cos - horizontalY * sin;

        const extentX = (Math.abs(uX) * w + Math.abs(vX) * h) / 2;
        const extentY = (Math.abs(uY) * w + Math.abs(vY) * h) / 2;
        // Fit the neutral view only. A closer camera can move cards beyond the stage.
        if (isTree) fitTreePoint(point, extentX, extentY);
        else {
          const neutralScale = CAMERA_DISTANCE / (CAMERA_DISTANCE - point.z) / point.perspective;
          fit = Math.min(fit, limitX / ((Math.abs(point.x - centerX) + extentX) * neutralScale),
            limitY / ((Math.abs(point.y - centerY) + extentY) * neutralScale));
        }
        return { ...point, w, h, uX, uY, vX, vY, featured, visibility, rearVisibility, record };
      });

      if (fit < 1) {
        scaleX *= fit;
        scaleY *= fit;
        scale *= fit;
        for (const card of cards) {
          card.x = centerX + (card.x - centerX) * fit;
          card.y = centerY + (card.y - centerY) * fit;
          card.w *= fit;
          card.h *= fit;
        }
      }
      if (heartOutline && heartReveal > 0.4) {
        const edges = heartScreenEdges(heartOutline.map((point) => ({
          x: centerX + (point.x - centerX) * fit,
          y: centerY + (point.y - centerY) * fit,
        })));
        const inset = clamp((heartReveal - 0.4) / 0.6, 0, 1);
        for (const card of cards) {
          if (card.visibility < 0.06 && card.rearVisibility < 0.06) continue;
          const clearance = heartCardClearance(card, edges);
          const safeArea = lerp(1, clamp((clearance - 1.2) / 5.4, 0, 1), inset);
          card.visibility *= safeArea;
          card.rearVisibility *= safeArea;
        }
      }
      return cards.sort((first, second) => first.z - second.z);
    }

    function paintStars(rgb) {
      const glow = ctx.createRadialGradient(centerX, centerY, scale * 0.05, centerX, centerY, scale * 1.55);
      glow.addColorStop(0, `rgba(${rgb}, .18)`);
      glow.addColorStop(0.5, `rgba(${rgb}, .071)`);
      glow.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      if (mode === "tree") return;
      for (const star of stars) {
        const alpha = star.alpha * (0.8 + Math.sin(elapsed * 1.25 + star.phase) * 0.2);
        const x = star.x * width;
        const y = star.y * height;
        ctx.fillStyle = `rgba(237, 219, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, TAU);
        ctx.fill();
        if (star.cross) {
          ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.44})`;
          ctx.fillRect(x - 3.5, y - 0.4, 7, 0.8);
          ctx.fillRect(x - 0.4, y - 3.5, 0.8, 7);
        }
      }
    }

    function paintOrbit(rgb, foreground) {
      for (const star of orbitStars) {
        const angle = star.angle + elapsed * 0.065;
        const point = project({ x: Math.cos(angle) * star.radius, y: star.height, z: Math.sin(angle) * star.radius * 0.80 });
        if ((point.z > 0.72) !== foreground) continue;
        const alpha = (foreground ? 0.30 : 0.18) + Math.sin(elapsed + star.phase) * 0.11;
        const size = star.size * point.perspective;
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, TAU);
        ctx.fill();
        if (foreground && star.glint) {
          ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.15})`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, size * 3.3, 0, TAU);
          ctx.fill();
        }
      }
    }

    function trace(points) {
      ctx.beginPath();
      points.forEach((point, index) => {
        const screen = project(point);
        if (index === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
      });
    }

    function galaxyGlow(point, span, aspect, angle, stops) {
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle);
      ctx.scale(1, aspect);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, span);
      for (const [offset, color] of stops) glow.addColorStop(offset, color);
      ctx.fillStyle = glow;
      ctx.fillRect(-span, -span, span * 2, span * 2);
      ctx.restore();
    }

    function paintGalaxy(opacity) {
      if (!nebulaTextures) {
        nebulaTextures = [
          nebulaTexture(917, [44, 63, 157], [157, 195, 255]),
          nebulaTexture(2671, [97, 38, 141], [225, 129, 237]),
          nebulaTexture(4117, [111, 55, 133], [255, 197, 171]),
          nebulaTexture(5783, [53, 49, 154], [190, 170, 255]),
        ];
      }
      const core = project({ x: 0, y: 0, z: 0.12 });
      const tangent = project(galaxyDisk(0.4, 0, 0));
      const angle = Math.atan2(tangent.y - core.y, tangent.x - core.x);
      const pulse = 1 + Math.sin(elapsed * 0.58) * 0.055;
      const magnification = core.perspective;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      galaxyGlow(core, Math.max(44, scaleX * 1.52) * magnification, 0.46, angle, [
        [0, "rgba(131, 83, 177, .30)"], [0.48, "rgba(65, 76, 166, .19)"], [1, "rgba(58, 64, 163, 0)"],
      ]);

      for (const cloud of galaxyClouds) {
        const point = project(cloud.point);
        const direction = project(cloud.tangent);
        const stretch = scale * cloud.size * point.perspective;
        ctx.save();
        ctx.globalAlpha = cloud.alpha * opacity;
        ctx.translate(point.x, point.y);
        ctx.rotate(Math.atan2(direction.y - point.y, direction.x - point.x));
        ctx.drawImage(nebulaTextures[cloud.texture], -stretch * 1.34, -stretch * 0.60, stretch * 2.68, stretch * 1.20);
        ctx.restore();
      }

      const depthCore = project({ x: 0.018, y: 0.012, z: -0.31 });
      galaxyGlow(depthCore, clamp(scale * 0.60, 34, 150) * pulse * depthCore.perspective, 0.65, angle, [
        [0, "rgba(244, 145, 240, .36)"], [0.39, "rgba(170, 111, 253, .22)"], [1, "rgba(126, 82, 234, 0)"],
      ]);
      galaxyGlow(core, clamp(scale * 0.36, 23, 100) * pulse * magnification, 0.54, angle, [
        [0, "rgba(255, 248, 231, .98)"], [0.065, "rgba(255, 227, 202, .84)"],
        [0.19, "rgba(255, 178, 204, .53)"], [0.48, "rgba(202, 129, 250, .21)"], [1, "rgba(135, 97, 240, 0)"],
      ]);
      const nearCore = project({ x: 0.007, y: -0.014, z: 0.37 });
      galaxyGlow(nearCore, clamp(scale * 0.105, 11, 30) * nearCore.perspective, 0.50, angle, [
        [0, "rgba(255, 252, 239, .92)"], [0.26, "rgba(255, 231, 195, .50)"], [1, "rgba(255, 184, 221, 0)"],
      ]);
      ctx.restore();
    }

    function drawDustPoint({ x, y, size, alpha, color, glint }) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      if (glint) {
        ctx.globalAlpha = alpha * 0.36;
        ctx.fillRect(x - size * 1.8, y - 0.33, size * 3.6, 0.66);
        ctx.fillRect(x - 0.33, y - size * 1.8, 0.66, size * 3.6);
      }
    }

    function paintGalaxyDust(opacity) {
      const foreground = [];
      for (let index = 0; index < galaxyDust.length; index += 1) {
        const star = galaxyDust[index];
        if (width < 560 && index % 4 === 0 && !star.glint) continue;
        const progress = (star.progress + elapsed * star.speed) % 1;
        let world;
        if (star.zone === "arm") {
          world = galaxyPoint(progress, star.arm, star.lane, star.elevation);
        } else {
          const radius = star.zone === "core" ? star.radius * 0.34 : 0.95 + star.radius * 0.72;
          const azimuth = star.angle + elapsed * (star.zone === "core" ? 0.024 : 0.009);
          world = galaxyDisk(Math.cos(azimuth) * radius, Math.sin(azimuth) * radius, star.elevation);
        }
        const point = project(world);
        if (point.x < -4 || point.x > width + 4 || point.y < -4 || point.y > height + 4) continue;
        const near = point.z > 0.58;
        const fade = star.zone === "arm" ? Math.min(1, progress * 11, (1 - progress) * 8) : 0.86;
        const twinkle = 0.61 + Math.sin(elapsed * 1.11 + star.phase) * 0.25;
        const alpha = opacity * fade * twinkle * (near ? 0.72 : 0.56);
        const dust = { ...point, size: star.size * point.perspective, alpha, color: star.color, glint: star.glint };
        if (near) foreground.push(dust);
        else drawDustPoint(dust);
      }
      return foreground;
    }

    function paintTree(rgb) {
      const foot = project({ x: 0, y: -0.88, z: 0 });
      const tip = project({ x: 0, y: 0.72, z: 0 });
      const glow = ctx.createLinearGradient(foot.x, foot.y, tip.x, tip.y);
      glow.addColorStop(0, `rgba(${rgb}, .56)`);
      glow.addColorStop(0.47, `rgba(${rgb}, .96)`);
      glow.addColorStop(1, "rgba(255, 226, 169, .56)");
      ctx.strokeStyle = glow;
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(${rgb}, .9)`;
      ctx.shadowBlur = 11;
      for (const branch of treeBranches) {
        const [start, first, second, end] = branch.points.map(project);
        ctx.lineWidth = branch.width;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(first.x, first.y, second.x, second.y, end.x, end.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 5;
      ctx.lineWidth = 0.95;
      for (const record of records) {
        const position = currentPosition(record);
        const trunkY = Math.max(-0.36, position.y - 0.55);
        const start = project({ x: 0, y: trunkY, z: 0 });
        const first = project({ x: position.x * 0.30, y: trunkY + 0.24, z: position.z * 0.2 });
        const second = project({ x: position.x * 0.74, y: position.y - 0.26, z: position.z * 0.72 });
        const end = project(position);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.bezierCurveTo(first.x, first.y, second.x, second.y, end.x, end.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      trace(treeRootOrbit);
      ctx.strokeStyle = `rgba(${rgb}, .28)`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      for (let index = 0; index < 24; index += 1) {
        const angle = index * 2.399963;
        const radius = 0.7 + (index % 5) * 0.074;
        const point = project({ x: Math.cos(angle) * radius, y: 0.20 + Math.sin(angle) * radius * 0.61, z: Math.cos(index) * 0.58 });
        const alpha = 0.37 + Math.sin(elapsed * 1.5 + index) * 0.23;
        ctx.fillStyle = `rgba(255, 226, 170, ${alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, (index % 4 === 0 ? 1.6 : 0.75) * point.perspective, 0, TAU);
        ctx.fill();
      }
    }

    function makeSparks(burst, short) {
      return Array.from({ length: burst.count }, (_, index) => {
        const angle = index / burst.count * TAU + (random() - 0.5) * 0.12;
        const depth = (random() - 0.5) * 1.55;
        const plane = Math.sqrt(1 - depth * depth);
        const radius = burst.spread * (0.71 + random() * 0.39) * (index % 5 === 0 ? 0.61 : 1);
        return {
          x: Math.cos(angle) * radius * plane,
          y: Math.sin(angle) * radius * plane * 0.85,
          z: depth * radius,
          life: (short ? 0.60 : 1.20) + random() * (short ? 0.44 : 0.94),
          phase: random() * TAU,
          color: burst.colors[index % burst.colors.length],
        };
      });
    }

    function sparkPosition(burst, spark, age) {
      const flight = 1 - Math.exp(-age * 2.28);
      return {
        x: burst.origin.x + spark.x * flight,
        y: burst.origin.y + spark.y * flight - age * age * burst.gravity,
        z: burst.origin.z + spark.z * flight,
      };
    }

    function paintFireworks(rgb) {
      const sceneAlpha = ctx.globalAlpha;
      const center = project({ x: 0, y: 0, z: 0 });
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = `rgba(${rgb}, .12)`;
      ctx.beginPath();
      for (const record of records) {
        const point = project(currentPosition(record));
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const staticFrame = reducedMotion.matches;
      for (const [index, burst] of fireworkBursts.entries()) {
        const age = staticFrame ? (burst.secondary ? 0.24 : 0.42 + index * 0.039) : elapsed - burstAt - burst.delay;
        if (age < 0) {
          if (burst.secondary || age < -0.27) continue;
          const step = -age / 0.27;
          const head = project({ ...burst.origin, y: burst.origin.y - step * 0.83 });
          const tail = project({ ...burst.origin, y: burst.origin.y - Math.min(1, step + 0.29) * 0.83 });
          ctx.globalAlpha = sceneAlpha * (1 - step) * 0.76;
          ctx.strokeStyle = burst.colors[0];
          ctx.lineWidth = 1.65;
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(head.x, head.y);
          ctx.stroke();
          continue;
        }

        if (!burst.secondary && age < 1.28) {
          const point = project(burst.origin);
          const radius = Math.max(22, scale * burst.spread * 0.77) * point.perspective;
          const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
          glow.addColorStop(0, burst.colors[1]);
          glow.addColorStop(0.35, burst.colors[2] + "99");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.globalAlpha = sceneAlpha * (staticFrame ? 0.25 : 0.43 * (1 - age / 1.28));
          ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
        }

        if (age < 0.24) {
          const point = project(burst.origin);
          const radius = (burst.secondary ? 4 + age * 53 : 12 + age * 127) * point.perspective;
          const flash = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
          flash.addColorStop(0, "#fff6ee");
          flash.addColorStop(0.22, burst.colors[0]);
          flash.addColorStop(0.46, burst.colors[1]);
          flash.addColorStop(1, "transparent");
          ctx.fillStyle = flash;
          ctx.globalAlpha = sceneAlpha * (1 - age / 0.24) * (burst.secondary ? 0.44 : 0.84);
          ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
        }

        for (let slot = 0; slot < burst.sparks.length; slot += 1) {
          if (width < 560 && slot % 3 === 2) continue;
          const spark = burst.sparks[slot];
          if (age >= spark.life) {
            if (burst.secondary || slot % 11 !== 0) continue;
            const ember = project(sparkPosition(burst, spark, 0.73));
            ctx.globalAlpha = sceneAlpha * (0.13 + Math.sin(elapsed * 2.1 + spark.phase) * 0.075);
            ctx.fillStyle = spark.color;
            ctx.fillRect(ember.x, ember.y, 1.3, 1.3);
            continue;
          }
          const head = project(sparkPosition(burst, spark, age));
          const middle = project(sparkPosition(burst, spark, Math.max(0, age - 0.092)));
          const tail = project(sparkPosition(burst, spark, Math.max(0, age - (burst.secondary ? 0.15 : 0.28))));
          const fade = (1 - age / spark.life) ** 0.67;
          const twinkle = 0.68 + 0.32 * Math.sin(age * 11 + spark.phase) ** 2;
          const alpha = sceneAlpha * fade * (staticFrame ? 0.86 : 1);
          ctx.strokeStyle = spark.color;
          ctx.lineCap = "round";
          if (width >= 560 || slot % 2 === 0) {
            ctx.globalAlpha = alpha * 0.43;
            ctx.lineWidth = 0.78 * head.perspective;
            ctx.beginPath();
            ctx.moveTo(tail.x, tail.y);
            ctx.lineTo(middle.x, middle.y);
            ctx.stroke();
          }
          ctx.globalAlpha = alpha * twinkle * 0.98;
          ctx.lineWidth = (slot % 6 === 0 ? 1.78 : 1.14) * head.perspective;
          ctx.beginPath();
          ctx.moveTo(middle.x, middle.y);
          ctx.lineTo(head.x, head.y);
          ctx.stroke();
          const tip = (slot % 7 === 0 ? 3.05 : 1.62) * head.perspective;
          ctx.fillStyle = slot % 7 === 0 ? "#fff9ec" : spark.color;
          ctx.fillRect(head.x - tip / 2, head.y - tip / 2, tip, tip);
          if (slot % 17 === 0) {
            ctx.globalAlpha = alpha * 0.52;
            ctx.fillRect(head.x - tip * 1.48, head.y - 0.38, tip * 2.96, 0.76);
            ctx.fillRect(head.x - 0.38, head.y - tip * 1.48, 0.76, tip * 2.96);
          }
        }
      }
      ctx.restore();
    }

    function heartCloudTexture() {
      if (!heartCloud) heartCloud = nebulaTexture(7713, [94, 41, 68], [241, 142, 171]);
      return heartCloud;
    }

    function paintHeartFallback() {
      if (!fallbackHeart) fallbackHeart = heartMesh(86, 20);
      if (!heartFallbackLayer) heartFallbackLayer = document.createElement("canvas");
      const ctx = heartFallbackLayer.getContext("2d");
      if (!ctx) return null;
      const resolution = Math.min(ratio, 1.24);
      const pixelWidth = Math.max(1, Math.round(width * resolution));
      const pixelHeight = Math.max(1, Math.round(height * resolution));
      if (heartFallbackLayer.width !== pixelWidth || heartFallbackLayer.height !== pixelHeight) {
        heartFallbackLayer.width = pixelWidth;
        heartFallbackLayer.height = pixelHeight;
      }
      ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const vertices = fallbackHeart.vertices.map(project);
      let glowX = 0;
      let glowY = 0;
      let weightSum = 0;
      ctx.save();
      ctx.beginPath();
      for (const face of fallbackHeart.faces) {
        const [a, b, c, d] = face.corners.map((index) => vertices[index]);
        const point = {
          cameraX: (a.cameraX + b.cameraX + c.cameraX + d.cameraX) / 4,
          cameraY: (a.cameraY + b.cameraY + c.cameraY + d.cameraY) / 4,
          z: (a.z + b.z + c.z + d.z) / 4,
        };
        const normal = rotate(face.normal);
        if (faceVisibility(normal, point) <= 0) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        const sheen = Math.max(0, -0.29 * normal.x + 0.36 * normal.y + 0.89 * normal.z);
        const area = Math.abs((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x));
        const weight = sheen ** 18 * area;
        glowX += (a.x + b.x + c.x + d.x) / 4 * weight;
        glowY += (a.y + b.y + c.y + d.y) / 4 * weight;
        weightSum += weight;
      }
      ctx.clip();
      const material = ctx.createLinearGradient(centerX, centerY - scaleY, centerX, centerY + scaleY);
      material.addColorStop(0, "#ffc0d8");
      material.addColorStop(0.41, "#ffaacf");
      material.addColorStop(0.73, "#e28fb9");
      material.addColorStop(1, "#b56e96");
      ctx.fillStyle = material;
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 0.55;
      ctx.drawImage(heartCloudTexture(), centerX - scaleX * (0.85 - sinYaw * 0.09),
        centerY - scaleY * 0.84, scaleX * 1.7, scaleY * 1.66);
      ctx.globalAlpha = 1;

      const shadowX = centerX + scaleX * 0.39;
      const shadowY = centerY + scaleY * 0.45;
      const shadow = ctx.createRadialGradient(shadowX, shadowY, 0, shadowX, shadowY, scale * 0.97);
      shadow.addColorStop(0, "rgba(51, 24, 67, .24)");
      shadow.addColorStop(1, "rgba(51, 24, 67, 0)");
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, width, height);

      const hotX = weightSum ? glowX / weightSum : centerX - scaleX * 0.25;
      const hotY = weightSum ? glowY / weightSum : centerY - scaleY * 0.25;
      const highlight = ctx.createRadialGradient(hotX, hotY, 0, hotX, hotY, scale * 0.68);
      highlight.addColorStop(0, "rgba(255, 193, 218, .75)");
      highlight.addColorStop(0.26, "rgba(246, 151, 192, .57)");
      highlight.addColorStop(0.64, "rgba(186, 85, 142, .22)");
      highlight.addColorStop(1, "rgba(186, 85, 142, 0)");
      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return heartFallbackLayer;
    }

    function paintHeartGlow(opacity) {
      const radiusX = scaleX * 1.16 * Math.hypot(cosYaw, sinYaw * 0.64);
      const radiusY = scaleY * 1.13;
      ctx.save();
      ctx.translate(centerX, centerY - scaleY * 0.04);
      ctx.scale(radiusX, radiusY);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      glow.addColorStop(0, "rgba(255, 169, 199, .65)");
      glow.addColorStop(0.58, "rgba(255, 139, 185, .49)");
      glow.addColorStop(0.78, "rgba(244, 107, 161, .10)");
      glow.addColorStop(1, "rgba(244, 107, 161, 0)");
      ctx.globalAlpha = opacity;
      ctx.fillStyle = glow;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    function paintRearHeartPhotos() {
      if (!projected.some((card) => card.rearVisibility >= 0.06)) return;
      if (!rearHeartLayer) rearHeartLayer = document.createElement("canvas");
      const rear = rearHeartLayer.getContext("2d");
      if (!rear) return;
      const resolution = 0.60;
      const pixelWidth = Math.max(1, Math.round(width * resolution));
      const pixelHeight = Math.max(1, Math.round(height * resolution));
      if (rearHeartLayer.width !== pixelWidth || rearHeartLayer.height !== pixelHeight) {
        rearHeartLayer.width = pixelWidth;
        rearHeartLayer.height = pixelHeight;
      }
      rear.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      rear.clearRect(0, 0, width, height);
      for (const card of projected) {
        const { x, y, w, h, uX, uY, vX, vY, rearVisibility, record } = card;
        const image = record.image;
        if (rearVisibility < 0.06 || !image.complete || !image.naturalWidth) continue;
        rear.save();
        rear.transform(uX, uY, vX, vY, x, y);
        rear.globalAlpha = rearVisibility;
        roundedRect(rear, -w / 2, -h / 2, w, h, Math.max(2, w * 0.075));
        rear.clip();
        drawPhotoCover(rear, image, w, h);
        rear.restore();
      }
      ctx.drawImage(rearHeartLayer, 0, 0, width, height);
    }

    function paintHeart() {
      const opacity = 0.17 + morph * morph * 0.83;
      if (renderHeart === undefined) renderHeart = createHeartRenderer(heartCloudTexture());
      const shaded = renderHeart?.({
        width, height, ratio, scaleX, scaleY, centerX, centerY,
        view: [cosYaw, sinYaw, cosPitch, sinPitch], distance: projectionDistance, focal: projectionFocal,
      });
      const layer = shaded ?? paintHeartFallback();
      if (!layer) return;
      ctx.globalAlpha = opacity * (shaded ? 1 : 0.57);
      if (!shaded) ctx.filter = `blur(${clamp(scale * 0.012, 1.4, 2.6)}px)`;
      ctx.drawImage(layer, 0, 0, width, height);
    }

    function drawCard(card, highlight, palette, surface = ctx) {
      const { x, y, w, h, uX, uY, vX, vY, z, featured, visibility, record } = card;
      if (visibility < 0.06) return;
      const light = clamp((z + 0.90) / 1.85, 0, 1);
      const galaxy = mode === "galaxy";
      surface.save();
      surface.transform(uX, uY, vX, vY, x, y);
      surface.globalAlpha = visibility * (highlight || featured ? 1 : lerp(galaxy ? 0.79 : 0.85, 1, light));
      const radius = Math.max(2, w * 0.078);
      const pad = Math.max(0.9, w * (galaxy && !featured ? 0.020 : 0.027));
      roundedRect(surface, -w / 2, -h / 2, w, h, radius);
      surface.shadowColor = `rgba(${palette.rgb}, ${highlight ? 0.96 : lerp(0.34, 0.65, light)})`;
      surface.shadowBlur = highlight ? 22 : featured ? 12 : lerp(3, galaxy ? 5 : 8, light);
      surface.fillStyle = highlight ? "#fff7fd" : galaxy && !featured ? `rgba(226, 214, 255, ${0.55 + light * 0.26})` : palette.edge;
      surface.fill();
      surface.shadowBlur = 0;

      const photoWidth = w - pad * 2;
      const photoHeight = h - pad * 2;
      roundedRect(surface, -photoWidth / 2, -photoHeight / 2, photoWidth, photoHeight, radius - 0.7);
      surface.clip();
      const image = record.image;
      if (image.complete && image.naturalWidth) {
        drawPhotoCover(surface, image, photoWidth, photoHeight);
      } else {
        surface.fillStyle = "#33223f";
        surface.fillRect(-w / 2, -h / 2, w, h);
        surface.fillStyle = palette.edge;
        surface.textAlign = "center";
        surface.textBaseline = "middle";
        surface.font = `${Math.max(8, w * 0.33)}px system-ui, sans-serif`;
        surface.fillText("✦", 0, 1);
      }
      surface.restore();
    }

    function drawPhotoLabel(card, palette) {
      const title = card?.record.photo.title?.trim();
      if (!title || width < 80 || height < 60) return;
      const fontSize = width < 500 ? 11 : 12;
      const horizontalPadding = 9;
      const labelHeight = 24;
      const textLimit = Math.min(width - 32, 216);
      ctx.save();
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      let label = title;
      if (ctx.measureText(label).width > textLimit) {
        const characters = [...title];
        let lower = 0;
        let upper = characters.length;
        while (lower + 1 < upper) {
          const midpoint = Math.floor((lower + upper) / 2);
          if (ctx.measureText(characters.slice(0, midpoint).join("") + "…").width <= textLimit) lower = midpoint;
          else upper = midpoint;
        }
        label = characters.slice(0, lower).join("") + "…";
      }
      const labelWidth = ctx.measureText(label).width + horizontalPadding * 2;
      const halfHeight = (Math.abs(card.uY) * card.w + Math.abs(card.vY) * card.h) / 2;
      const above = card.y - halfHeight - labelHeight - 7;
      const preferredY = above >= 6 ? above : card.y + halfHeight + 7;
      const x = clamp(card.x - labelWidth / 2, 6, width - labelWidth - 6);
      const y = clamp(preferredY, 6, height - labelHeight - 6);
      roundedRect(ctx, x, y, labelWidth, labelHeight, 6);
      ctx.fillStyle = "rgba(18, 13, 32, .94)";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${palette.rgb}, .48)`;
      ctx.stroke();
      ctx.fillStyle = "#fff3fb";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + horizontalPadding, y + labelHeight / 2 + 0.5);
      ctx.restore();
    }

    function bakeTreePhoto(record, highlight) {
      const surface = document.createElement("canvas");
      surface.width = 160;
      surface.height = 120;
      drawCard({ x: 80, y: 60, w: 136, h: 136 * .73, uX: 1, uY: 0, vX: 0, vY: 1,
        z: 1, featured: false, visibility: 1, record }, highlight, PALETTES.tree, surface.getContext("2d"));
      return surface;
    }

    function pickCard(point) {
      if (!point) return null;
      for (let index = projected.length - 1; index >= 0; index -= 1) {
        const card = projected[index];
        if (card.visibility < 0.06) continue;
        const dx = point.x - card.x;
        const dy = point.y - card.y;
        const determinant = card.uX * card.vY - card.uY * card.vX;
        const localX = (dx * card.vY - dy * card.vX) / determinant;
        const localY = (dy * card.uX - dx * card.uY) / determinant;
        if (Math.abs(localX) <= card.w / 2 + 3 && Math.abs(localY) <= card.h / 2 + 3
          && (!treeOnCanvas || !treeRig.blocks(point, card.z))) return card;
      }
      return null;
    }

    function drawFrame(now) {
      frame = 0;
      const animated = !paused && !reducedMotion.matches;
      const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.055) : 0;
      previousTime = now;
      if (animated) {
        elapsed += dt;
        morph = Math.min(1, morph + dt / 0.88);
      } else if (reducedMotion.matches) {
        morph = 1;
      }
      const turn = animated ? 1 - Math.exp(-dt * (introducing ? 2.75 : 13)) : 1;
      yaw = lerp(yaw, goalYaw, turn);
      pitch = lerp(pitch, goalPitch, turn);
      const zoomTurn = animated && !pinch ? 1 - Math.exp(-dt * 18) : 1;
      zoom = canZoom() ? lerp(zoom, goalZoom, zoomTurn) : 1;
      if (Math.abs(zoom - goalZoom) < 0.0001) zoom = goalZoom;
      projectionDistance = CAMERA_DISTANCE / (1 + (zoom - 1) * 0.43);
      projectionFocal = projectionDistance * zoom;
      if (introducing && Math.abs(yaw - goalYaw) < 0.014) introducing = false;
      const viewYaw = yaw + Math.sin(elapsed * 0.36) * (mode === "galaxy" ? 0.17 : 0.145);
      cosYaw = Math.cos(viewYaw);
      sinYaw = Math.sin(viewYaw);
      const viewPitch = pitch + Math.sin(elapsed * 0.23) * 0.045;
      cosPitch = Math.cos(viewPitch);
      sinPitch = Math.sin(viewPitch);
      projected = projectCards(viewYaw);
      treeOnCanvas = mode === "tree" && Boolean(treeRig?.prepare({
        width, height, ratio, scaleX, scaleY, centerX, centerY, yaw: viewYaw, pitch: viewPitch,
        distance: projectionDistance, focal: projectionFocal,
      }));

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const palette = PALETTES[mode];
      if (scale > 0) {
        const sceneOpacity = 0.37 + morph * 0.63;
        paintStars(palette.rgb);
        paintOrbit(palette.rgb, false);
        if (mode === "heart") {
          paintHeartGlow(sceneOpacity);
          paintRearHeartPhotos();
        }
        let galaxyForeground;
        ctx.save();
        ctx.globalAlpha = sceneOpacity;
        if (mode === "galaxy") {
          paintGalaxy(sceneOpacity);
          galaxyForeground = paintGalaxyDust(sceneOpacity);
        } else if (mode === "tree") {
          if (!treeOnCanvas) paintTree(palette.rgb);
        } else if (mode === "fireworks") paintFireworks(palette.rgb);
        else paintHeart();
        ctx.restore();

        const hovered = !pinch && !drag?.moved && pickCard(pointer);
        const keyboardRecord = records[keyboardIndex];
        const selected = keyboardRecord && projected.find((card) => card.record === keyboardRecord && card.visibility >= 0.06);
        if (treeOnCanvas) {
          const tree = treeRig.render(projected, hovered, keyboardRecord, transitionAmount());
          ctx.save();
          ctx.shadowColor = `rgba(${palette.rgb}, .34)`;
          ctx.shadowBlur = 5 * ratio;
          ctx.drawImage(tree, 0, 0, width, height);
          ctx.restore();
        } else {
          for (const card of projected) drawCard(card, card === hovered || card.record === keyboardRecord, palette);
        }
        if (galaxyForeground?.length) {
          ctx.save();
          galaxyForeground.forEach(drawDustPoint);
          ctx.restore();
        }
        paintOrbit(palette.rgb, true);
        if (!drag && !pinch) drawPhotoLabel(selected || hovered, palette);
        canvas.style.cursor = drag?.moved || pinch ? "grabbing" : hovered ? "pointer" : "grab";
      }

      if (animated && !document.hidden) requestFrame();
    }

    function setPhotos(photos) {
      const previous = new Map(records.map((record) => [record.photo.id, record]));
      const hasPhotos = records.length > 0;
      records = photos.map((photo, index) => {
        const existing = previous.get(photo.id);
        const to = targetPosition(mode, index, photos.length);
        const image = existing && existing.photo.src === photo.src ? existing.image : new Image();
        if (image !== existing?.image) {
          image.addEventListener("load", requestFrame, { once: true });
          image.addEventListener("error", requestFrame, { once: true });
          image.src = photo.src;
        }
        const from = existing ? currentPosition(existing) : hasPhotos ? { x: 0, y: 0, z: 0 } : to;
        const toSize = targetPhotoScale(mode, index, photos.length);
        const fromSize = existing ? currentPhotoScale(existing) : toSize;
        return {
          photo, image, from, to, fromSize, toSize,
          angle: Math.sin(index * GOLDEN_ANGLE + 0.63) * 0.18,
          tiltYaw: Math.sin(index * 1.84 + 0.58) * 0.56,
          tiltPitch: Math.cos(index * 1.62 + 0.28) * 0.37,
        };
      });
      treeRig?.sync(records);
      keyboardIndex = -1;
      morph = hasPhotos && !paused ? 0 : 1;
      if (photos.length && !hasShownPhotos) {
        hasShownPhotos = true;
        if (mode === "galaxy" && !paused && !reducedMotion.matches) {
          yaw = -0.69;
          pitch = -0.235;
          introducing = true;
        }
      }
      requestFrame();
    }

    function setMode(next) {
      if (!Object.hasOwn(SHAPES, next)) return;
      if (mode !== next) {
        cancelGestures();
        if (next === "tree" && treeRig === undefined) treeRig = window.createLoveTree?.(bakeTreePhoto) ?? null;
        treeOnCanvas = false;
        records.forEach((record, index) => {
          record.from = currentPosition(record);
          record.to = targetPosition(next, index, records.length);
          record.fromSize = currentPhotoScale(record);
          record.toSize = targetPhotoScale(next, index, records.length);
        });
        mode = next;
        updateTouchAction();
        morph = paused ? 1 : 0;
        resetView();
      }
      if (next === "fireworks") burstAt = paused || reducedMotion.matches ? -Infinity : elapsed;
      requestFrame();
    }

    function resetView() {
      introducing = false;
      const angle = (mode === "tree" && treeRig ? 0 : HOME_YAW) - yaw;
      goalYaw = yaw + Math.atan2(Math.sin(angle), Math.cos(angle));
      goalPitch = mode === "tree" && treeRig ? .12 : HOME_PITCH;
      setZoom(1, { force: true });
    }

    function canZoom() {
      return mode === "galaxy" || mode === "tree";
    }

    function zoomMax() {
      return mode === "tree" ? 1.55 : MAX_ZOOM;
    }

    function notifyZoom() {
      onZoomChange?.({
        value: goalZoom,
        percent: Math.round(goalZoom * 100),
        min: MIN_ZOOM,
        max: zoomMax(),
        canZoomIn: goalZoom < zoomMax(),
        canZoomOut: goalZoom > MIN_ZOOM,
      });
    }

    function setZoom(value, { immediate = false, force = false } = {}) {
      const next = clamp(value, MIN_ZOOM, zoomMax());
      if (immediate) zoom = next;
      if (next === goalZoom && !force) return;
      goalZoom = next;
      notifyZoom();
      requestFrame();
    }

    function zoomBy(direction) {
      if (!canZoom() || !Number.isFinite(direction) || direction === 0) return;
      interruptIntro();
      setZoom(goalZoom * ZOOM_STEP ** Math.sign(direction));
    }

    function interruptIntro() {
      if (!introducing) return;
      introducing = false;
      goalYaw = yaw;
      goalPitch = pitch;
    }

    function setPaused(value) {
      const next = Boolean(value);
      if (next === paused) return;
      paused = next;
      previousTime = 0;
      requestFrame();
    }

    function pointerPosition(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function updateTouchAction() {
      canvas.style.touchAction = canZoom() ? "none" : "pan-y pinch-zoom";
    }

    function startDrag(id, point, moved = false) {
      drag = { id, start: point, yaw: goalYaw, pitch: goalPitch, moved };
    }

    function touchDistance() {
      const [first, second] = activeTouches.values();
      return Math.max(8, Math.hypot(first.x - second.x, first.y - second.y));
    }

    function limitPitch(value) {
      const limit = mode === "galaxy" ? 1.46 : 0.78;
      return clamp(value, -limit, limit);
    }

    function cancelGestures() {
      const captured = new Set(activeTouches.keys());
      if (drag) captured.add(drag.id);
      activeTouches.clear();
      drag = null;
      pinch = null;
      pointer = null;
      for (const id of captured) {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      }
    }

    function releasePointer(event, allowTap) {
      const wasTouch = activeTouches.delete(event.pointerId);
      if (wasTouch && pinch) {
        pinch = null;
        const remaining = activeTouches.entries().next().value;
        if (remaining) startDrag(remaining[0], remaining[1], true);
        pointer = null;
        requestFrame();
        return;
      }
      if (drag?.id !== event.pointerId) return;
      const ended = drag;
      drag = null;
      const point = allowTap ? pointerPosition(event) : null;
      pointer = event.pointerType === "touch" ? null : point;
      if (point && !ended.moved && Math.hypot(point.x - ended.start.x, point.y - ended.start.y) <= 5) {
        const card = pickCard(point);
        if (card) onPhoto?.(card.record.photo.id);
      }
      requestFrame();
    }

    canvas.tabIndex = 0;
    updateTouchAction();
    canvas.addEventListener("pointerdown", (event) => {
      const zoomTouch = canZoom() && event.pointerType === "touch";
      if (event.button !== 0 || (!zoomTouch && (!event.isPrimary || drag || pinch))) return;
      if (zoomTouch && (activeTouches.size >= 2 || (drag && !activeTouches.size))) return;
      interruptIntro();
      const point = pointerPosition(event);
      keyboardIndex = -1;
      canvas.setPointerCapture(event.pointerId);
      if (zoomTouch) activeTouches.set(event.pointerId, point);
      if (activeTouches.size === 2) {
        pinch = { distance: touchDistance(), zoom };
        setZoom(zoom, { immediate: true });
        goalYaw = yaw;
        goalPitch = pitch;
        pointer = null;
        drag = null;
      } else {
        pointer = point;
        startDrag(event.pointerId, point);
      }
      requestFrame();
    });
    canvas.addEventListener("pointermove", (event) => {
      const trackedTouch = activeTouches.has(event.pointerId);
      if (!trackedTouch && (!event.isPrimary || pinch)) return;
      const point = pointerPosition(event);
      if (trackedTouch) activeTouches.set(event.pointerId, point);
      if (pinch) {
        const distance = touchDistance();
        const target = pinch.zoom * distance / pinch.distance;
        setZoom(target, { immediate: true });
        if (target !== goalZoom) pinch = { distance, zoom: goalZoom };
        return;
      }
      pointer = point;
      if (drag?.id === event.pointerId) {
        const dx = pointer.x - drag.start.x;
        const dy = pointer.y - drag.start.y;
        if (Math.hypot(dx, dy) > 5) drag.moved = true;
        if (drag.moved) {
          goalYaw = drag.yaw + dx * 0.012;
          goalPitch = limitPitch(drag.pitch - dy * 0.009);
        }
      }
      requestFrame();
    });
    canvas.addEventListener("pointerup", (event) => releasePointer(event, true));
    canvas.addEventListener("pointercancel", (event) => releasePointer(event, false));
    canvas.addEventListener("lostpointercapture", (event) => releasePointer(event, false));
    canvas.addEventListener("pointerleave", () => {
      if (!drag && !pinch) pointer = null;
      requestFrame();
    });
    canvas.addEventListener("wheel", (event) => {
      if (!canZoom() || event.deltaY === 0) return;
      event.preventDefault();
      interruptIntro();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      const delta = clamp(event.deltaY * unit, -360, 360);
      setZoom(goalZoom * Math.exp(-delta * (event.ctrlKey ? 0.012 : 0.0021)));
    }, { passive: false });
    canvas.addEventListener("keydown", (event) => {
      if (event.key.startsWith("Arrow")) interruptIntro();
      if (event.key === "ArrowLeft") goalYaw -= 0.17;
      else if (event.key === "ArrowRight") goalYaw += 0.17;
      else if (event.key === "ArrowUp") goalPitch = limitPitch(goalPitch + 0.14);
      else if (event.key === "ArrowDown") goalPitch = limitPitch(goalPitch - 0.14);
      else if (event.key === "Home") resetView();
      else if (canZoom() && (event.key === "+" || event.key === "=")) zoomBy(1);
      else if (canZoom() && (event.key === "-" || event.key === "_")) zoomBy(-1);
      else if ((event.key === "[" || event.key === "]") && records.length) {
        const offset = event.key === "]" ? 1 : -1;
        const next = keyboardIndex === -1 && offset < 0 ? records.length - 1 : keyboardIndex + offset;
        keyboardIndex = (next + records.length) % records.length;
      } else if (event.key === "Enter" || event.key === " ") {
        const photo = records[keyboardIndex]?.photo;
        if (photo) onPhoto?.(photo.id);
        else if (records.length) onPhoto?.(records[0].photo.id);
      } else return;
      event.preventDefault();
      requestFrame();
    });
    canvas.addEventListener("blur", () => {
      keyboardIndex = -1;
      requestFrame();
    });

    new ResizeObserver(measure).observe(canvas);
    reducedMotion.addEventListener("change", requestFrame);
    document.addEventListener("visibilitychange", requestFrame);
    measure();
    notifyZoom();

    return { setPhotos, setMode, resetView, setPaused, zoomBy };
  };
})();
