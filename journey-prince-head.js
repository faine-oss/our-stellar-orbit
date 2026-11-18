(() => {
  const sculpted = new WeakMap();

  // Runs in the original GLB rest space, before the rig's proportion pass and
  // before dressing. Face layers share one deformation field, including eyes.
  window.sculptJourneyPrince = ({ gltf, root = gltf?.scene, bones } = {}) => {
    const THREE = window.THREE;
    if (!THREE || !root || !bones?.head || !bones?.hips || !bones?.neck) return null;
    if (sculpted.has(root)) return sculpted.get(root);
    root.updateWorldMatrix(true, true);
    const originals = [];
    root.traverse((mesh) => { if (mesh.isSkinnedMesh) originals.push(mesh); });
    const materialsOf = (mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const source = originals.find((mesh) => materialsOf(mesh).some((m) => /Face.*SKIN/i.test(m?.name || '')));
    if (!source?.skeleton) return null;
    const headIndex = source.skeleton.bones.indexOf(bones.head);
    if (headIndex < 0) return null;
    const atBone = (bone) => root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    const hips = atBone(bones.hips), neck = atBone(bones.neck);
    const unit = (neck.y - hips.y) / .43427527;
    const origin = new THREE.Vector3(hips.x, hips.y - 1.01838338 * unit, hips.z + .009861458 * unit);
    const P = (x, y, z) => new THREE.Vector3(x, y, z).multiplyScalar(unit).add(origin);
    const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const bell = (x, center, width) => Math.exp(-(((x - center) / width) ** 2));
    const geometries = new Set(), materials = new Set(), textures = new Set(), changes = [];
    const group = new THREE.Group();
    group.name = 'JourneyPrince/DesignedHead';
    root.add(group);
    let disposed = false, shapedMeshes = 0, shapedVertices = 0;

    function shapeFace(value) {
      const p = value.clone().sub(origin).divideScalar(unit);
      const blend = smooth(1.482, 1.532, p.y) * (1 - smooth(.115, .16, Math.abs(p.x)));
      if (!blend) return value;
      const jaw = bell(p.y, 1.548, .031);
      const cheek = bell(p.y, 1.604, .031);
      const originalY = p.y, originalX = p.x, originalZ = p.z;
      // A fuller, clearer lower jaw and a quieter cheek plane replace the
      // pointed chin/round cheek combination of the generic source face.
      p.x *= 1 + blend * (.135 * jaw + .027 * cheek);
      p.y -= blend * .0016 * (1 - smooth(1.531, 1.578, originalY));
      const front = 1 - smooth(-.060, -.005, originalZ);
      const eye = bell(Math.abs(originalX), .036, .032) * bell(originalY, 1.605, .027) * front;
      p.y -= (originalY - 1.605) * .22 * eye * blend;
      p.x -= (Math.abs(originalX) - .037) * Math.sign(originalX) * .12 * eye * blend;
      // The nasal bridge and brow remain one textured surface, never separate
      // spheres or a pasted-on nose. The displacement is only a few mm.
      p.z -= .0066 * bell(originalX, 0, .017) * bell(originalY, 1.580, .033) * front * blend;
      p.z -= .0018 * bell(Math.abs(originalX), .035, .035) * bell(originalY, 1.633, .014) * front * blend;
      p.z -= .0032 * bell(Math.abs(originalX), .067, .028) * cheek * front * blend;
      p.z -= .0039 * bell(originalX, 0, .025) * bell(originalY, 1.548, .014) * front * blend;
      return p.multiplyScalar(unit).add(origin);
    }

    function chestnutIris(original) {
      const image = original.map?.image;
      if (!image || typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const high = Math.max(r, g, b), low = Math.min(r, g, b);
        // Pupil black and any neutral painted reflections retain their values;
        // only chromatic iris texels change. Eye-white is a separate material.
        if (!data[i + 3] || high < 34 || high - low < 18) continue;
        const brightness = .025 + .64 * (high / 255) ** .90;
        data[i] = Math.round(brightness * 255);
        data[i + 1] = Math.round(brightness * 255 * .58);
        data[i + 2] = Math.round(brightness * 255 * .30);
      }
      context.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.name = 'JourneyPrinceHead/ChestnutIris';
      texture.colorSpace = original.map.colorSpace;
      texture.flipY = original.map.flipY;
      texture.wrapS = original.map.wrapS;
      texture.wrapT = original.map.wrapT;
      texture.magFilter = original.map.magFilter;
      texture.minFilter = original.map.minFilter;
      texture.offset.copy(original.map.offset);
      texture.repeat.copy(original.map.repeat);
      texture.center.copy(original.map.center);
      texture.rotation = original.map.rotation;
      texture.anisotropy = original.map.anisotropy;
      textures.add(texture);
      return texture;
    }

    originals.forEach((mesh) => {
      const oldMaterials = materialsOf(mesh), names = oldMaterials.map((m) => m?.name || '');
      if (names.some((name) => /HAIR/i.test(name))) {
        changes.push({ mesh, visible: mesh.visible });
        mesh.visible = false;
        return;
      }
      const face = names.some((name) => /Face|Eye|Brow|Body.*SKIN/i.test(name));
      if (!face) return;
      const originalGeometry = mesh.geometry, geometry = originalGeometry.clone();
      const positions = geometry.attributes.position;
      const p = new THREE.Vector3();
      for (let i = 0; i < positions.count; i += 1) {
        p.fromBufferAttribute(positions, i);
        if (p.y < origin.y + 1.482 * unit || Math.abs(p.x - origin.x) > .16 * unit) continue;
        const result = shapeFace(p);
        positions.setXYZ(i, result.x, result.y, result.z);
        shapedVertices += 1;
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.add(geometry);
      changes.push({ mesh, geometry: originalGeometry });
      mesh.geometry = geometry;
      shapedMeshes += 1;
      if (names.some((name) => /EyeHighlight|EyeIris/i.test(name))) {
        const replacements = oldMaterials.map((original) => {
          if (!/EyeHighlight|EyeIris/i.test(original?.name || '')) return original;
          const copy = original.clone();
          if (/EyeHighlight/i.test(original.name)) {
            copy.opacity = (original.opacity ?? 1) * .55;
            copy.transparent = true;
          } else {
            copy.map = chestnutIris(original) || original.map;
          }
          materials.add(copy);
          return copy;
        });
        changes.push({ mesh, material: mesh.material });
        mesh.material = Array.isArray(mesh.material) ? replacements : replacements[0];
      }
    });

    function surface(name, color, hair = true) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: .98, metalness: 0, side: THREE.DoubleSide });
      material.name = `JourneyPrinceHead/${name}_${hair ? 'HAIR' : 'ROYALMETAL'}`;
      material.userData.journeyDesignedHead = true;
      materials.add(material);
      return material;
    }
    const rootHair = surface('WalnutRoots', '#37292b');
    const mainHair = surface('SweptWalnutLocks', '#42302e');
    const shadowHair = surface('RecessedLayers', '#3c2c2e');
    const lightHair = surface('SoftWalnutPlanes', '#4a3633');
    const gold = surface('FineDiadem', '#d3ad69', false);
    const gem = surface('BlueEnamel', '#6c96ad', false);

    class SurfaceBuffer {
      constructor(material) { this.material = material; this.positions = []; this.indices = []; }
      grid(rows, columns, sample) {
        const start = this.positions.length / 3;
        for (let row = 0; row <= rows; row += 1) for (let col = 0; col <= columns; col += 1) {
          const point = sample(row / rows, col / columns);
          this.positions.push(point.x, point.y, point.z);
        }
        for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
          const a = start + row * (columns + 1) + col, b = a + columns + 1;
          this.indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      finish() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setIndex(this.indices);
        const count = this.positions.length / 3, indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
        for (let i = 0; i < count; i += 1) { indices[i * 4] = headIndex; weights[i * 4] = 1; }
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        geometries.add(geometry);
        const mesh = new THREE.SkinnedMesh(geometry, this.material);
        mesh.name = this.material.name;
        mesh.skeleton = source.skeleton;
        mesh.bindMode = source.bindMode;
        mesh.bindMatrix.copy(source.bindMatrix);
        mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
        mesh.frustumCulled = false;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.journeyDesignedHead = true;
        group.add(mesh);
      }
    }
    const buffers = new Map();
    const buffer = (material) => {
      if (!buffers.has(material)) buffers.set(material, new SurfaceBuffer(material));
      return buffers.get(material);
    };
    const scalpCenter = P(0, 1.628, -.008);
    const scalpRadii = new THREE.Vector3(.106, .127, .113).multiplyScalar(unit);

    // A fitted root shell ends at a shaped hairline: high open forehead,
    // uncovered ear rims, and a shorter nape. It is not the old bowl silhouette.
    buffer(rootHair).grid(24, 64, (v, u) => {
      const theta = (u * 2 - 1) * Math.PI;
      const end = 2.15 - .96 * Math.max(0, Math.cos(theta)) ** 2 - .38 * Math.sin(theta) ** 4
        - .30 * Math.sin(theta + .10) * Math.exp(-((theta / 1.1) ** 2))
        + .135 * Math.exp(-(((theta + .58) / .36) ** 2));
      const phi = .002 + v * (end - .002);
      const wave = .0015 * Math.sin(theta * 9 + phi * 3.8) * Math.sin(phi);
      return P(Math.sin(phi) * Math.sin(theta) * (.106 + wave), 1.628 + Math.cos(phi) * .127,
        -.008 - Math.sin(phi) * Math.cos(theta) * (.113 + wave));
    });

    function lock(material, controls, width, thickness = .28, tip = .0004) {
      const curve = new THREE.CatmullRomCurve3(controls.map((p) => P(...p)), false, 'centripetal');
      const onScalp = (t) => {
        const center = curve.getPoint(t);
        // A lock's centre sits in the same continuous volume as the root cap.
        // Curves describe comb direction, not unsupported arches over a skull.
        const radial = center.clone().sub(scalpCenter);
        const shellDistance = Math.sqrt((radial.x / scalpRadii.x) ** 2 + (radial.y / scalpRadii.y) ** 2 + (radial.z / scalpRadii.z) ** 2);
        radial.divideScalar(Math.max(.001, shellDistance));
        return center.copy(scalpCenter).add(radial);
      };
      buffer(material).grid(24, 12, (t, u) => {
        const center = onScalp(t), tangent = onScalp(Math.min(1, t + .001)).sub(onScalp(Math.max(0, t - .001))).normalize();
        const outward = center.clone().sub(scalpCenter).normalize();
        outward.addScaledVector(tangent, -outward.dot(tangent)).normalize();
        const across = new THREE.Vector3().crossVectors(tangent, outward).normalize();
        const swelling = .40 + .60 * Math.sin(Math.PI * t) ** .65;
        const taper = 1 - smooth(.69, 1, t);
        const radius = (tip + width * .64 * swelling * taper) * unit;
        const angle = u * Math.PI * 2;
        return center.addScaledVector(across, Math.sin(angle) * radius)
          .addScaledVector(outward, Math.cos(angle) * radius * Math.max(.22, thickness));
      });
    }

    // Broad curved locks overlap like drawn shape groups. Thin tips follow the
    // sweep instead of sticking radially out like spikes or parallel tubes.
    lock(mainHair, [[.041,1.746,-.038],[.011,1.761,-.073],[-.037,1.736,-.113],[-.073,1.698,-.104],[-.093,1.665,-.071]], .018);
    lock(lightHair, [[.044,1.749,-.016],[.006,1.759,-.041],[-.045,1.748,-.072],[-.082,1.706,-.061],[-.101,1.650,-.017]], .017, .23);
    lock(mainHair, [[.034,1.754,-.010],[.010,1.779,.009],[-.039,1.755,.067],[-.074,1.694,.106],[-.068,1.606,.107]], .025);
    lock(shadowHair, [[.046,1.741,-.052],[.074,1.738,-.080],[.100,1.682,-.076],[.107,1.621,-.036],[.099,1.594,-.018]], .017);
    lock(mainHair, [[.041,1.751,-.018],[.078,1.749,.001],[.104,1.704,.053],[.102,1.640,.070],[.087,1.591,.066]], .019);
    lock(lightHair, [[.044,1.754,.012],[.077,1.747,.043],[.096,1.700,.086],[.081,1.633,.110],[.065,1.575,.103]], .016, .23);

    for (let layer = -4; layer <= 4; layer += 1) {
      const a = layer * .27;
      const s = Math.sin(a), c = Math.cos(a);
      const controls = [
        [.019 + s * .036, 1.744 + .007 * c, .026 + .028 * c],
        [s * .075 + .013, 1.715, .028 + .076 * c],
        [s * .106 + .005, 1.648, .013 + .115 * c],
        [s * .094 + .009, 1.555 + .010 * Math.cos(layer * 1.9), .005 + .104 * c],
      ];
      lock(layer % 3 === 0 ? lightHair : layer % 2 === 0 ? mainHair : shadowHair, controls, .0155 + .002 * c, .25);
    }
    [-1, 1].forEach((side) => {
      lock(shadowHair, [[side*.086,1.686,-.054],[side*.104,1.652,-.043],[side*.107,1.613,-.027],[side*.099,1.579,-.018]], .012, .23);
      lock(mainHair, [[side*.089,1.673,.025],[side*.109,1.633,.034],[side*.105,1.589,.052],[side*.085,1.559,.066]], .012, .25);
    });

    function metalCurve(material, controls, radius) {
      const curve = new THREE.CatmullRomCurve3(controls.map((p) => P(...p)), false, 'centripetal');
      buffer(material).grid(36, 8, (t, u) => {
        const p = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
        const normal = p.clone().sub(scalpCenter).normalize();
        normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        return p.addScaledVector(normal, Math.cos(u * Math.PI * 2) * radius * unit).addScaledVector(side, Math.sin(u * Math.PI * 2) * radius * unit);
      });
    }
    // The diadem follows the exposed front hairline and disappears into the
    // side layers. There is no disconnected horizontal halo around the crown.
    const hairline = (angle, y, lift = .0027) => {
      const radius = Math.sqrt(Math.max(.01, 1 - ((y - 1.628) / .127) ** 2));
      return [Math.sin(angle) * (.106 * radius + lift), y,
        -.008 - Math.cos(angle) * (.113 * radius + lift)];
    };
    const diadem = Array.from({ length: 29 }, (_, index) => {
      const angle = (index / 28 * 2 - 1) * 1.47;
      return hairline(angle, 1.691 + .008 * Math.cos(angle));
    });
    metalCurve(gold, diadem, .0019);
    metalCurve(gold, [[-.22,1.699],[-.11,1.705],[0,1.714],[.11,1.705],[.22,1.699]].map(([a,y]) => hairline(a,y,.0034)), .0019);
    const enamel = hairline(0, 1.705, .0045);
    buffer(gem).grid(9, 14, (v, u) => {
      const phi = v * Math.PI, theta = u * Math.PI * 2;
      return P(Math.sin(phi) * Math.sin(theta) * .004, enamel[1] + Math.cos(phi) * .005,
        enamel[2] - Math.sin(phi) * Math.cos(theta) * .002);
    });

    buffers.forEach((value) => value.finish());
    const previousTag = root.userData.journeyPrinceHead;
    const stats = {
      style: 'swept-walnut-animation-prince', ownsCirclet: true, irisPalette: 'dark-chestnut', shapedMeshes, shapedVertices,
      hairLocks: 19, meshes: group.children.length,
      vertices: group.children.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0),
      triangles: group.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0),
      faceFocus: P(0, 1.610, -.065).toArray(),
    };
    root.userData.journeyPrinceHead = stats;
    const api = {
      root: group, stats,
      dispose() {
        if (disposed) return;
        disposed = true;
        group.removeFromParent();
        changes.forEach(({ mesh, geometry, material, visible }) => {
          if (geometry) mesh.geometry = geometry;
          if (material) mesh.material = material;
          if (visible !== undefined) mesh.visible = visible;
        });
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
        textures.forEach((texture) => texture.dispose());
        if (previousTag === undefined) delete root.userData.journeyPrinceHead;
        else root.userData.journeyPrinceHead = previousTag;
        sculpted.delete(root);
      },
    };
    sculpted.set(root, api);
    return api;
  };
})();
