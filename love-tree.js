(() => {
  "use strict";

  const T = window.THREE;
  if (!T) return;

  const TAU = Math.PI * 2;
  const AMBER = 0xf2ba65;
  const PALE_GOLD = 0xffe2ad;
  const MODEL_SCALE = 0.29;
  const ROOT_Y = -0.83;

  let seed = 89219;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const range = (min, max) => min + (max - min) * random();
  const v = (x, y, z) => new T.Vector3(x, y, z);
  const curve = (points) => new T.CatmullRomCurve3(points);
  const yAxis = v(0, 1, 0);
  const color = (hex) => new T.Color(hex);

  function addTube(wood, path, startRadius, endRadius, rings, sides, grain) {
    const frames = path.computeFrenetFrames(rings, false);
    const base = wood.positions.length / 3;
    const shade = color(0x926940);
    const phase = range(0, TAU);
    for (let ring = 0; ring <= rings; ring += 1) {
      const t = ring / rings;
      const centre = path.getPointAt(t);
      const radius = endRadius + (startRadius - endRadius) * (1 - t) ** 1.12;
      for (let side = 0; side < sides; side += 1) {
        const angle = side / sides * TAU;
        const rib = Math.sin(angle * 5 + t * 3 + phase);
        const furrow = Math.sin(angle * 11 - t * 5 + phase);
        const edge = radius * (1 + grain * (.65 * rib + .35 * furrow));
        const point = centre.clone()
          .addScaledVector(frames.normals[ring], Math.cos(angle) * edge)
          .addScaledVector(frames.binormals[ring], Math.sin(angle) * edge);
        const tint = shade.clone().multiplyScalar(.82 + rib * .16 + furrow * .1 + .12 * t);
        wood.positions.push(point.x, point.y, point.z);
        wood.colors.push(tint.r, tint.g, tint.b);
        if (ring === 0) continue;
        const prev = base + (ring - 1) * sides;
        const next = (side + 1) % sides;
        wood.indices.push(prev + side, prev + next, prev + sides + side,
          prev + next, prev + sides + next, prev + sides + side);
      }
    }
  }

  function geometryFrom(positions, colors, indices) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    if (colors) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    if (indices) geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function growLimb(start, end, dip) {
    const elbow = start.clone().lerp(end, .34);
    elbow.y -= dip;
    const sweep = start.clone().lerp(end, .72);
    sweep.y -= dip * .45;
    return curve([start, elbow, sweep, end]);
  }

  function splitLimb(path, progress, reach, sweep, rise) {
    const start = path.getPoint(progress);
    const direction = path.getTangent(progress).applyAxisAngle(yAxis, sweep);
    const end = start.clone().addScaledVector(direction, reach);
    end.y += rise;
    return growLimb(start, end, .12);
  }

  function makeTree() {
    seed = 89219;
    const tree = new T.Group();
    const wood = { positions: [], colors: [], indices: [] };
    const anchors = [];
    const trunk = curve([
      v(0, .07, 0), v(.09, .88, .01), v(-.10, 1.74, .08), v(.06, 2.65, .03),
      v(.25, 3.58, -.17), v(.05, 4.50, -.37), v(.39, 5.74, -.59),
    ]);
    addTube(wood, trunk, .49, .024, 49, 33, .19);

    for (let root = 0; root < 10; root += 1) {
      const a = root / 10 * TAU + range(-.17, .17);
      const distance = range(1.02, 1.84);
      const tip = v(Math.cos(a) * distance, .08, Math.sin(a) * distance * .82);
      const start = v(Math.cos(a) * .17, range(.22, .50), Math.sin(a) * .17);
      const bend = start.clone().lerp(tip, .44);
      bend.y = range(.13, .24);
      const rootPath = curve([start, bend, tip]);
      addTube(wood, rootPath, range(.108, .185), .013, 15, 10, .19);
      addTube(wood, splitLimb(rootPath, .55, distance * .35, range(.3, .7), -.015), .068, .009, 8, 8, .10);
    }

    // The side view has its own silhouette because the scaffold grows along all three axes.
    const limbs = [
      { base: .27, end: [-3.92, 3.91, .29], radius: .205, dip: .43 },
      { base: .33, end: [3.94, 4.30, -.27], radius: .191, dip: .39 },
      { base: .38, end: [-1.51, 4.39, 2.82], radius: .164, dip: .37 },
      { base: .44, end: [1.78, 4.68, -2.83], radius: .157, dip: .31 },
      { base: .50, end: [-2.21, 5.15, -1.84], radius: .138, dip: .30 },
      { base: .53, end: [2.44, 5.30, 1.80], radius: .130, dip: .29 },
      { base: .62, end: [-1.58, 5.64, .96], radius: .112, dip: .24 },
      { base: .71, end: [1.32, 5.88, .08], radius: .091, dip: .22 },
      { base: .75, end: [-.62, 5.75, -1.48], radius: .079, dip: .18 },
    ];
    limbs.forEach(({ base, end, radius, dip }, i) => {
      const limb = growLimb(trunk.getPoint(base), v(...end), dip);
      addTube(wood, limb, radius * .83, .013, 25, 14, .14);
      anchors.push({ position: limb.getPoint(1), limb: i, tip: true });
      [.40, .63, .80].forEach((at, j) => {
        const sign = (i + j) % 2 ? -1 : 1;
        const fork = splitLimb(limb, at, range(.76, 1.28), sign * range(.60, 1.18), range(.23, .50));
        addTube(wood, fork, radius * (.49 - j * .09), .008, 13, 8, .10);
        anchors.push({ position: fork.getPoint(1), limb: i });
        [.54, .76].forEach((position, k) => {
          const twig = splitLimb(fork, position, range(.38, .67), sign * (k ? -.78 : .63), range(.09, .26));
          addTube(wood, twig, .028, .004, 7, 6, .10);
          anchors.push({ position: twig.getPoint(1), limb: i });
        });
      });
    });
    const bark = new T.MeshStandardMaterial({
      vertexColors: true, roughness: .88, emissive: AMBER, emissiveIntensity: .28,
    });
    bark.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 woodPoint;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nwoodPoint = position;');
      shader.fragmentShader = 'varying vec3 woodPoint;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 grainPoint = woodPoint.xz + vec2(
          .024 * sin(woodPoint.y * 3.5 + woodPoint.z * 6.),
          .018 * cos(woodPoint.y * 4.8 + woodPoint.x * 8.)
        );
        float ridge = sin(grainPoint.x * 57. + sin(grainPoint.y * 44.) * 1.8);
        float grain = sin(grainPoint.y * 117. + sin(grainPoint.x * 96.) + woodPoint.y * 3.);
        float split = smoothstep(.32, .92, ridge * .66 + grain * .34);
        diffuseColor.rgb *= .92 + ridge * .11 + grain * .07 - split * .25;
        diffuseColor.rgb *= .96 + .10 * sin(woodPoint.y * 8. + grainPoint.x * 12.);
      `).replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float edgeLight = pow(1. - abs(dot(normal, normalize(vViewPosition))), 3.15);
        totalEmissiveRadiance += vec3(.93, .57, .23) * edgeLight;
      `);
    };
    tree.add(new T.Mesh(geometryFrom(wood.positions, wood.colors, wood.indices), bark));
    return { tree, anchors };
  }

  function orderAnchors(anchors) {
    const angles = [0, 74 * Math.PI / 180, -.82];
    const weights = [.47, .45, .08];
    const candidates = anchors.map((anchor) => ({
      ...anchor,
      views: angles.map((angle) => {
        const { x, y, z } = anchor.position;
        const depth = Math.sin(angle) * x + Math.cos(angle) * z;
        const height = y - 3.46;
        const perspective = 18.8 / (18.8 - depth * Math.cos(.145) - height * Math.sin(.145));
        return [(Math.cos(angle) * x - Math.sin(angle) * z) * perspective,
          (height * Math.cos(.145) - depth * Math.sin(.145)) * perspective];
      }),
    }));
    const ordered = [];
    const byLimb = Array(9).fill(0);
    while (candidates.length) {
      let best = -Infinity;
      let choice = 0;
      candidates.forEach((candidate, index) => {
        const clearance = candidate.views.reduce((sum, [x, y], view) => {
          const nearest = ordered.reduce((distance, other) => {
            const [ox, oy] = other.views[view];
            return Math.min(distance, Math.max(Math.abs(x - ox) / .86, Math.abs(y - oy) / .61));
          }, 2.65);
          return sum + weights[view] * (nearest - Math.max(0, .57 - nearest) * 3.2);
        }, 0);
        const score = clearance + (candidate.tip ? .16 : 0) - byLimb[candidate.limb] * .095;
        if (score > best) { best = score; choice = index; }
      });
      const [anchor] = candidates.splice(choice, 1);
      byLimb[anchor.limb] += 1;
      ordered.push(anchor);
    }
    return ordered.map(({ position }) => ({ x: position.x * MODEL_SCALE,
      y: ROOT_Y + position.y * MODEL_SCALE, z: position.z * MODEL_SCALE }));
  }

  window.createLoveTree = (bakePhoto) => {
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return null;
    }
    renderer.setClearColor(0, 0);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;

    const { tree, anchors } = makeTree();
    const slots = orderAnchors(anchors);
    const fitPoints = slots.slice();
    const world = new T.Scene();
    const pivot = new T.Group();
    const photoLayer = new T.Group();
    const camera = new T.PerspectiveCamera();
    const raycaster = new T.Raycaster();
    const pointer = new T.Vector2();
    const twig = v(0, 0, 0);
    const plane = new T.PlaneGeometry(1, 1);
    const cards = new Map();
    const bark = tree.children[0];
    bark.material.transparent = true;
    tree.position.y = ROOT_Y;
    tree.scale.setScalar(MODEL_SCALE);
    pivot.add(tree);
    world.add(pivot, photoLayer);

    const rim = new T.DirectionalLight(PALE_GOLD, 2.48);
    rim.position.set(-5, 6.2, -4);
    const key = new T.DirectionalLight(0xffeed4, 2.13);
    key.position.set(5.9, 6.3, 6.2);
    world.add(rim, key, new T.HemisphereLight(0xe7c8a7, 0x453440, 1.37));

    const ringMaterial = new T.LineBasicMaterial({ color: AMBER, transparent: true, opacity: .28 });
    for (const multiplier of [1, 1.11]) {
      const points = new T.EllipseCurve(0, 0, 2.05 * multiplier, 1.42 * multiplier).getPoints(100);
      const ring = points.map(({ x, y }) => v(x * MODEL_SCALE, ROOT_Y - .01, y * MODEL_SCALE));
      if (multiplier > 1) fitPoints.push(...ring.filter((_, index) => index % 8 === 0));
      const geometry = new T.BufferGeometry().setFromPoints(ring);
      pivot.add(new T.LineLoop(geometry, ringMaterial));
    }

    const ties = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({
      color: PALE_GOLD, transparent: true, opacity: .65,
    }));
    ties.frustumCulled = false;
    ties.renderOrder = 1;
    world.add(ties);

    let view;
    let width, height, ratio;
    function prepare(next) {
      if (renderer.getContext().isContextLost() || next.width < 1 || next.height < 1) return false;
      view = next;
      if (width !== view.width || height !== view.height || ratio !== view.ratio) {
        ({ width, height, ratio } = view);
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
      }
      // Share the canvas projection so animation, cards and pointer targets coincide.
      const near = .10;
      const x = near / (view.scaleX * view.focal);
      const y = near / (view.scaleY * view.focal);
      camera.projectionMatrix.makePerspective(-view.centerX * x, (width - view.centerX) * x,
        view.centerY * y, (view.centerY - height) * y, near, 30);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.z = view.distance;
      camera.updateMatrixWorld();
      pivot.rotation.set(view.pitch, view.yaw, 0, "XYZ");
      pivot.updateMatrixWorld(true);
      return true;
    }

    function position(index) {
      const attach = slots[index % slots.length];
      const extra = Math.floor(index / slots.length);
      const stagger = extra ? .054 * Math.sin(index * 2.4) : 0;
      return { x: attach.x + stagger, y: attach.y - .105 - (extra % 4) * .048,
        z: attach.z + stagger, attach };
    }

    function clearTextures(entry) {
      entry.base?.dispose();
      entry.highlight?.dispose();
      entry.base = entry.highlight = null;
    }

    function sync(records) {
      const images = new Map(records.map(({ photo, image }) => [photo.id, image]));
      cards.forEach((entry, id) => {
        if (images.get(id) === entry.image) return;
        clearTextures(entry);
        entry.mesh.material.dispose();
        photoLayer.remove(entry.mesh);
        cards.delete(id);
      });
    }

    function cardMesh(record, highlighted) {
      const id = record.photo.id;
      let entry = cards.get(id);
      if (!entry) {
        const mesh = new T.Mesh(plane, new T.MeshBasicMaterial({
          transparent: true, alphaTest: .08, toneMapped: false,
        }));
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        photoLayer.add(mesh);
        entry = { mesh, image: record.image };
        cards.set(id, entry);
      }
      const loaded = record.image.complete && record.image.naturalWidth > 0;
      if (entry.loaded !== loaded) {
        clearTextures(entry);
        entry.loaded = loaded;
      }
      const key = highlighted ? "highlight" : "base";
      if (!entry[key]) {
        const texture = new T.CanvasTexture(bakePhoto(record, highlighted));
        texture.colorSpace = T.SRGBColorSpace;
        texture.minFilter = T.LinearFilter;
        texture.generateMipmaps = false;
        entry[key] = texture;
      }
      const material = entry.mesh.material;
      if (!material.map) material.needsUpdate = true;
      material.map = entry[key];
      return entry.mesh;
    }

    function render(projected, hovered, keyboardRecord, growth) {
      bark.material.opacity = .35 + .65 * growth;
      ringMaterial.opacity = growth * .28;
      ties.material.opacity = growth * .65;
      if (ties.geometry.attributes.position?.count !== projected.length * 2) {
        ties.geometry.dispose();
        ties.geometry = new T.BufferGeometry();
        ties.geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(projected.length * 6), 3)
          .setUsage(T.DynamicDrawUsage));
      }
      const lines = ties.geometry.attributes.position;
      projected.forEach((card, index) => {
        const { x, y, z, uX, uY, vX, vY, w, h, record } = card;
        const image = cardMesh(record, card === hovered || record === keyboardRecord);
        const horizontal = (view.distance - z) / (view.scaleX * view.focal);
        const vertical = (view.distance - z) / (view.scaleY * view.focal);
        const x3 = (x - view.centerX) * horizontal;
        const y3 = (view.centerY - y) * vertical;
        // The baked texture has transparent padding outside the clickable frame.
        const textureWidth = w * (160 / 136);
        const textureHeight = h * (120 / (136 * .73));
        image.matrix.set(uX * textureWidth * horizontal, -vX * textureHeight * horizontal, 0, x3,
          -uY * textureWidth * vertical, vY * textureHeight * vertical, 0, y3,
          0, 0, 1, z, 0, 0, 0, 1);
        image.matrixWorldNeedsUpdate = true;
        const endX = x3 - vX * h * .5 * horizontal;
        const endY = y3 + vY * h * .5 * vertical;
        const attach = record.to.attach;
        if (attach) pivot.localToWorld(twig.set(attach.x, attach.y, attach.z));
        else twig.set(endX, endY, z);
        lines.setXYZ(index * 2, endX + (twig.x - endX) * growth, endY + (twig.y - endY) * growth, z + (twig.z - z) * growth);
        lines.setXYZ(index * 2 + 1, endX, endY, z);
      });
      lines.needsUpdate = true;
      renderer.render(world, camera);
      return renderer.domElement;
    }

    function blocks(point, depth) {
      pointer.set(point.x / width * 2 - 1, 1 - point.y / height * 2);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(bark, false)[0];
      return Boolean(hit && hit.point.z > depth + .003);
    }

    return { prepare, position, sync, render, blocks, fitPoints };
  };
})();

