(() => {
  const dressed = new WeakMap();
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  window.dressJourneyPrincess = ({ gltf, root = gltf?.scene, bones = {} }) => {
    const T = window.THREE;
    if (!T || !root) return null;
    if (dressed.has(root)) return dressed.get(root);
    root.updateMatrixWorld(true);
    const originalMeshes = [];
    root.traverse((object) => { if (object.isSkinnedMesh) originalMeshes.push(object); });
    const source = originalMeshes.slice().sort((a, b) => b.skeleton.bones.length - a.skeleton.bones.length)[0];
    if (!source) return null;
    const skeleton = source.skeleton;
    const map = gltf.parser?.json?.asset?.extras?.humanoid || {};
    const resolved = {};
    const index = {};
    const rest = {};
    Object.entries(map).forEach(([key, entry]) => {
      const bone = bones[key] || root.getObjectByName(typeof entry === 'string' ? entry : entry.name);
      const at = skeleton.bones.indexOf(bone);
      if (at >= 0) {
        resolved[key] = bone;
        index[key] = at;
        rest[key] = new T.Vector3().setFromMatrixPosition(skeleton.boneInverses[at].clone().invert());
      }
    });
    if (!rest.hips || !rest.head || !rest.leftHand || !rest.rightHand) return null;

    const group = new T.Group();
    group.name = 'JourneyPrincessCostume';
    group.userData.journeyPrincess = true;
    root.add(group);
    const ownedGeometry = new Set();
    const ownedMaterial = new Set();
    const ownedTextures = new Set();
    const hidden = [];
    const faceReplacements = [];
    const animated = [];
    const stats = { style: 'fairytale-princess', faceStyle: 'film-sculpt', irisPalette: 'muted-slate', meshes: 0, triangles: 0, hiddenMeshes: 0, sculptedFaceMeshes: 0, hiddenBodyTriangles: 0 };
    const oldTag = root.userData.journeyPrincess;
    let disposed = false;
    const mat = (name, color) => {
      const value = new T.MeshStandardMaterial({ color, roughness: .91, metalness: 0, side: T.DoubleSide });
      value.name = `Princess_${name}`;
      ownedMaterial.add(value);
      return value;
    };
    const rose = mat('RoseSilk_CLOTH', '#cf9eab');
    const peach = mat('PeachPetticoat_CLOTH', '#ebc9bc');
    const lightRose = mat('Bodice_CLOTH', '#ddb0b8');
    const ivory = mat('IvorySatin_CLOTH', '#f7e4cc');
    const gold = mat('GoldFiligree', '#d3ad69');
    const brightGold = mat('CrownGold', '#f4d98f');
    const pearl = mat('Pearls', '#fff0dc');
    const jewel = mat('RoseQuartz', '#d97691');
    const hair = mat('Chestnut_HAIR', '#593831');
    const hairRibbon = mat('ChestnutStrands_HAIR', '#614039');
    const hairLight = mat('SoftHairTwists_HAIR', '#66463a');

    function weights(entries) {
      const items = entries.filter(([name, amount]) => index[name] !== undefined && amount > .0001).slice(0, 4);
      const total = items.reduce((sum, [, amount]) => sum + amount, 0) || 1;
      return { indices: [0, 1, 2, 3].map((i) => items[i] ? index[items[i][0]] : index.hips),
        values: [0, 1, 2, 3].map((i) => items[i] ? items[i][1] / total : 0) };
    }
    const single = (name) => () => weights([[name, 1]]);
    function torsoWeights(p) {
      if (p.y < 1.12) { const a = smooth(1.04, 1.15, p.y); return weights([['hips', 1 - a], ['spine', a]]); }
      const a = smooth(1.12, 1.29, p.y);
      return weights([['spine', 1 - a], ['chest', a]]);
    }
    function skirtWeights(p) {
      const amount = smooth(.98, .42, p.y) * .32;
      const side = smooth(-.11, .11, p.x);
      return weights([['hips', 1 - amount], ['leftUpperLeg', amount * (1 - side)], ['rightUpperLeg', amount * side]]);
    }
    function hairWeights(p) {
      const support = smooth(1.48, 1.12, p.y) * .82;
      return weights([['head', 1 - support], ['chest', support]]);
    }
    function addGeometry(name, geometry, material, weighting, animation) {
      ownedGeometry.add(geometry);
      const positions = geometry.attributes.position;
      const skinIndices = [], skinWeights = [];
      const p = new T.Vector3();
      for (let i = 0; i < positions.count; i += 1) {
        p.fromBufferAttribute(positions, i);
        const w = weighting(p);
        skinIndices.push(...w.indices); skinWeights.push(...w.values);
      }
      geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndices, 4));
      geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeights, 4));
      const mesh = new T.SkinnedMesh(geometry, material);
      mesh.name = `Princess/${name}`;
      mesh.bind(skeleton, source.bindMatrix);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.journeyPrincess = true;
      group.add(mesh);
      stats.meshes += 1;
      stats.triangles += (geometry.index?.count || positions.count) / 3;
      if (animation) animated.push({ geometry, original: positions.array.slice(), animation });
      return mesh;
    }

    function surface(name, rows, sides, shape, material, weighting, animation) {
      const vertices = [], uvs = [], indices = [];
      for (let row = 0; row <= rows; row += 1) {
        const v = row / rows;
        for (let column = 0; column <= sides; column += 1) {
          vertices.push(...shape(v, column / sides * Math.PI * 2));
          uvs.push(column / sides, 1 - v);
        }
      }
      for (let row = 0; row < rows; row += 1) for (let column = 0; column < sides; column += 1) {
        const a = row * (sides + 1) + column, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      // Smooth the UV seam as well as the intermediate ring vertices.
      const normal = geometry.attributes.normal;
      const n = new T.Vector3(), m = new T.Vector3();
      for (let row = 0; row <= rows; row += 1) {
        const a = row * (sides + 1), b = a + sides;
        n.fromBufferAttribute(normal, a).add(m.fromBufferAttribute(normal, b)).normalize();
        normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(b, n.x, n.y, n.z);
      }
      return addGeometry(name, geometry, material, weighting, animation);
    }
    function curve(name, points, radius, material, weighting, flat = 1) {
      const path = new T.CatmullRomCurve3(points.map((point) => new T.Vector3(...point)));
      const segments = points.length > 16 ? points.length - 1 : Math.max(16, points.length * 7);
      const geometry = new T.TubeGeometry(path, segments, radius, 7, false);
      if (flat !== 1) {
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i += 1) {
          const row = Math.floor(i / 8), center = path.getPointAt(clamp(row / segments));
          position.setZ(i, center.z + (position.getZ(i) - center.z) * flat);
        }
        geometry.computeVertexNormals();
      }
      return addGeometry(name, geometry, material, weighting);
    }
    function ornament(name, position, scale, material, weighting = single('head')) {
      const geometry = new T.SphereGeometry(1, 12, 8);
      geometry.scale(...scale); geometry.translate(...position);
      return addGeometry(name, geometry, material, weighting);
    }
    function profile(v, points) {
      const scaled = v * (points.length - 1), i = Math.min(points.length - 2, Math.floor(scaled));
      const a = points[i], b = points[i + 1], t = scaled - i;
      return a.map((value, channel) => mix(value, b[channel], t));
    }

    function sculptFace() {
      const positions = new Map();
      const bell = (value, center, width) => Math.exp(-Math.pow((value - center) / width, 2));
      originalMeshes.forEach((mesh) => {
        const surfaces = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (!surfaces.every((material) => /Face|Eye/.test(material.name || '') && !/HAIR/.test(material.name || ''))) return;
        const originalGeometry = mesh.geometry;
        const originalMaterial = mesh.material;
        const attribute = originalGeometry.attributes.position;
        let sculpted = positions.get(attribute.array);
        if (!sculpted) {
          const values = new Float32Array(attribute.count * 3);
          for (let i = 0; i < attribute.count; i += 1) {
            const x = attribute.getX(i) - rest.head.x, y = attribute.getY(i), z = attribute.getZ(i);
            const front = smooth(.025, -.045, z);
            // The jaw and cheeks form one continuous surface. A slightly
            // longer lower face and supported cheek plane replace the tiny
            // pointed chin without enlarging the eyes or adding gloss.
            const jaw = bell(y, 1.506, .038);
            const cheek = bell(Math.abs(x), .069, .036) * bell(y, 1.542, .033) * front;
            const chin = bell(y, 1.475, .017);
            let px = x * (1 - .017 * jaw + .115 * chin - .025 * smooth(1.60, 1.68, y));
            px += Math.sign(x) * .0024 * cheek;
            let py = y - .0055 * (1 - smooth(1.475, 1.555, y)) - .0025 * smooth(1.616, 1.697, y);
            let pz = z - .0034 * cheek;
            pz -= front * bell(x, 0, .018) * (.0045 * bell(y, 1.553, .026) + .0038 * bell(y, 1.528, .012));
            pz -= .0042 * chin * bell(x, 0, .035) * front;
            pz -= .0031 * bell(x, 0, .027) * bell(y, 1.501, .011) * front;
            for (const sign of [-1, 1]) {
              const dx = x - sign * .043, dy = y - 1.558;
              const orbit = Math.exp(-Math.pow(dx / .043, 4) - Math.pow(dy / .039, 4)) * front;
              px -= dx * .20 * orbit;
              py -= dy * .43 * orbit;
              py += .0010 * smooth(.024, .083, Math.abs(x)) * orbit;
            }
            // The same field also moves the lids, brows and mouth layers, so
            // their UV artwork remains attached to the reshaped facial skin.
            py += .0011 * bell(Math.abs(x), .020, .014) * bell(y, 1.500, .012) * front;
            py -= .0055 * bell(Math.abs(x), .047, .039) * bell(y, 1.604, .018) * front;
            values.set([px + rest.head.x, py, pz], i * 3);
          }
          sculpted = new T.BufferAttribute(values, 3);
          positions.set(attribute.array, sculpted);
        }
        const geometry = originalGeometry.clone();
        geometry.setAttribute('position', sculpted);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        ownedGeometry.add(geometry);
        faceReplacements.push({ mesh, geometry: originalGeometry, material: originalMaterial });
        mesh.geometry = geometry;
        if (surfaces.some((material) => /EyeHighlight|EyeIris/.test(material.name || ''))) {
          const softened = surfaces.map((material) => {
            if (!/EyeHighlight|EyeIris/.test(material.name || '')) return material;
            const value = material.clone();
            if (/EyeHighlight/.test(material.name || '')) value.opacity *= .24;
            else if (material.map?.image && typeof document !== 'undefined') {
              // Recolour only the separate iris map; the sclera, eyelids,
              // pupil texture detail and source UV placement stay intact.
              const canvas = document.createElement('canvas');
              const image = material.map.image;
              const scale = Math.min(1, 512 / Math.max(image.width, image.height));
              canvas.width = Math.max(1, Math.round(image.width * scale));
              canvas.height = Math.max(1, Math.round(image.height * scale));
              const context = canvas.getContext('2d');
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
              for (let i = 0; i < pixels.data.length; i += 4) {
                const luminance = (pixels.data[i] * .2126 + pixels.data[i + 1] * .7152 + pixels.data[i + 2] * .0722) / 255;
                const tone = clamp((luminance - .05) / .75), pupil = smooth(.02, .18, luminance);
                pixels.data[i] = (36 + 61 * tone) * pupil;
                pixels.data[i + 1] = (52 + 78 * tone) * pupil;
                pixels.data[i + 2] = (74 + 82 * tone) * pupil;
              }
              context.putImageData(pixels, 0, 0);
              const texture = new T.CanvasTexture(canvas);
              texture.name = 'Princess/SlateIris';
              for (const key of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'channel', 'rotation']) texture[key] = material.map[key];
              texture.repeat.copy(material.map.repeat); texture.offset.copy(material.map.offset); texture.center.copy(material.map.center);
              ownedTextures.add(texture);
              value.map = texture;
            } else value.color.multiply(new T.Color('#b5a4ad'));
            ownedMaterial.add(value);
            return value;
          });
          mesh.material = Array.isArray(originalMaterial) ? softened : softened[0];
        }
        stats.sculptedFaceMeshes += 1;
      });
    }

    function hairLock(name, points, widths, depths, material, headOnly = false) {
      const path = new T.CatmullRomCurve3(points.map((point) => new T.Vector3(...point)));
      const forward = new T.Vector3(0, 0, 1);
      return surface(name, 30, 20, (v, angle) => {
        const center = path.getPoint(v), tangent = path.getTangent(v).normalize();
        const across = new T.Vector3().crossVectors(forward, tangent).normalize();
        const depth = new T.Vector3().crossVectors(tangent, across).normalize();
        const width = profile(v, widths.map((value) => [value]))[0];
        const thickness = profile(v, depths.map((value) => [value]))[0];
        center.addScaledVector(across, Math.sin(angle) * width).addScaledVector(depth, Math.cos(angle) * thickness);
        return center.toArray();
      }, material, headOnly ? single('head') : hairWeights);
    }

    function removeCoveredBody() {
      originalMeshes.forEach((mesh) => {
        const surfaces = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (!surfaces.every((material) => /Body.*SKIN/.test(material.name || ''))) return;
        const original = mesh.geometry, position = original.attributes.position;
        const indices = original.index?.array || Array.from({ length: position.count }, (_, i) => i);
        const visible = [];
        for (let i = 0; i < indices.length; i += 3) {
          let x = 0, y = 0;
          for (let c = 0; c < 3; c += 1) { x += Math.abs(position.getX(indices[i + c])) / 3; y += position.getY(indices[i + c]) / 3; }
          // These surfaces are wholly under the closed bodice and sleeves.
          // Keep the visible neck, hands and all leg/ankle geometry intact.
          const underBodice = x < .17 && y > 1.015 && y < 1.412;
          const underSleeve = x > .070 && x < .515 && y > 1.27 && y < 1.455;
          // The original upper-hip skin can protrude through the new waist
          // while the thigh flexes. This small band is entirely inside both
          // skirt layers and stays well above every hem and exposed leg.
          const underSkirtWaist = x < .20 && y > .94 && y < 1.065;
          if (underBodice || underSleeve || underSkirtWaist) stats.hiddenBodyTriangles += 1;
          else visible.push(indices[i], indices[i + 1], indices[i + 2]);
        }
        const geometry = original.clone();
        geometry.setIndex(visible);
        // Retained neck triangles can reach below their centre into the
        // covered chest. Bring only that hidden lower edge to a smooth cut
        // plane, rather than leaving the old triangle tips outside the collar.
        const neckPosition = geometry.attributes.position;
        for (let i = 0; i < neckPosition.count; i += 1) {
          if (Math.abs(neckPosition.getX(i)) < .075 && neckPosition.getY(i) > 1.34 && neckPosition.getY(i) < 1.425) {
            neckPosition.setX(i, clamp(neckPosition.getX(i), -.052, .052));
            neckPosition.setY(i, 1.425);
            neckPosition.setZ(i, clamp(neckPosition.getZ(i), -.038, .048));
          }
        }
        ownedGeometry.add(geometry);
        faceReplacements.push({ mesh, geometry: original, material: mesh.material });
        mesh.geometry = geometry;
      });
    }

    try {
      sculptFace();
      removeCoveredBody();
      originalMeshes.forEach((mesh) => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.every((material) => /Tops.*CLOTH|HAIR/i.test(material.name || ''))) {
          hidden.push({ mesh, visible: mesh.visible }); mesh.visible = false; stats.hiddenMeshes += 1;
        }
      });

      // A shaped bodice reaches the real shoulder/neck contours; the existing
      // hands, neck and face remain the original skinned character.
      surface('Tailored bodice', 30, 48, (v, angle) => {
        const [y, rx, rz, z] = profile(v, [
          [1.430, .058, .052, -.001], [1.416, .062, .061, -.002], [1.394, .092, .073, .000],
          [1.367, .132, .087, .001], [1.312, .141, .115, -.010],
          [1.238, .142, .114, -.017], [1.156, .121, .092, -.011],
          [1.078, .111, .081, -.003], [1.035, .116, .086, -.001]
        ]);
        return [Math.sin(angle) * rx, y, z + Math.cos(angle) * rz];
      }, lightRose, torsoWeights);

      ['left', 'right'].forEach((side) => {
        const shoulder = rest[`${side}UpperArm`], elbow = rest[`${side}LowerArm`], wrist = rest[`${side}Hand`];
        const sign = Math.sign(shoulder.x);
        const armWeight = (p) => {
          const fraction = (Math.abs(p.x) - Math.abs(shoulder.x)) / (Math.abs(wrist.x) - Math.abs(shoulder.x));
          const lower = smooth(.38, .64, fraction);
          const shoulderSupport = (1 - smooth(.08, .19, Math.abs(p.x))) * .85;
          return weights([['chest', shoulderSupport], [`${side}UpperArm`, (1 - lower) * (1 - shoulderSupport)], [`${side}LowerArm`, lower * (1 - shoulderSupport)]]);
        };
        const sleeve = surface(`${side} flowing sleeve`, 24, 28, (v, angle) => {
          const t = v * .975;
          const center = t < .51 ? shoulder.clone().lerp(elbow, t / .51) : elbow.clone().lerp(wrist, (t - .51) / .49);
          center.x -= sign * .040 * (1 - smooth(0, .19, v));
          const radius = profile(v, [[.007], [.055], [.061], [.046], [.041], [.036], [.038]])[0];
          return [center.x, center.y + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius * .84];
        }, lightRose, armWeight);
        if (sign > 0) {
          const triangles = sleeve.geometry.index.array;
          for (let i = 0; i < triangles.length; i += 3) [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]];
          sleeve.geometry.computeVertexNormals();
        }
        const center = wrist.clone().lerp(elbow, .055);
        const cuff = Array.from({ length: 25 }, (_, i) => {
          const a = i / 24 * Math.PI * 2; return [center.x, center.y + Math.cos(a) * .039, center.z + Math.sin(a) * .034];
        });
        curve(`${side} cuff embroidery`, cuff, .0031, gold, single(`${side}LowerArm`));
      });

      function skirtPoint(v, angle, overlay = false) {
        const back = (Math.cos(angle) + 1) * .5;
        const hem = overlay ? .60 + .055 * Math.cos(angle * 5) : mix(.435, .365, back);
        const y = mix(1.057, hem, v);
        const fullness = Math.sin(v * Math.PI * .5);
        const fold = Math.cos(angle * 14 + v * .25) * .011 * Math.pow(v, .6);
        const rx = .115 + fullness * (overlay ? .185 : .211) + fold;
        const rz = .086 + fullness * (overlay ? .173 : .214) + fold * .72;
        // A walking skirt needs clearance behind a flexed calf as well as
        // around the knee. The extra fabric is concentrated low at the back.
        const walkingEase = .082 * smooth(.38, 1, v) * Math.pow(Math.max(0, Math.cos(angle)), 2);
        return [Math.sin(angle) * rx, y, Math.cos(angle) * rz + .013 * v + walkingEase];
      }
      const clothDrift = (x, y, z, t, energy) => {
        const loose = smooth(1.04, .43, y);
        return [x + Math.sin(t * 4.1 - y * 3) * .004 * loose * energy, y, z + Math.sin(t * 4.1 - y * 2.7) * .006 * loose * energy];
      };
      surface('Full peach underskirt', 28, 72, (v, a) => skirtPoint(v, a), peach, skirtWeights, clothDrift);
      surface('Rose petal overskirt', 24, 72, (v, a) => skirtPoint(v, a, true), rose, skirtWeights, clothDrift);
      [false, true].forEach((overlay) => {
        const edge = Array.from({ length: 73 }, (_, i) => skirtPoint(1, i / 72 * Math.PI * 2, overlay));
        const piping = curve(overlay ? 'Scalloped gold edge' : 'Ivory hem piping', edge, overlay ? .0027 : .004, overlay ? gold : ivory, skirtWeights);
        animated.push({ geometry: piping.geometry, original: piping.geometry.attributes.position.array.slice(), animation: clothDrift });
      });
      const waist = Array.from({ length: 49 }, (_, i) => {
        const a = i / 48 * Math.PI * 2;
        return [Math.sin(a) * .119, 1.072 - Math.cos(a) * .005, Math.cos(a) * .088];
      });
      curve('Gilded waist ribbon', waist, .009, gold, torsoWeights);
      curve('Waist light seam', waist.map(([x, y, z]) => [x * 1.005, y + .005, z * 1.005]), .002, brightGold, torsoWeights);
      // Small floral embroidery belongs to the fabric surface, not to a
      // separate floating emblem; the camera sees the tied back waist detail.
      for (const sign of [-1, 1]) {
        curve('Waist bow loop', [[0, 1.075, .103], [sign * .050, 1.104, .116], [sign * .082, 1.073, .109], [sign * .045, 1.047, .112], [0, 1.075, .103]], .011, ivory, torsoWeights, .45);
        curve('Waist ribbon tail', [[sign * .012, 1.062, .105], [sign * .046, .984, .151], [sign * .069, .891, .189]], .011, ivory, skirtWeights, .3);
      }
      ornament('Waist rose jewel', [0, 1.075, .118], [.011, .014, .006], jewel, torsoWeights);
      for (const sign of [-1, 1]) {
        curve('Bodice seam embroidery', [[sign * .050, 1.365, .079], [sign * .081, 1.292, .091], [sign * .069, 1.17, .086], [sign * .035, 1.083, .080]], .0027, gold, torsoWeights);
      }

      // A fitted root layer supports broad, separately shaped locks. Their
      // cross-sections are flattened volumes, never round tubes or hair cards.
      surface('Continuous parted scalp', 36, 80, (v, angle) => {
        const front = Math.max(0, -Math.cos(angle));
        const end = 2.08 - .86 * front ** 2 - .34 * Math.sin(angle) ** 4
          + .27 * front * Math.sin(angle + .3);
        const polar = .001 + v * end;
        const strand = .0019 * Math.sin(angle * 10 + polar * 5) * Math.sin(polar);
        return [Math.sin(angle) * (.115 + .003 * front + strand) * Math.sin(polar),
          1.601 + .135 * Math.cos(polar), .012 + Math.cos(angle) * (.105 + .011 * front + strand) * Math.sin(polar)];
      }, hair, single('head'));
      surface('Long waves with a single flowing silhouette', 44, 64, (v, angle) => {
        const [y, rx, rz, z] = profile(v, [
          [1.646, .049, .032, .079], [1.559, .085, .043, .100],
          [1.477, .100, .041, .116], [1.382, .118, .035, .146],
          [1.294, .121, .031, .157], [1.203, .108, .027, .161],
          [1.131, .075, .019, .166], [1.090, .037, .010, .173], [1.081, .006, .004, .172],
        ]);
        const fold = .0032 * Math.cos(angle * 8 + 2.7 * v) * Math.sin(Math.PI * v);
        return [Math.sin(angle) * (rx + fold) + .012 * Math.sin(v * Math.PI * 1.8),
          y + .014 * smooth(.75, 1, v) * Math.cos(angle * 3), Math.cos(angle) * (rz + fold) + z];
      }, hair, hairWeights);
      hairLock('Soft left wave', [[-.064,1.587,.120],[-.087,1.473,.141],[-.104,1.366,.160],[-.078,1.237,.178],[-.057,1.136,.184]], [.012,.022,.023,.019,.001], [.004,.007,.007,.006,.001], hairRibbon);
      hairLock('Soft right wave', [[.071,1.585,.116],[.080,1.481,.143],[.097,1.373,.164],[.100,1.272,.177],[.073,1.165,.186]], [.013,.023,.024,.019,.001], [.004,.007,.008,.006,.001], hairRibbon);
      hairLock('Loose temple lock', [[-.092,1.681,-.025],[-.107,1.605,-.015],[-.110,1.550,.006],[-.106,1.490,.036],[-.084,1.449,.072]], [.013,.015,.014,.010,.001], [.004,.006,.006,.005,.001], hair, true);
      hairLock('Left half-up sweep', [[-.103,1.647,.030],[-.102,1.596,.094],[-.073,1.558,.129],[-.018,1.536,.146]], [.013,.017,.014,.003], [.004,.006,.005,.002], hairLight, true);
      hairLock('Right half-up sweep', [[.100,1.649,.029],[.105,1.607,.095],[.056,1.557,.137],[-.018,1.536,.146]], [.013,.016,.013,.003], [.004,.006,.005,.002], hairRibbon, true);
      ornament('Half-up pearl clasp', [-.018, 1.536, .151], [.007, .007, .004], pearl, single('head'));

      // A complete slim circlet reads from the following camera as well as
      // from the front. Its small pointed arches keep the head silhouette light.
      const diademAt = (angle, y, lift = .004) => {
        const radius = Math.sqrt(Math.max(.01, 1 - ((y - 1.601) / .135) ** 2));
        const front = Math.max(0, Math.cos(angle));
        return [Math.sin(angle) * ((.115 + .003 * front) * radius + lift), y,
          .012 - Math.cos(angle) * ((.105 + .011 * front) * radius + lift)];
      };
      const diadem = Array.from({ length: 35 }, (_, index) => {
        const a = (index / 34 * 2 - 1) * 1.22;
        return diademAt(a, 1.683 + .008 * Math.cos(a));
      });
      curve('Fine fitted diadem', diadem, .0019, gold, single('head'));
      for (let i = -1; i <= 1; i += 1) {
        const a = i * .27;
        const peak = 1.706 + (i === 0 ? .010 : 0);
        curve('Diadem leaf', [diademAt(a - .15, 1.691), diademAt(a - .055, peak - .005),
          diademAt(a, peak), diademAt(a + .055, peak - .005), diademAt(a + .15, 1.691)], .0016, brightGold, single('head'));
        ornament('Small diadem pearl', diademAt(a, peak, .0047), [.0024, .0024, .0022], pearl);
      }
      ornament('Rose diadem stone', diademAt(0, 1.702, .0058), [.0045, .0055, .0027], jewel);
      // Tiny ornaments and hair locks share a skeleton and material. Batch
      // their buffers so the detailed silhouette does not cost one draw each.
      const deforming = new Set(animated.map(({ geometry }) => geometry));
      const batches = new Map();
      group.children.forEach((mesh) => {
        if (deforming.has(mesh.geometry)) return;
        if (!batches.has(mesh.material)) batches.set(mesh.material, []);
        batches.get(mesh.material).push(mesh);
      });
      batches.forEach((meshes, material) => {
        if (meshes.length < 2) return;
        const merged = new T.BufferGeometry();
        const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
        for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
          const first = meshes[0].geometry.attributes[name];
          const array = new first.array.constructor(vertexCount * first.itemSize);
          let offset = 0;
          meshes.forEach((mesh) => { array.set(mesh.geometry.attributes[name].array, offset); offset += mesh.geometry.attributes[name].array.length; });
          merged.setAttribute(name, new T.BufferAttribute(array, first.itemSize));
        }
        const indices = [];
        let offset = 0;
        meshes.forEach((mesh) => {
          for (const value of mesh.geometry.index.array) indices.push(value + offset);
          offset += mesh.geometry.attributes.position.count;
        });
        merged.setIndex(indices);
        ownedGeometry.add(merged);
        const batch = new T.SkinnedMesh(merged, material);
        batch.name = `Princess/${material.name}`;
        batch.bind(skeleton, source.bindMatrix);
        batch.frustumCulled = false;
        batch.castShadow = batch.receiveShadow = true;
        batch.userData.journeyPrincess = true;
        group.add(batch);
        meshes.forEach((mesh) => { mesh.removeFromParent(); mesh.geometry.dispose(); ownedGeometry.delete(mesh.geometry); });
        stats.meshes -= meshes.length - 1;
      });
      root.userData.journeyPrincess = { ...stats };
    } catch (error) {
      cleanup();
      throw error;
    }

    function cleanup() {
      faceReplacements.forEach(({ mesh, geometry, material }) => { mesh.geometry = geometry; mesh.material = material; });
      hidden.forEach(({ mesh, visible }) => { mesh.visible = visible; });
      group.removeFromParent();
      ownedGeometry.forEach((value) => value.dispose());
      ownedMaterial.forEach((value) => value.dispose());
      ownedTextures.forEach((value) => value.dispose());
      if (oldTag === undefined) delete root.userData.journeyPrincess;
      else root.userData.journeyPrincess = oldTag;
      dressed.delete(root);
    }
    const api = {
      root: group,
      stats,
      update(seconds, shot = {}) {
        if (disposed) return;
        const energy = (Number.isFinite(shot.pace) ? clamp(shot.pace) : 1) * smooth(.1, 1, seconds) * (1 - smooth(4.8, 5.7, seconds));
        animated.forEach(({ geometry, original, animation }) => {
          const position = geometry.attributes.position;
          for (let i = 0; i < position.count; i += 1) {
            const at = i * 3;
            position.setXYZ(i, ...animation(original[at], original[at + 1], original[at + 2], seconds, energy));
          }
          position.needsUpdate = true;
        });
      },
      dispose() { if (!disposed) { disposed = true; cleanup(); } }
    };
    dressed.set(root, api);
    return api;
  };
})();
