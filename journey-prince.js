(() => {
  const dressed = new WeakMap();

  // Tailored in the imported model's rest space. The head, hands and complete
  // humanoid skeleton stay intact; every new garment uses that same skin.
  window.dressJourneyPrince = ({ gltf, root = gltf?.scene, bones } = {}) => {
    const THREE = window.THREE;
    if (!THREE || !root || !bones?.hips || !bones?.neck || !bones?.head) return null;
    if (dressed.has(root)) return dressed.get(root);
    root.updateWorldMatrix(true, true);
    const originals = [];
    root.traverse((object) => { if (object.isSkinnedMesh) originals.push(object); });
    const surfaces = (object) => Array.isArray(object.material) ? object.material : [object.material];
    const source = originals.find((object) => surfaces(object).some((material) => /Tops|Body.*SKIN/i.test(material?.name || '')));
    if (!source?.skeleton) return null;

    const group = new THREE.Group();
    group.name = 'JourneyPrince/RoyalTailoring';
    root.add(group);
    const ownedMaterials = new Set();
    const geometries = new Set();
    const mutations = [];
    const animated = [];
    let disposed = false;
    const index = {};
    Object.entries(bones).forEach(([name, bone]) => { index[name] = source.skeleton.bones.indexOf(bone); });
    const joint = (name) => Math.max(0, index[name] ?? index.chest ?? index.spine ?? index.hips);
    const point = (name) => root.worldToLocal(bones[name].getWorldPosition(new THREE.Vector3()));
    const hips = point('hips');
    const neck = point('neck');
    const unit = (neck.y - hips.y) / .43427527;
    const origin = new THREE.Vector3(hips.x, hips.y - 1.01838338 * unit, hips.z + .009861458 * unit);
    const P = (x, y, z) => new THREE.Vector3(x, y, z).multiplyScalar(unit).add(origin);
    const W = (a, b = a, blend = 0) => [joint(a), joint(b), 1 - blend, blend];
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
    const torsoWeights = (position) => {
      const y = (position.y - origin.y) / unit;
      return y < 1.15 ? W('hips', 'spine', smooth((y - 1.03) / .12))
        : W('spine', 'chest', smooth((y - 1.15) / .16));
    };

    function material(name, color, roughness = .86) {
      const value = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side: THREE.DoubleSide });
      value.name = `JourneyPrince/${name}_CLOTH`;
      value.userData.journeyRoyalGarment = true;
      ownedMaterials.add(value);
      return value;
    }
    const navy = material('TailoredMidnight', '#31465a');
    const mantleCloth = material('IndigoDrapedMantle', '#566b7c');
    const gold = material('AntiqueGoldEmbroidery', '#d3ad69', .65);
    const lightGold = material('PaleGoldHighlights', '#f4d98f', .65);
    const boot = material('RidingBootLeather', '#263044', .72);
    const trouser = material('TailoredBreeches', '#30394f');
    const jewel = material('SapphireEnamel', '#5a91ad', .55);

    // One buffer per fabric combines trims and ornaments without a draw call
    // per button. Flutter is stored only on the cape and the split coat tails.
    class ClothBuffer {
      constructor(surface) { this.surface = surface; this.p = []; this.i = []; this.w = []; this.f = []; this.faces = []; }
      vertex(position, weights, flutter = 0) {
        const n = this.p.length / 3;
        this.p.push(position.x, position.y, position.z);
        this.i.push(weights[0], weights[1], 0, 0);
        this.w.push(weights[2], weights[3], 0, 0);
        this.f.push(flutter);
        return n;
      }
      grid(rows, columns, sample, reverse = false) {
        const start = this.p.length / 3;
        for (let row = 0; row <= rows; row += 1) {
          for (let col = 0; col <= columns; col += 1) {
            const value = sample(row / rows, col / columns);
            this.vertex(value.p, value.w, value.f || 0);
          }
        }
        for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
          const a = start + row * (columns + 1) + col, b = a + columns + 1;
          if (reverse) this.faces.push(a, b, a + 1, a + 1, b, b + 1);
          else this.faces.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      finish() {
        if (!this.p.length) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.i, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.w, 4));
        geometry.setIndex(this.faces);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        geometries.add(geometry);
        const mesh = new THREE.SkinnedMesh(geometry, this.surface);
        mesh.name = this.surface.name;
        mesh.skeleton = source.skeleton;
        mesh.bindMode = source.bindMode;
        mesh.bindMatrix.copy(source.bindMatrix);
        mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
        mesh.frustumCulled = false;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.journeyRoyalGarment = true;
        group.add(mesh);
        if (this.f.some((value) => value !== 0)) animated.push({ geometry, base: new Float32Array(this.p), flutter: this.f });
      }
    }
    const buffers = new Map();
    const fabric = (surface) => {
      if (!buffers.has(surface)) buffers.set(surface, new ClothBuffer(surface));
      return buffers.get(surface);
    };

    function tube(surface, samples, radius, weightAt = torsoWeights, flutterAt = () => 0, sides = 6) {
      const out = fabric(surface), first = out.p.length / 3;
      samples.forEach((p, n) => {
        const before = samples[Math.max(0, n - 1)], after = samples[Math.min(samples.length - 1, n + 1)];
        const tangent = after.clone().sub(before).normalize();
        const normal = Math.abs(tangent.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        for (let side = 0; side <= sides; side += 1) {
          const angle = side / sides * Math.PI * 2;
          const v = p.clone().addScaledVector(normal, Math.cos(angle) * radius * unit).addScaledVector(binormal, Math.sin(angle) * radius * unit);
          out.vertex(v, weightAt(p, n / (samples.length - 1)), flutterAt(p, n / (samples.length - 1)));
        }
      });
      for (let n = 0; n < samples.length - 1; n += 1) for (let side = 0; side < sides; side += 1) {
        const a = first + n * (sides + 1) + side, b = a + sides + 1;
        out.faces.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const curve = (count, sample) => Array.from({ length: count + 1 }, (_, i) => sample(i / count));
    function oval(surface, center, radius, weights, flutter = 0) {
      const out = fabric(surface);
      out.grid(8, 12, (v, u) => {
        const phi = v * Math.PI, theta = u * Math.PI * 2;
        return { p: center.clone().add(new THREE.Vector3(Math.sin(phi) * Math.sin(theta) * radius[0], Math.cos(phi) * radius[1], Math.sin(phi) * Math.cos(theta) * radius[2]).multiplyScalar(unit)), w: weights, f: flutter };
      }, true);
    }

    // Hide the actual hoodie primitive, including its hood, hem and rib cuffs.
    // Preserve skin primitives so the original neck and articulated hands show.
    originals.forEach((mesh) => {
      const old = surfaces(mesh), names = old.map((surface) => surface?.name || '');
      if (names.every((name) => /Tops.*CLOTH/i.test(name))) {
        mutations.push({ mesh, visible: mesh.visible });
        mesh.visible = false;
      } else if (names.some((name) => /Tops.*CLOTH/i.test(name)) && mesh.geometry.groups.length) {
        const previous = mesh.geometry, replacement = previous.clone();
        replacement.groups = replacement.groups.filter((entry) => !/Tops.*CLOTH/i.test(names[entry.materialIndex] || ''));
        geometries.add(replacement);
        mutations.push({ mesh, geometry: previous });
        mesh.geometry = replacement;
      }
      if (names.some((name) => /Bottoms|Shoes/i.test(name))) {
        const replacement = old.map((surface) => /Bottoms/i.test(surface?.name || '') ? trouser : /Shoes/i.test(surface?.name || '') ? boot : surface);
        mutations.push({ mesh, material: mesh.material });
        mesh.material = Array.isArray(mesh.material) ? replacement : replacement[0];
      }
      // The source skin includes the entire arm underneath its old hoodie.
      // Keep the neck and articulated hands, but remove strictly covered arm
      // triangles so an inner elbow cannot poke through a bent cloth surface.
      if (names.every((name) => /Body.*SKIN/i.test(name)) && mesh.geometry.index) {
        const geometry = mesh.geometry, positions = geometry.attributes.position;
        const wristLimit = Math.min(Math.abs(point('leftHand').x - origin.x), Math.abs(point('rightHand').x - origin.x)) - .012 * unit;
        const covered = (vertex) => {
          const x = Math.abs(positions.getX(vertex) - origin.x), y = (positions.getY(vertex) - origin.y) / unit;
          const underShoulder = x > .105 * unit || (x > .062 * unit && y < 1.450);
          const underTunic = x < .195 * unit && y > .975 && y < 1.429;
          return underTunic || (underShoulder && x < wristLimit && y > 1.20 && y < 1.52);
        };
        const kept = [];
        for (let i = 0; i < geometry.index.count; i += 3) {
          const a = geometry.index.getX(i), b = geometry.index.getX(i + 1), c = geometry.index.getX(i + 2);
          if (!(covered(a) && covered(b) && covered(c))) kept.push(a, b, c);
        }
        const replacement = geometry.clone();
        replacement.setIndex(kept);
        geometries.add(replacement);
        mutations.push({ mesh, geometry });
        mesh.geometry = replacement;
      }
    });

    const coatProfile = [
      [.985, .148, .102], [1.025, .149, .103], [1.09, .133, .094],
      [1.19, .143, .100], [1.30, .157, .104], [1.377, .159, .105],
      [1.417, .122, .094], [1.448, .064, .068], [1.477, .059, .058],
    ];
    const section = (v) => {
      const scaled = v * (coatProfile.length - 1), at = Math.min(coatProfile.length - 2, Math.floor(scaled));
      return coatProfile[at].map((value, i) => THREE.MathUtils.lerp(value, coatProfile[at + 1][i], scaled - at));
    };
    fabric(navy).grid(32, 40, (v, u) => {
      const [y, width, depth] = section(v), theta = u * Math.PI * 2;
      const p = P(Math.sin(theta) * width, y, Math.cos(theta) * depth - .005);
      return { p, w: torsoWeights(p) };
    });
    // A narrow standing collar, waist piping and front closure replace sportswear cues.
    [ [1.475, .060, .060, .0032], [1.087, .135, .096, .005] ].forEach(([y, width, depth, r]) => {
      tube(gold, curve(48, (t) => P(Math.sin(t * Math.PI * 2) * width, y, Math.cos(t * Math.PI * 2) * depth - .005)), r);
    });
    tube(gold, curve(24, (t) => P(0, THREE.MathUtils.lerp(1.095, 1.443, t), -.108 + .036 * t ** 3)), .0027);
    [1.145, 1.218, 1.289, 1.354].forEach((y) => oval(lightGold, P(.028, y, -.107), [.0055, .006, .0035], torsoWeights(P(.028, y, -.107))));

    ['left', 'right'].forEach((side) => {
      const shoulder = point(`${side}UpperArm`), elbow = point(`${side}LowerArm`), wrist = point(`${side}Hand`);
      const direction = wrist.clone().sub(shoulder).normalize();
      const normal = new THREE.Vector3(0, 1, 0).addScaledVector(direction, -direction.y).normalize();
      const binormal = new THREE.Vector3().crossVectors(direction, normal).normalize();
      const shoulderToElbow = shoulder.distanceTo(elbow), length = shoulder.distanceTo(wrist);
      const elbowT = shoulderToElbow / length;
      const centerAt = (t) => t < elbowT ? shoulder.clone().lerp(elbow, t / elbowT) : elbow.clone().lerp(wrist, (t - elbowT) / (1 - elbowT));
      const weights = (t) => t < .18
        ? W('chest', `${side}UpperArm`, smooth((t + .025) / .20))
        : W(`${side}UpperArm`, `${side}LowerArm`, smooth((t - elbowT + .13) / .26));
      const capStart = -.018 * unit / length;
      const width = (t) => t < 0 ? Math.max(.0015, .058 * Math.sqrt(Math.max(0, 1 - (t / capStart) ** 2)))
        : t < elbowT ? THREE.MathUtils.lerp(.058, .055, t / elbowT) : THREE.MathUtils.lerp(.058, .034, (t - elbowT) / (1 - elbowT));
      fabric(navy).grid(26, 24, (v, u) => {
        // Close the sleeve with an ellipsoidal shoulder cap. A full-width open
        // first ring would become a square, cut-flat shoulder when arms lower.
        const t = v < .2 ? THREE.MathUtils.lerp(capStart, .08, smooth(v / .2))
          : THREE.MathUtils.lerp(.08, .974, (v - .2) / .8);
        const theta = u * Math.PI * 2;
        const p = centerAt(t).addScaledVector(normal, Math.cos(theta) * width(t) * unit).addScaledVector(binormal, Math.sin(theta) * width(t) * .91 * unit);
        // Lower the outer shoulder gently toward the sleeve. This preserves
        // the closed cap while replacing the horizontal padded-shoulder line.
        const shoulderSlope = (1 - smooth(t / .20)) * Math.min(1, width(t) / .064);
        p.addScaledVector(direction, .010 * unit * Math.cos(theta) * shoulderSlope);
        p.y -= .035 * unit * (1 - smooth((t + .035) / .24));
        return { p, w: weights(t) };
      });
      // Slim cuffs end above the wrist; no geometry enters the shared grip.
      [.939, .972].forEach((t) => {
        const center = centerAt(t);
        tube(gold, curve(28, (f) => center.clone().addScaledVector(normal, Math.cos(f * Math.PI * 2) * .036 * unit).addScaledVector(binormal, Math.sin(f * Math.PI * 2) * .033 * unit)), .0032, () => weights(t));
      });
      const knee = point(`${side}LowerLeg`), ankle = point(`${side}Foot`);
      fabric(boot).grid(10, 24, (v, u) => {
        const t = THREE.MathUtils.lerp(.39, .99, v), center = knee.clone().lerp(ankle, t);
        const radius = THREE.MathUtils.lerp(.063, .042, v) * unit, theta = u * Math.PI * 2;
        const p = center.add(new THREE.Vector3(Math.sin(theta) * radius, 0, Math.cos(theta) * radius * 1.04));
        return { p, w: W(`${side}LowerLeg`) };
      }, true);
      const bootTop = knee.clone().lerp(ankle, .39);
      tube(gold, curve(28, (t) => bootTop.clone().add(new THREE.Vector3(Math.sin(t * Math.PI * 2) * .063, 0, Math.cos(t * Math.PI * 2) * .0655).multiplyScalar(unit))), .0032, () => W(`${side}LowerLeg`));
    });

    // The open-front coat has two independent, tapered rear panels. Knees and
    // both feet remain legible, and the middle slit does not bridge the legs.
    function tail(sign, v, u) {
      const angle = .135 + u * 1.53;
      const p = P(sign * Math.sin(angle) * (.148 + .044 * v), 1.026 - v * (.326 - .102 * u), .004 + Math.cos(angle) * (.105 + .077 * v));
      return { p, w: W('hips', 'spine', .08 * (1 - v)), f: -v };
    }
    [-1, 1].forEach((sign) => {
      fabric(navy).grid(16, 18, (v, u) => tail(sign, v, u), sign > 0);
      tube(gold, curve(24, (t) => tail(sign, 1, t).p), .0031, () => W('hips'), () => -1);
      tube(gold, curve(18, (t) => tail(sign, t, 0).p), .0028, (_, t) => tail(sign, t, 0).w, (_, t) => -t);
    });

    const mantleRadii = (v) => {
      const shoulder = smooth(v / .28), hanging = smooth((v - .28) / .72);
      return [.072 + .139 * shoulder + .023 * hanging, .074 + .081 * shoulder + .059 * hanging];
    };
    function mantle(v, u) {
      const angle = (u * 2 - 1) * 1.35, side = Math.sin(angle);
      const [width, depth] = mantleRadii(v);
      const fold = .014 * Math.sin(angle * 5 + v * .45) * smooth(v / .7);
      // This is an open, curved shoulder cloak, not a panel on the back: the
      // collar arcs around the neck and the sides turn toward the upper arms.
      const p = P(side * (width + fold * .3), 1.453 - .348 * v + .047 * side * side * v
        + (.008 * Math.cos(angle * 6) + .009 * side) * v * v,
      .008 + Math.cos(angle) * (depth + fold));
      return { p, w: W('chest', 'spine', .19 * v), f: v };
    }
    fabric(mantleCloth).grid(24, 40, mantle, true);
    tube(gold, curve(40, (t) => mantle(1, t).p), .0028, () => W('chest', 'spine', .19), () => 1);
    [0, 1].forEach((side) => tube(gold, curve(25, (t) => mantle(t, side).p), .0026, (_, t) => mantle(t, side).w, (_, t) => t));
    // Original heraldic leaf embroidery lies on the curved cloth, rather than
    // floating in a flat plane behind it in the profile shot.
    const embroidery = (x, y, lift = .003) => {
      let low = 0, high = 1;
      for (let i = 0; i < 12; i += 1) {
        const v = (low + high) * .5;
        const u = .5 + Math.asin(clamp(x / mantleRadii(v)[0], -1, 1)) / 2.70;
        const candidate = mantle(v, u).p;
        if (candidate.y > origin.y + y * unit) low = v;
        else high = v;
      }
      const v = (low + high) * .5;
      const u = .5 + Math.asin(clamp(x / mantleRadii(v)[0], -1, 1)) / 2.70;
      return mantle(v, u).p.add(new THREE.Vector3(0, 0, lift * unit));
    };
    [-1, 1].forEach((side) => {
      tube(gold, curve(18, (t) => {
        const angle = THREE.MathUtils.lerp(-1.15, 1.10, t);
        return embroidery(side * (.013 + Math.cos(angle) * .040), 1.286 + Math.sin(angle) * .050);
      }), .0021, () => W('chest', 'spine', .09), () => .50);
      [.24, .43, .62, .8].forEach((t) => {
        const angle = THREE.MathUtils.lerp(-1.15, 1.10, t);
        oval(lightGold, embroidery(side * (.014 + Math.cos(angle) * .044), 1.287 + Math.sin(angle) * .050, .004), [.007, .012, .0018], W('chest', 'spine', .09), .50);
      });
    });
    oval(gold, embroidery(0, 1.296, .004), [.012, .018, .003], W('chest', 'spine', .09), .50);
    oval(jewel, embroidery(0, 1.296, .008), [.007, .012, .0025], W('chest', 'spine', .09), .50);

    // A thin circlet sits within the hair silhouette; only its central point
    // rises slightly. It reads as a prince's ornament rather than a heavy crown.
    if (!root.userData.journeyPrinceHead?.ownsCirclet) {
      tube(gold, curve(64, (t) => {
        const a = t * Math.PI * 2;
        return P(Math.sin(a) * .108, 1.692 + .007 * Math.cos(a), -.010 + Math.cos(a) * .139);
      }), .0032, () => W('head'));
      tube(lightGold, [P(-.042, 1.685, -.139), P(-.022, 1.705, -.148), P(0, 1.727, -.152), P(.022, 1.705, -.148), P(.042, 1.685, -.139)], .0033, () => W('head'));
      oval(jewel, P(0, 1.706, -.154), [.008, .011, .003], W('head'));
    }

    buffers.forEach((buffer) => buffer.finish());
    const stats = {
      style: 'midnight-prince', meshes: group.children.length,
      vertices: group.children.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0),
      triangles: group.children.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || 0) / 3, 0),
      preservedHeadHandsAndSkeleton: true,
    };
    const previousTag = root.userData.journeyPrince;
    root.userData.journeyPrince = stats;
    const api = {
      root: group, stats,
      update(seconds = 0, shot = {}) {
        if (disposed) return;
        const energy = .40 + .60 * clamp(Number.isFinite(shot.pace) ? shot.pace : 1);
        animated.forEach(({ geometry, base, flutter }) => {
          const positions = geometry.attributes.position;
          flutter.forEach((value, vertex) => {
            if (!value) return;
            const f = Math.abs(value), delay = value < 0 ? .7 : 0, at = vertex * 3;
            positions.array[at] = base[at] + Math.sin(seconds * 1.65 - f * 1.4 + delay) * .0025 * unit * f * f * energy;
            positions.array[at + 1] = base[at + 1] + Math.sin(seconds * 2.1 - f + delay) * .0012 * unit * f * f;
            positions.array[at + 2] = base[at + 2] + (.004 + Math.sin(seconds * 2.25 - f * 1.7 + delay) * .0045) * unit * f * f * energy;
          });
          positions.needsUpdate = true;
          geometry.computeVertexNormals();
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        group.removeFromParent();
        mutations.forEach(({ mesh, material: originalMaterial, geometry: originalGeometry, visible }) => {
          if (originalMaterial !== undefined) mesh.material = originalMaterial;
          if (originalGeometry) mesh.geometry = originalGeometry;
          if (visible !== undefined) mesh.visible = visible;
        });
        geometries.forEach((geometry) => geometry.dispose());
        ownedMaterials.forEach((surface) => surface.dispose());
        if (previousTag === undefined) delete root.userData.journeyPrince;
        else root.userData.journeyPrince = previousTag;
        dressed.delete(root);
      },
    };
    dressed.set(root, api);
    return api;
  };
})();
