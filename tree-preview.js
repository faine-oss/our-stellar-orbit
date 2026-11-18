(() => {
  'use strict';

  const canvas = document.querySelector('#tree-canvas');
  const stage = document.querySelector('.lake');
  const help = document.querySelector('#tree-help');
  const status = document.querySelector('#tree-status');
  const angleLabel = document.querySelector('#tree-angle');
  const angleButtons = [...document.querySelectorAll('[data-angle]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const touchScreen = matchMedia('(hover: none)');
  const T = window.THREE;
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const TAU = Math.PI * 2;
  const SIDE_ANGLE = 74 * Math.PI / 180;

  function showUnavailable() {
    stage.classList.add('is-unavailable');
    help.textContent = '当前设备无法打开互动 3D。';
    status.textContent = help.textContent;
  }

  if (!T) {
    showUnavailable();
    return;
  }

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    showUnavailable();
    return;
  }

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
    const shade = color(0x845a50);
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
    const tree = new T.Group();
    const wood = { positions: [], colors: [], indices: [] };
    const buds = [];
    const trunk = curve([
      v(0, .07, 0), v(.09, .88, .01), v(-.10, 1.74, .08), v(.06, 2.65, .03),
      v(.25, 3.58, -.17), v(.05, 4.50, -.37), v(.39, 5.74, -.59),
    ]);
    addTube(wood, trunk, .44, .029, 49, 33, .15);

    for (let root = 0; root < 10; root += 1) {
      const a = root / 10 * TAU + range(-.17, .17);
      const distance = range(1.02, 1.84);
      const tip = v(Math.cos(a) * distance, .08, Math.sin(a) * distance * .82);
      const start = v(Math.cos(a) * .16, range(.28, .66), Math.sin(a) * .16);
      const bend = start.clone().lerp(tip, .44);
      bend.y = range(.13, .24);
      const rootPath = curve([start, bend, tip]);
      addTube(wood, rootPath, range(.115, .225), .016, 15, 10, .19);
      addTube(wood, splitLimb(rootPath, .55, distance * .35, range(.3, .7), -.015), .068, .009, 8, 8, .10);
    }

    // The side view has its own silhouette because the scaffold grows along all three axes.
    const limbs = [
      { base: .27, end: [-3.30, 3.84, .16], radius: .205, dip: .43 },
      { base: .33, end: [3.26, 4.18, -.20], radius: .191, dip: .39 },
      { base: .38, end: [-1.34, 4.35, 2.33], radius: .164, dip: .37 },
      { base: .44, end: [1.60, 4.64, -2.38], radius: .157, dip: .31 },
      { base: .50, end: [-1.90, 5.11, -1.67], radius: .138, dip: .30 },
      { base: .53, end: [2.15, 5.30, 1.60], radius: .130, dip: .29 },
      { base: .62, end: [-1.58, 5.64, .96], radius: .112, dip: .24 },
      { base: .71, end: [1.32, 5.88, .08], radius: .091, dip: .22 },
      { base: .75, end: [-.62, 5.75, -1.48], radius: .079, dip: .18 },
    ];
    function leafPocket(path, at, spread, count) {
      buds.push({ position: path.getPoint(at), heading: path.getTangent(at), spread, count });
    }

    limbs.forEach(({ base, end, radius, dip }, i) => {
      const limb = growLimb(trunk.getPoint(base), v(...end), dip);
      addTube(wood, limb, radius, .017, 25, 14, .12);
      [.40, .63, .80].forEach((at, j) => {
        const sign = (i + j) % 2 ? -1 : 1;
        const fork = splitLimb(limb, at, range(.76, 1.28), sign * range(.60, 1.18), range(.23, .50));
        addTube(wood, fork, radius * (.49 - j * .09), .008, 13, 8, .10);
        leafPocket(fork, .60, .45, 117);
        leafPocket(fork, 1, .56, 173);
        [.54, .76].forEach((position, k) => {
          const twig = splitLimb(fork, position, range(.38, .67), sign * (k ? -.78 : .63), range(.09, .26));
          addTube(wood, twig, .028, .004, 7, 6, .10);
          leafPocket(twig, 1, .40, 93);
        });
      });
      leafPocket(limb, .89, .48, 170);
      leafPocket(limb, 1, .61, 220);
    });
    leafPocket(trunk, .92, .63, 229);
    leafPocket(trunk, 1, .70, 325);
    const bark = new T.MeshStandardMaterial({ vertexColors: true, roughness: .94 });
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
      `);
    };
    tree.add(new T.Mesh(geometryFrom(wood.positions, wood.colors, wood.indices), bark));

    const leaf = geometryFrom([
      0, -.53, 0, -.28, -.25, -.025, -.40, .05, -.043, -.28, .36, -.035,
      0, .57, 0, .28, .36, -.03, .39, .05, -.04, .28, -.24, -.022, 0, .025, .056,
    ], null, [0, 1, 8, 1, 2, 8, 2, 3, 8, 3, 4, 8, 4, 5, 8, 5, 6, 8, 6, 7, 8, 7, 0, 8]);
    const leafMaterial = new T.MeshStandardMaterial({
      side: T.DoubleSide, roughness: .76, emissive: 0x582b3e, emissiveIntensity: .46,
    });
    const leaves = new T.InstancedMesh(leaf, leafMaterial, buds.reduce((total, bud) => total + bud.count, 0));
    const palette = [0x783953, 0x985269, 0xad5969, 0xc46d77, 0xdf7b7d, 0xe98c80, 0xeea187, 0xfcc49d].map(color);
    const dummy = new T.Object3D();
    let index = 0;
    for (const { position, heading, spread, count } of buds) {
      const yaw = Math.atan2(heading.x, heading.z);
      for (let j = 0; j < count; j += 1) {
        const a = range(0, TAU);
        const vertical = range(-1, 1);
        const radius = spread * Math.cbrt(random());
        const horizontal = radius * Math.sqrt(1 - vertical * vertical);
        const offset = v(Math.cos(a) * horizontal, vertical * radius * .65, Math.sin(a) * horizontal * 1.44);
        offset.applyAxisAngle(yAxis, yaw);
        dummy.position.copy(position).add(offset);
        dummy.rotation.set(range(-1.48, 1.48), range(-Math.PI, Math.PI), range(-2.05, 2.05));
        const size = range(.086, .179);
        dummy.scale.set(size * range(.78, 1.19), size, size);
        dummy.updateMatrix();
        leaves.setMatrixAt(index, dummy.matrix);
        const warm = Math.floor((random() ** 1.58 * .92 + .08 * Math.max(0, vertical)) * palette.length);
        leaves.setColorAt(index, palette[Math.min(palette.length - 1, warm)].clone().multiplyScalar(range(.78, 1.18)));
        index += 1;
      }
    }
    tree.add(leaves);
    return tree;
  }

  function makeShore() {
    const shore = new T.Group();
    const positions = [0, .17, 0];
    const turf = color(0x344942);
    const stone = color(0x2a334a);
    const colors = [turf.r, turf.g, turf.b];
    const indices = [];
    const slices = 68;
    const rings = [[.32, .15], [.63, .12], [.86, .075], [1, .012], [1, -.045]];
    const edge = (a) => 1 + .06 * Math.sin(3 * a + .6) + .035 * Math.sin(7 * a - .4) + .022 * Math.sin(13 * a);
    rings.forEach(([radius, y], ring) => {
      for (let i = 0; i < slices; i += 1) {
        const a = i / slices * TAU;
        const r = radius * edge(a);
        positions.push(2.37 * r * Math.cos(a), y + range(-.027, .027), 1.75 * r * Math.sin(a));
        const shade = turf.clone().lerp(stone, ring / rings.length).multiplyScalar(range(.68, 1.28));
        colors.push(shade.r, shade.g, shade.b);
        const here = 1 + ring * slices + i;
        const next = 1 + ring * slices + (i + 1) % slices;
        if (ring === 0) indices.push(0, next, here);
        else indices.push(here - slices, next, here, here - slices, next - slices, next);
      }
    });
    shore.add(new T.Mesh(geometryFrom(positions, colors, indices),
      new T.MeshStandardMaterial({ vertexColors: true, roughness: .99 })));

    const blade = geometryFrom([-.047, 0, 0, .047, 0, 0, .014, .48, -.04, -.01, .94, -.19],
      null, [0, 1, 2, 0, 2, 3]);
    const grasses = new T.InstancedMesh(blade, new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: .93 }), 1050);
    const dummy = new T.Object3D();
    const olive = color(0x40594a);
    const blue = color(0x283c43);
    for (let i = 0; i < grasses.count; i += 1) {
      const a = range(0, TAU);
      const r = range(.33, .98) * edge(a);
      const size = range(.068, .23);
      dummy.position.set(Math.cos(a) * r * 2.30, .18 * (1 - r * r) - .012, Math.sin(a) * r * 1.69);
      dummy.rotation.set(range(-.29, .29), a + range(-1.2, 1.2), range(-.4, .4));
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      grasses.setMatrixAt(i, dummy.matrix);
      grasses.setColorAt(i, olive.clone().lerp(blue, random()).multiplyScalar(range(.69, 1.28)));
    }
    shore.add(grasses);
    return shore;
  }

  const world = new T.Scene();
  const reflectedWorld = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, .1, 100);
  const tree = makeTree();
  const shore = makeShore();
  world.add(tree, shore);

  function addLights(scene, mirrored = false) {
    const moon = new T.DirectionalLight(0xaacaff, 1.92);
    moon.position.set(-5.0, 7.8, -4.8);
    const bank = new T.DirectionalLight(0xffc5a8, 1.49);
    bank.position.set(3.8, 5.8, 6);
    const fill = new T.HemisphereLight(0xa7acdf, 0x56404e, 1.68);
    if (mirrored) {
      moon.position.y *= -1;
      bank.position.y *= -1;
      fill.position.y *= -1;
    }
    scene.add(fill, moon, bank);
  }
  addLights(world);
  addLights(reflectedWorld, true);
  const mirroredTree = tree.clone();
  mirroredTree.scale.y = -1;
  reflectedWorld.add(mirroredTree);

  const reflection = new T.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
  const reflectionPass = new T.Scene();
  const reflectionUniforms = {
    reflected: { value: reflection.texture }, clock: { value: 0 },
    waterline: { value: .28 }, texel: { value: 1 },
  };
  const ripples = new T.Mesh(new T.PlaneGeometry(9.4, 7.0), new T.ShaderMaterial({
    uniforms: { clock: reflectionUniforms.clock },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 shoreUV;
      void main() {
        shoreUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform float clock;
      varying vec2 shoreUV;
      void main() {
        vec2 p = (shoreUV - .5) * 2.;
        float a = atan(p.y, p.x);
        float r = length(p) / (1. + .025 * sin(a * 7.) + .036 * sin(a * 3.));
        float reflectionGlint = .24 + .76 * pow(.5 + .5 * sin(5. * a - .8), 2.);
        float waves = pow(.5 + .5 * cos((r - .48) * 147. - clock * 1.5), 5.);
        waves *= smoothstep(.48, .51, r) * (1. - smoothstep(.60, .82, r)) * reflectionGlint;
        float contact = .28 * exp(-abs(r - .47) * 9.);
        float rim = exp(-abs(r - .51) * 70.) * reflectionGlint * .27;
        float light = rim + waves * .22;
        vec3 tint = mix(vec3(.026, .044, .088), vec3(.36, .39, .55), clamp(light * 3.4, 0., 1.));
        gl_FragColor = vec4(tint, contact + light);
      }
    `,
  }));
  ripples.rotation.x = -Math.PI / 2;
  ripples.position.y = .001;
  world.add(ripples);
  const reflectionMaterial = new T.ShaderMaterial({
    uniforms: reflectionUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 sampleUV;
      void main() {
        sampleUV = uv;
        gl_Position = vec4(position.xy, 0., 1.);
      }
    `,
    fragmentShader: `
      uniform sampler2D reflected;
      uniform float clock, waterline, texel;
      varying vec2 sampleUV;
      void main() {
        float depth = max(0., waterline - sampleUV.y);
        float ripple = sin(sampleUV.y * 470. + clock * 1.7);
        vec2 uv = sampleUV + vec2(ripple * (.0014 + depth * .042), sin(sampleUV.y * 210. - clock * 1.8) * .003);
        vec2 blur = vec2(texel * (1.1 + depth * 32.), 0.);
        vec4 ink = texture2D(reflected, uv) * .5;
        ink += texture2D(reflected, uv - blur) * .25;
        ink += texture2D(reflected, uv + blur) * .25;
        float mask = (1. - smoothstep(.032, .29, depth)) * (.59 + .09 * ripple);
        ink.rgb = mix(ink.rgb, vec3(.088, .109, .194), .27);
        gl_FragColor = vec4(ink.rgb, ink.a * mask * (1. - smoothstep(waterline, waterline + .012, sampleUV.y)));
        #include <colorspace_fragment>
      }
    `,
  });
  const reflectionQuad = new T.Mesh(new T.PlaneGeometry(2, 2), reflectionMaterial);
  reflectionQuad.frustumCulled = false;
  reflectionPass.add(reflectionQuad);
  const passCamera = new T.Camera();

  const fireflies = (() => {
    const positions = [], phases = [], sizes = [];
    for (let i = 0; i < 68; i += 1) {
      const a = range(0, TAU);
      const nearTree = i < 35;
      const r = nearTree ? range(1.35, 3.65) : range(2.2, 6.8);
      positions.push(Math.cos(a) * r, nearTree ? range(1.8, 5.3) : range(.12, 1.45), Math.sin(a) * r);
      phases.push(range(0, TAU));
      sizes.push(range(.52, 1.19));
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new T.Float32BufferAttribute(phases, 1));
    geometry.setAttribute('size', new T.Float32BufferAttribute(sizes, 1));
    return new T.Points(geometry, new T.ShaderMaterial({
      uniforms: { clock: reflectionUniforms.clock, density: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: `
        uniform float clock, density;
        attribute float phase, size;
        varying float glow;
        void main() {
          vec3 p = position;
          p.x += sin(clock * .59 + phase) * .17;
          p.y += cos(clock * .51 + phase) * .11;
          glow = pow(.5 + .5 * sin(clock * 1.12 + phase), 2.) * .82 + .15;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(size * density * 138. / -mv.z, 2., 16.);
        }
      `,
      fragmentShader: `
        varying float glow;
        void main() {
          float d = length(gl_PointCoord - .5) * 2.;
          float halo = exp(-d * d * 7.) * (1. - smoothstep(.62, 1., d));
          float core = exp(-d * d * 31.);
          gl_FragColor = vec4(mix(vec3(1., .58, .26), vec3(1., .89, .64), core), (halo * .48 + core * .68) * glow);
        }
      `,
    }));
  })();
  world.add(fireflies);

  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;

  let width, height, baseDistance, focusHeight;
  let yaw = 0, pitch = .145, zoom = 1;
  let targetYaw = yaw, targetPitch = pitch, targetZoom = zoom;
  let pointer;
  let frame;
  let lastFrame = 0;
  const floor = v(0, 0, 0);

  function sizeScene() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    const mobile = width <= 720;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.setViewOffset(width, height, mobile ? 0 : -width * .105, -height * (mobile ? .168 : .017), width, height);
    focusHeight = mobile ? 2.55 : 3.11;
    baseDistance = Math.max(18.8, 9.35 / (2 * Math.tan(17 * Math.PI / 180) * (width / height)));
    reflection.setSize(Math.max(1, Math.floor(width * pixelRatio * .5)), Math.max(1, Math.floor(height * pixelRatio * .5)));
    reflectionUniforms.texel.value = 1 / reflection.width;
    fireflies.material.uniforms.density.value = pixelRatio;
    requestFrame();
  }

  function draw(now) {
    frame = undefined;
    if (document.hidden || renderer.getContext().isContextLost()) return;
    const delta = Math.min(.05, (now - lastFrame) / 1000);
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-8.5 * delta);
    lastFrame = now;
    yaw += (targetYaw - yaw) * blend;
    pitch += (targetPitch - pitch) * blend;
    zoom += (targetZoom - zoom) * blend;
    const distance = baseDistance / zoom;
    const level = Math.cos(pitch) * distance;
    camera.position.set(Math.sin(yaw) * level, focusHeight + Math.sin(pitch) * distance, Math.cos(yaw) * level);
    camera.lookAt(0, focusHeight, 0);
    camera.updateMatrixWorld();
    reflectionUniforms.clock.value = reducedMotion.matches ? 0 : now / 1000;
    reflectionUniforms.waterline.value = floor.set(0, 0, 0).project(camera).y * .5 + .51;

    renderer.setRenderTarget(reflection);
    renderer.clear();
    renderer.render(reflectedWorld, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(reflectionPass, passCamera);
    renderer.clearDepth();
    renderer.render(world, camera);
    stage.dataset.ready = 'true';

    const degrees = T.MathUtils.euclideanModulo(Math.round(yaw * 180 / Math.PI), 360);
    const view = stage.dataset.view;
    angleLabel.firstChild.nodeValue = `${String(degrees).padStart(3, '0')}° `;
    angleLabel.lastChild.nodeValue = view === 'front' ? ' FRONT' : view === 'side' ? ' SIDE' : ' ORBIT';
    if (!reducedMotion.matches) requestFrame();
  }

  function requestFrame() {
    if (frame === undefined && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function select(view) {
    stage.dataset.view = view;
    angleButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.angle === view)));
  }

  angleButtons.forEach((button) => button.addEventListener('click', () => {
    const view = button.dataset.angle;
    const angle = view === 'front' ? 0 : SIDE_ANGLE;
    targetYaw = yaw + Math.atan2(Math.sin(angle - yaw), Math.cos(angle - yaw));
    targetPitch = .145;
    targetZoom = 1;
    select(view);
    status.textContent = view === 'front' ? '正面视角' : '侧面视角';
    requestFrame();
  }));

  canvas.addEventListener('pointerdown', (event) => {
    if (pointer || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    targetYaw -= dx * .008;
    targetPitch = clamp(targetPitch + dy * .004, -.04, .40);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (dx || dy) select('orbit');
    requestFrame();
  });
  function endDrag(event) {
    if (pointer?.id !== event.pointerId) return;
    pointer = undefined;
    canvas.classList.remove('is-dragging');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    targetZoom = clamp(targetZoom * Math.exp(-delta * .0011), .79, 1.36);
    requestFrame();
  }, { passive: false });
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); showUnavailable(); });
  canvas.addEventListener('webglcontextrestored', () => {
    stage.classList.remove('is-unavailable');
    updateHelp();
    sizeScene();
  });
  function updateHelp() {
    help.textContent = touchScreen.matches ? '拖动绕树' : '拖动绕树 · 滚轮缩放';
  }

  touchScreen.addEventListener('change', updateHelp);
  reducedMotion.addEventListener('change', requestFrame);
  document.addEventListener('visibilitychange', requestFrame);
  new ResizeObserver(sizeScene).observe(stage);
  updateHelp();
  select('front');
  sizeScene();
})();
