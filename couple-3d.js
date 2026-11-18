(() => {
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const smooth = (a, b, value) => {
    const amount = clamp((value - a) / (b - a));
    return amount * amount * (3 - 2 * amount);
  };

  window.createJourneyCouple3D = () => {
    const THREE = window.THREE;
    if (!THREE) return null;
    const canvas = document.createElement('canvas');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      return null;
    }
    let available = true;
    let disposed = false;
    const contextLost = (event) => { event.preventDefault(); available = false; };
    canvas.addEventListener('webglcontextlost', contextLost);
    renderer.setSize(768, 640, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const cast = new THREE.Group();
    scene.add(cast);
    const camera = new THREE.PerspectiveCamera(35, 768 / 640, .1, 20);
    camera.position.set(.23, 1.58, 3.8);
    camera.lookAt(0, .95, 0);
    camera.updateMatrixWorld();
    const foot = new THREE.Vector3(0, .01, 0).project(camera);
    const crown = new THREE.Vector3(-.36, 1.72, 0).project(camera);
    const framing = { footX: (foot.x + 1) / 2, footY: (1 - foot.y) / 2, bodyHeight: (crown.y - foot.y) / 2 };

    const ambient = new THREE.HemisphereLight(0xe8e5ef, 0x806654, 1.05);
    scene.add(ambient);
    const sunset = new THREE.DirectionalLight(0xffd9b4, 3.1);
    sunset.position.set(-3, 4.5, -3.5);
    sunset.castShadow = true;
    sunset.shadow.mapSize.set(1024, 1024);
    Object.assign(sunset.shadow.camera, { left: -1.8, right: 1.8, top: 2.3, bottom: -1.7, near: .1, far: 12 });
    sunset.shadow.bias = -.0005;
    sunset.shadow.normalBias = .015;
    sunset.shadow.radius = 3;
    scene.add(sunset);
    const fill = new THREE.DirectionalLight(0xf5ede7, 1.85);
    fill.position.set(2.5, 3, 4);
    scene.add(fill);
    const rose = new THREE.DirectionalLight(0xe9d0dc, .4);
    rose.position.set(-3, 1.6, 3);
    scene.add(rose);
    const duskLight = new THREE.Color(0xffd9b4);
    const starlight = new THREE.Color(0xc6d3ff);
    const duskFill = new THREE.Color(0xf5ede7);
    const nightFill = new THREE.Color(0xd7def7);
    const duskRose = new THREE.Color(0xe9d0dc);
    const lanternGold = new THREE.Color(0xffc388);

    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const geometry = (value) => { geometries.add(value); return value; };
    const material = (color, roughness = .78) => {
      const value = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      materials.add(value);
      return value;
    };
    const skin = material('#d4a187', .68);
    const skinShade = material('#bb8475', .74);
    const cream = material('#d8cbb8', .92);
    const ribbing = material('#bfb29f', .94);
    const trousers = material('#343b50', .9);
    const blush = material('#c58a9f', .84);
    const blushLight = material('#d8a6b6', .8);
    const blushShade = material('#aa758d', .88);
    const hairDark = material('#302729', .63);
    const hairWarm = material('#382d2d', .65);
    const hairGlint = material('#453635', .65);
    const shoe = material('#d7c9bd', .82);
    const sole = material('#a69b99', .9);
    const sphere = geometry(new THREE.SphereGeometry(1, 32, 24));

    function surfaceTexture(hair = false) {
      const surface = document.createElement('canvas');
      surface.width = surface.height = 128;
      const context = surface.getContext('2d');
      const pixels = context.createImageData(128, 128);
      for (let y = 0; y < 128; y += 1) {
        for (let x = 0; x < 128; x += 1) {
          const noise = Math.sin(x * 81.73 + y * 27.91) * 437.17;
          const grain = (noise - Math.floor(noise)) * 14;
          const weave = hair ? Math.sin(x * 2.8 + Math.sin(y * .08) * .65) * 20 : Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2) * 24;
          const value = 128 + weave + grain;
          const index = (y * 128 + x) * 4;
          pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
          pixels.data[index + 3] = 255;
        }
      }
      context.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(surface);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(hair ? 1 : 5, hair ? 1 : 5);
      textures.add(texture);
      return texture;
    }
    const fabricTexture = surfaceTexture();
    [cream, ribbing, trousers, blush, blushLight].forEach((surface) => {
      surface.bumpMap = fabricTexture;
      surface.bumpScale = .00055;
    });
    const hairTexture = surfaceTexture(true);
    [hairDark, hairWarm, hairGlint].forEach((surface) => {
      surface.bumpMap = hairTexture;
      surface.bumpScale = .00085;
    });

    function mesh(parent, shape, surface, position = [0, 0, 0], scale = [1, 1, 1]) {
      const object = new THREE.Mesh(shape, surface);
      object.position.set(...position);
      object.scale.set(...scale);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    }

    function oval(parent, surface, position, scale) {
      return mesh(parent, sphere, surface, position, scale);
    }

    // Elliptical sections give clothes shoulders, a waist and a soft, continuous silhouette.
    function loft(profile, folds = 0) {
      const positions = [];
      const uv = [];
      const indices = [];
      const segments = 48;
      const curve = new THREE.CatmullRomCurve3(profile.map(([y, x, z]) => new THREE.Vector3(x, y, z)));
      const sections = curve.getPoints((profile.length - 1) * 4);
      sections.forEach(({ y, x: radiusX, z: radiusZ }, ring) => {
        for (let index = 0; index <= segments; index += 1) {
          const angle = index / segments * Math.PI * 2;
          const fold = 1 + folds * (Math.sin(angle * 9 + .2) + .35 * Math.sin(angle * 17 + 1.6)) * (1 - ring / (sections.length - 1));
          positions.push(Math.cos(angle) * radiusX * fold, y, Math.sin(angle) * radiusZ * fold);
          uv.push(index / segments, ring / (sections.length - 1));
          if (ring && index) {
            const a = ring * (segments + 1) + index;
            const b = a - segments - 1;
            indices.push(a - 1, a, b - 1, b - 1, a, b);
          }
        }
      });
      const result = new THREE.BufferGeometry();
      result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      result.setIndex(indices);
      result.computeVertexNormals();
      return geometry(result);
    }

    function strand(parent, points, radius, surface) {
      const path = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
      const object = mesh(parent, geometry(new THREE.TubeGeometry(path, 20, radius, 5, false)), surface);
      object.castShadow = false;
      return object;
    }

    function hairLayer(parent, locks, surface) {
      const positions = [];
      const uv = [];
      const indices = [];
      const rows = 14;
      const sides = 8;
      locks.forEach(({ points, width, depth }) => {
        const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
        const frames = curve.computeFrenetFrames(rows, false);
        const offset = positions.length / 3;
        for (let row = 0; row <= rows; row += 1) {
          const t = row / rows;
          const center = curve.getPointAt(t);
          const normal = frames.normals[row];
          const binormal = new THREE.Vector3().crossVectors(normal, frames.tangents[row]);
          const taper = .02 + Math.pow(Math.sin(Math.PI * t), .65) * (1 - t * .18);
          for (let column = 0; column <= sides; column += 1) {
            const angle = column / sides * Math.PI * 2;
            const point = center.clone().addScaledVector(normal, Math.cos(angle) * width * taper).addScaledVector(binormal, Math.sin(angle) * depth * taper);
            positions.push(point.x, point.y, point.z);
            uv.push(column / sides, t);
            if (row && column) {
              const a = offset + row * (sides + 1) + column;
              const b = a - sides - 1;
              indices.push(a - 1, a, b - 1, b - 1, a, b);
            }
          }
        }
      });
      const shape = new THREE.BufferGeometry();
      shape.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      shape.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      shape.setIndex(indices);
      shape.computeVertexNormals();
      const layer = mesh(parent, geometry(shape), surface);
      layer.castShadow = false;
      return layer;
    }

    function garmentShape(profile, feminine) {
      const shape = loft(profile);
      const positions = shape.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const z = positions.getZ(index);
        if (z <= 0) continue;
        const waist = Math.exp(-(((y - (feminine ? .2 : .015)) / .075) ** 2));
        const shoulder = Math.exp(-(((y - .34) / .065) ** 2));
        const folds = Math.sin(y * 65 + Math.abs(x) * 18) * waist * .002 + Math.sin(x * 35 + y * 22) * shoulder * .0015;
        const back = Math.exp(-(((Math.abs(x) - .075) / .055) ** 2)) * Math.exp(-(((y - .31) / .12) ** 2)) * .003;
        positions.setZ(index, z + folds + back);
      }
      shape.computeVertexNormals();
      return shape;
    }

    function ring(parent, radius, thickness, surface, position, depth = 1) {
      const object = mesh(parent, geometry(new THREE.TorusGeometry(radius, thickness, 8, 48)), surface, position, [1, depth, 1]);
      object.rotation.x = Math.PI / 2;
      return object;
    }

    function bentLimb(parent, surface, radiusStart, radiusEnd) {
      const segments = 16;
      const rings = 24;
      const shape = new THREE.BufferGeometry();
      const sideVertices = (rings + 1) * (segments + 1);
      shape.setAttribute('position', new THREE.BufferAttribute(new Float32Array((sideVertices + 2) * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const uv = new Float32Array((sideVertices + 2) * 2);
      for (let row = 0; row <= rings; row += 1) {
        for (let column = 0; column <= segments; column += 1) {
          const index = row * (segments + 1) + column;
          uv[index * 2] = column / segments;
          uv[index * 2 + 1] = row / rings;
        }
      }
      shape.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const indices = [];
      for (let row = 1; row <= rings; row += 1) {
        for (let column = 1; column <= segments; column += 1) {
          const a = row * (segments + 1) + column;
          const b = a - segments - 1;
          indices.push(a - 1, a, b - 1, b - 1, a, b);
        }
      }
      for (let column = 1; column <= segments; column += 1) {
        indices.push(sideVertices, column - 1, column);
        indices.push(sideVertices + 1, rings * (segments + 1) + column, rings * (segments + 1) + column - 1);
      }
      shape.setIndex(indices);
      const object = mesh(parent, geometry(shape), surface);
      object.userData = { rings, segments, radiusStart, radiusEnd };
      object.frustumCulled = false;
      return object;
    }

    // A single curved surface follows both bones, so elbows and knees stay clothed.
    function setLimb(object, start, joint, end) {
      const { rings, segments, radiusStart, radiusEnd } = object.userData;
      const control = joint.clone().multiplyScalar(2).addScaledVector(start, -.5).addScaledVector(end, -.5);
      const vertices = object.geometry.attributes.position;
      const reference = new THREE.Vector3(0, 0, 1);
      for (let row = 0; row <= rings; row += 1) {
        const t = row / rings;
        const point = start.clone().multiplyScalar((1 - t) ** 2).addScaledVector(control, 2 * t * (1 - t)).addScaledVector(end, t * t);
        const tangent = control.clone().sub(start).multiplyScalar(1 - t).addScaledVector(end.clone().sub(control), t).normalize();
        const normal = new THREE.Vector3().crossVectors(tangent, reference).normalize();
        const binormal = new THREE.Vector3().crossVectors(normal, tangent).normalize();
        const radius = lerp(radiusStart, radiusEnd, smooth(0, 1, t));
        const clothed = object.material === cream || object.material === trousers;
        for (let column = 0; column <= segments; column += 1) {
          const angle = column / segments * Math.PI * 2;
          const fold = clothed ? 1 + Math.sin(t * 29 + angle * 2) * Math.pow(Math.sin(t * Math.PI), 3) * .022 : 1;
          const offset = normal.clone().multiplyScalar(Math.cos(angle) * radius * fold).addScaledVector(binormal, Math.sin(angle) * radius * .94 * fold);
          vertices.setXYZ(row * (segments + 1) + column, point.x + offset.x, point.y + offset.y, point.z + offset.z);
        }
      }
      const sideVertices = (rings + 1) * (segments + 1);
      vertices.setXYZ(sideVertices, start.x, start.y, start.z);
      vertices.setXYZ(sideVertices + 1, end.x, end.y, end.z);
      vertices.needsUpdate = true;
      object.geometry.computeVertexNormals();
    }

    function jointBetween(start, end, upperLength, lowerLength, pole) {
      const delta = new THREE.Vector3().subVectors(end, start);
      const distance = clamp(delta.length(), .001, upperLength + lowerLength - .001);
      const direction = delta.normalize();
      const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
      const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      const bend = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
      return start.clone().addScaledVector(direction, along).addScaledVector(bend, height);
    }

    function makeHead(parent, feminine) {
      const head = new THREE.Group();
      parent.add(head);
      head.scale.set(.75, .76, .78);
      const skull = new THREE.SphereGeometry(1, 40, 28);
      const skullPositions = skull.attributes.position;
      for (let index = 0; index < skullPositions.count; index += 1) {
        const x = skullPositions.getX(index);
        const y = skullPositions.getY(index);
        const z = skullPositions.getZ(index);
        const jaw = 1 - smooth(.1, 1, -y) * .2;
        skullPositions.setXYZ(index, x * .124 * jaw, y * .16, z * .131 * (z < 0 ? .94 : 1));
      }
      skull.computeVertexNormals();
      mesh(head, geometry(skull), skin);
      [-1, 1].forEach((side) => {
        oval(head, skin, [side * .123, -.025, -.005], [.017, .033, .021]);
        oval(head, skinShade, [side * .136, -.024, -.008], [.004, .019, .011]);
      });
      oval(head, skin, [0, -.023, -.124], [.023, .032, .023]);
      const hair = new THREE.Group();
      head.add(hair);
      const vertices = [];
      const uv = [];
      const indices = [];
      const longitude = 48;
      const latitude = 22;
      for (let row = 0; row <= latitude; row += 1) {
        for (let column = 0; column <= longitude; column += 1) {
          const angle = column / longitude * Math.PI * 2;
          const maximum = 1.68 + .72 * Math.max(0, Math.sin(angle)) - .22 * Math.max(0, -Math.sin(angle)) + .025 * Math.sin(angle * 13);
          const polar = row / latitude * maximum;
          const volume = 1 + .012 * Math.sin(angle * 11 + polar * 3) + .007 * Math.sin(angle * 21 - polar * 5);
          vertices.push(Math.cos(angle) * Math.sin(polar) * .134 * volume, Math.cos(polar) * .174 + .009, Math.sin(angle) * Math.sin(polar) * .142 * volume);
          uv.push(column / longitude, row / latitude);
          if (row && column) {
            const a = row * (longitude + 1) + column;
            const b = a - longitude - 1;
            indices.push(a - 1, b - 1, a, b - 1, b, a);
          }
        }
      }
      const cap = new THREE.BufferGeometry();
      cap.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      cap.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      cap.setIndex(indices);
      cap.computeVertexNormals();
      mesh(hair, geometry(cap), hairDark);
      let hairEnds;
      if (feminine) {
        hairEnds = new THREE.Group();
        hair.add(hairEnds);
        mesh(hairEnds, loft([[-.39, .04, .025], [-.33, .104, .045], [-.15, .123, .061], [.015, .118, .078], [.095, .079, .055]]), hairDark, [0, 0, .081]);
        const fineLocks = [];
        for (let index = 0; index < 6; index += 1) {
          const x = -.106 + index * .042;
          const length = .34 + .055 * Math.sin(index * 1.7 + .8);
          const lock = mesh(hairEnds, loft([[-length, .003, .004], [-length + .045, .023, .019], [-.2, .031, .025], [-.065, .028, .028], [.055, .022, .025], [.1, .008, .012]]), index % 2 ? hairDark : hairWarm, [x, 0, .111]);
          lock.rotation.z = Math.sin(index * 1.7) * .055;
          fineLocks.push({ points: [[x * .6, .12, .119], [x, -.02, .15], [x + .012, -.17, .151], [x - .007, -length + .012, .135]], width: .012, depth: .003 });
          fineLocks.push({ points: [[x * .6 + .009, .1, .13], [x + .013, -.04, .158], [x + .019, -.19, .148], [x + .005, -length - .012, .124]], width: .007, depth: .002 });
        }
        hairLayer(hairEnds, fineLocks, hairWarm);
      } else {
        const scalp = (x, y) => [x, y, .142 * Math.sqrt(Math.max(.01, 1 - (x / .134) ** 2 - ((y - .009) / .174) ** 2)) + .0015];
        const locks = [];
        for (let index = -6; index <= 6; index += 1) {
          const x = index * .014;
          locks.push({ points: [scalp(x * .42 - .023, .164), scalp(x * .75 - .015, .127), scalp(x, .05), scalp(x * .9, -.075 - .012 * Math.sin(index))], width: .009, depth: .0032 });
        }
        hairLayer(hair, locks, hairWarm);
      }
      return { head, hair, hairEnds };
    }

    function shoeShape(feminine, soleLayer) {
      const profile = [[-.165, 0, -.06, -.06], [-.145, .039, -.062, -.026], [-.105, .057, -.062, -.002], [-.035, .058, -.062, .018], [.035, .046, -.065, .024], [.075, .042, -.065, .016], [.095, 0, -.048, -.048]];
      const positions = [];
      const indices = [];
      const segments = 24;
      profile.forEach(([z, width, low, high], row) => {
        if (soleLayer) {
          low = width ? -.08 : -.071;
          high = width ? -.061 : -.071;
          width *= 1.03;
        }
        for (let column = 0; column <= segments; column += 1) {
          const angle = column / segments * Math.PI * 2;
          positions.push(Math.cos(angle) * width * (feminine ? .91 : 1), lerp(low, high, (Math.sin(angle) + 1) / 2), z);
          if (row && column) {
            const a = row * (segments + 1) + column;
            const b = a - segments - 1;
            indices.push(a - 1, b - 1, a, b - 1, b, a);
          }
        }
      });
      const shape = new THREE.BufferGeometry();
      shape.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      shape.setIndex(indices);
      shape.computeVertexNormals();
      return geometry(shape);
    }

    function makeCharacter(feminine) {
      const root = new THREE.Group();
      cast.add(root);
      const hipHeight = feminine ? .84 : .91;
      const body = new THREE.Group();
      body.position.y = hipHeight;
      root.add(body);
      const profile = feminine
        ? [[.16, .125, .089], [.2, .131, .096], [.28, .145, .104], [.36, .16, .106], [.43, .164, .098], [.47, .114, .078], [.48, .058, .052]]
        : [[-.065, .158, .108], [-.025, .173, .117], [.11, .172, .122], [.25, .188, .129], [.37, .201, .123], [.44, .164, .096], [.47, .063, .055]];
      mesh(body, garmentShape(profile, feminine), feminine ? blush : cream);
      if (!feminine) {
        ring(body, .163, .007, ribbing, [0, -.044, 0], .68);
        mesh(root, loft([[.82, .14, .095], [.9, .16, .107], [.95, .145, .1]]), trousers);
      }
      const neckY = feminine ? .495 : .488;
      mesh(body, loft([[.433, .043, .038], [.466, .05, .043], [.53, .045, .039], [.57, .043, .038]]), skin);
      ring(body, feminine ? .059 : .065, feminine ? .005 : .008, feminine ? blushLight : ribbing, [0, neckY - .022, 0], .8);
      const { head, hair, hairEnds } = makeHead(body, feminine);
      head.position.set(0, feminine ? .665 : .67, -.012);
      let skirt;
      if (feminine) {
        skirt = new THREE.Group();
        body.add(skirt);
        mesh(skirt, loft([[-.36, .231, .167], [-.345, .238, .175], [-.23, .217, .157], [-.08, .191, .137], [.07, .153, .112], [.16, .129, .097], [.19, .125, .093]], .04), blush);
        ring(body, .129, .006, blushLight, [0, .174, 0], .75);
        oval(body, blushLight, [-.027, .169, .099], [.027, .014, .007]).rotation.z = -.35;
        oval(body, blushLight, [.027, .169, .099], [.027, .014, .007]).rotation.z = .35;
        oval(body, blushShade, [0, .169, .107], [.008, .011, .007]);
        strand(body, [[-.006, .158, .102], [-.017, .09, .123], [-.016, .025, .13]], .0035, blushLight);
        strand(body, [[.006, .158, .102], [.026, .09, .123], [.03, .04, .13]], .0035, blushLight);
      }
      const arms = [-1, 1].map((side) => {
        const surface = bentLimb(root, feminine ? skin : cream, feminine ? .046 : .071, feminine ? .025 : .036);
        const palm = new THREE.Group();
        root.add(palm);
        mesh(palm, loft([[-.058, .017, .01], [-.046, .023, .014], [-.026, .023, .014], [-.004, .017, .011], [.009, .016, .01]]), skin);
        strand(palm, [[side * -.017, -.017, .001], [side * -.029, -.032, .01], [side * -.025, -.049, .023]], .007, skin);
        const fingers = [.034, .044, .041, .03].map((length, index) => {
          const finger = new THREE.Group();
          finger.position.set((index - 1.5) * .0105, -.05, 0);
          palm.add(finger);
          strand(finger, [[0, 0, 0], [0, -length * .5, .003], [0, -length * .87, .012], [0, -length, .019]], .0048, skin);
          oval(finger, skin, [0, -length, .019], [.0048, .0048, .0048]);
          return finger;
        });
        const contactOffset = new THREE.Vector3(0, -.035, .014);
        return { side, surface, palm, fingers, contactOffset };
      });
      const legs = [-1, 1].map((side) => {
        const surface = bentLimb(root, feminine ? skin : trousers, feminine ? .068 : .087, feminine ? .029 : .047);
        const foot = new THREE.Group();
        root.add(foot);
        mesh(foot, shoeShape(feminine, true), sole);
        mesh(foot, shoeShape(feminine, false), shoe);
        strand(foot, [[-.043, -.025, -.11], [-.049, -.002, -.04], [-.037, .014, .035], [.037, .014, .035], [.049, -.002, -.04], [.043, -.025, -.11]], .0015, ribbing);
        if (!feminine) {
          [-.055, -.035, -.015].forEach((z) => strand(foot, [[-.022, .008, z], [0, .016, z - .004], [.022, .008, z]], .0018, ribbing));
        }
        return { side, surface, foot };
      });
      return { root, body, head, hair, hairEnds, skirt, arms, legs, hipHeight, feminine };
    }

    let fallback;
    let rigPair;
    let activeRig;
    let animeStyle;
    let started = false;
    const modelRequests = new AbortController();

    function releaseModels(models) {
      const resources = new Set();
      models.forEach(({ scene }) => scene.traverse((object) => {
        if (!object.isMesh) return;
        resources.add(object.geometry);
        const surfaces = Array.isArray(object.material) ? object.material : [object.material];
        surfaces.forEach((surface) => {
          resources.add(surface);
          Object.values(surface).forEach((value) => { if (value?.isTexture) resources.add(value); });
        });
      }));
      resources.forEach((resource) => resource.dispose());
    }

    async function loadRig() {
      if (!window.JourneyGLTFLoader || !window.createJourneyRigPair) return;
      const loader = new window.JourneyGLTFLoader();
      const motionRequest = Promise.all(['07_04', '07_05'].map(async (trial) => {
        const response = await fetch(`assets/motion/${trial}-walk.json`, { signal: modelRequests.signal });
        if (!response.ok) throw new Error(`Could not load motion ${trial}`);
        return response.json();
      })).catch(() => null);
      const modelResults = Promise.allSettled(['wsq', 'lyp'].map(async (name) => {
        const response = await fetch(`assets/characters/${name}.glb`, { signal: modelRequests.signal });
        if (!response.ok) throw new Error(`Could not load ${name} character`);
        return loader.parseAsync(await response.arrayBuffer(), 'assets/characters/');
      }));
      const [results, motion] = await Promise.all([modelResults, motionRequest]);
      const models = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      if (disposed || models.length !== results.length) {
        releaseModels(models);
        return;
      }
      try {
        const dressCharacter = (character) => {
          const dress = character.feminine ? window.dressJourneyPrincess : window.dressJourneyPrince;
          let head;
          try {
            if (!character.feminine) head = window.sculptJourneyPrince?.(character);
            const costume = dress?.(character);
            if (!head) return costume;
            return {
              update: (time, shot) => costume?.update(time, shot),
              dispose() {
                costume?.dispose();
                head.dispose();
              },
            };
          } catch (error) {
            head?.dispose();
            console.warn('Could not dress the opening character.', error);
          }
        };
        const pair = await window.createJourneyRigPair(models, { motion, dressCharacter });
        if (disposed) pair.dispose();
        else {
          rigPair = pair;
          rigPair.root.visible = false;
          cast.add(rigPair.root);
        }
      } catch {
        releaseModels(models);
        return;
      }
      if (!rigPair) return;
      try {
        animeStyle = window.styleJourneyAnime?.(rigPair.root, { outlinePixels: 1.7 });
      } catch {
        // The original skinned pair remains available if stylizing it fails.
      }
    }

    const ready = loadRig();

    function begin() {
      started = true;
      activeRig = rigPair;
      if (!activeRig) fallback ??= [makeCharacter(false), makeCharacter(true)];
      if (rigPair) rigPair.root.visible = Boolean(activeRig);
      fallback?.forEach(({ root }) => { root.visible = !activeRig; });
    }

    const shadowMaterial = new THREE.ShadowMaterial({ opacity: .26 });
    materials.add(shadowMaterial);
    const ground = mesh(scene, geometry(new THREE.PlaneGeometry(5, 5)), shadowMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    ground.receiveShadow = true;

    function stepPose(cycle, stride, walk) {
      const stance = cycle < .6;
      const progress = stance ? cycle / .6 : (cycle - .6) / .4;
      const forward = stance
        ? lerp(-stride, stride, progress)
        : lerp(stride, -stride, smooth(0, 1, progress));
      // Positive pitch raises the toes for heel strike; negative pitch rolls onto the toes.
      const pitch = stance
        ? .14 * (1 - smooth(0, .18, progress)) - .28 * smooth(.72, 1, progress)
        : lerp(-.28, .14, smooth(0, 1, progress));
      return {
        forward: forward * walk,
        pitch: pitch * walk,
        lift: stance ? 0 : Math.sin(progress * Math.PI) * .072 * walk,
      };
    }

    function groundedAnkleHeight(pitch) {
      const cosine = Math.cos(pitch);
      const sine = Math.sin(pitch);
      // The flat sole and its rounded toe/heel stay grounded throughout the foot roll.
      const minimum = Math.min(
        -.08 * cosine + .145 * sine,
        -.08 * cosine - .075 * sine,
        -.071 * cosine + .165 * sine,
        -.071 * cosine - .095 * sine,
      );
      return -minimum + .002;
    }

    function orientPalm(palm, elbow, wrist, facing) {
      const up = elbow.clone().sub(wrist).normalize();
      const normal = facing.clone().addScaledVector(up, -facing.dot(up)).normalize();
      const right = new THREE.Vector3().crossVectors(up, normal).normalize();
      normal.crossVectors(right, up).normalize();
      palm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    }

    function pose(character, seconds, arrival, walk, gaze) {
      const { root, body, head, hair, hairEnds, skirt, feminine, hipHeight } = character;
      const sharedPhase = seconds * Math.PI * 2 / 1.46;
      const phase = sharedPhase + (feminine ? .34 : 0);
      const side = feminine ? 1 : -1;
      const weightShift = -Math.sin(phase) * .017 * walk;
      const pelvisYaw = -Math.cos(phase) * .038 * walk;
      const pelvisRoll = Math.sin(phase) * .018 * walk;
      const pelvisY = hipHeight - .012 - Math.cos(phase * 2) * .007 * walk;
      const joined = smooth(.45, 1.75, seconds);
      const glance = smooth(.7, 2.2, seconds) * (1 - smooth(3.5, 5.2, seconds));
      root.position.x = side * lerp(.52, .36, arrival) + weightShift;
      root.rotation.y = side * .07 * (1 - arrival);
      body.position.y = pelvisY;
      body.rotation.set(-.014 * walk + .035 * gaze, -pelvisYaw * .9, pelvisRoll * .8);
      const headPitch = Math.sin(phase - .3) * .009 * walk + .39 * gaze;
      head.rotation.set(headPitch, side * (.025 + .115 * glance) * (1 - gaze), -side * .018 * glance * (1 - gaze));
      // Tilt around the upper neck, rather than rotating a detached head about its centre.
      const headHeight = feminine ? .665 : .67;
      const neckOffset = headHeight - .53;
      head.position.set(0, headHeight - neckOffset * (1 - Math.cos(headPitch)), -.012 + neckOffset * Math.sin(headPitch));
      hair.rotation.set(Math.sin(phase - .8) * .006 * walk, 0, Math.sin(phase - .7) * (feminine ? .018 : .002) * walk);
      if (hairEnds) hairEnds.rotation.x = Math.sin(phase - .9) * .008 * walk - .09 * gaze;
      if (skirt) {
        skirt.rotation.set(Math.sin(phase - .55) * .014 * walk, pelvisYaw * .7, -Math.sin(phase - .5) * .021 * walk);
      }
      root.updateMatrixWorld(true);
      const pelvisRotation = new THREE.Euler(0, pelvisYaw, pelvisRoll, 'YXZ');
      character.legs.forEach((leg) => {
        const cycle = ((phase / (Math.PI * 2) + (leg.side === 1 ? .5 : 0)) % 1 + 1) % 1;
        const step = stepPose(cycle, feminine ? .105 : .12, walk);
        const hip = new THREE.Vector3(leg.side * (feminine ? .079 : .085), -.02, 0);
        hip.applyEuler(pelvisRotation);
        hip.y += pelvisY;
        const ankle = new THREE.Vector3(
          leg.side * (feminine ? .083 : .09) - weightShift * .45,
          groundedAnkleHeight(step.pitch) + step.lift,
          step.forward,
        );
        const knee = jointBetween(hip, ankle, feminine ? .375 : .415, feminine ? .374 : .4, new THREE.Vector3(leg.side * .04, 0, -1));
        setLimb(leg.surface, hip, knee, ankle);
        leg.foot.position.copy(ankle);
        leg.foot.rotation.set(step.pitch, leg.side * .035, 0, 'YXZ');
      });
      const contact = root.worldToLocal(cast.localToWorld(new THREE.Vector3(
        Math.sin(sharedPhase * .5) * .003 * walk,
        .905 + Math.sin(sharedPhase * 2) * .004 * walk,
        -.035 + Math.sin(sharedPhase) * .009 * walk,
      )));
      character.arms.forEach((arm) => {
        const inner = arm.side === -side;
        const shoulder = new THREE.Vector3(arm.side * (feminine ? .11 : .135), feminine ? .422 : .394, 0);
        shoulder.applyMatrix4(body.matrixWorld);
        root.worldToLocal(shoulder);
        const armPhase = phase + (arm.side === 1 ? Math.PI : 0);
        const freeWrist = new THREE.Vector3(
          arm.side * (feminine ? .218 : .252),
          (feminine ? .80 : .81) + (1 - Math.cos(armPhase)) * .012 * walk,
          -.012 + Math.cos(armPhase) * .105 * walk,
        );
        const facing = inner
          ? new THREE.Vector3(-arm.side * Math.cos(joined * Math.PI), 0, Math.sin(joined * Math.PI) * .3)
          : new THREE.Vector3(-arm.side, 0, .08);
        const pole = new THREE.Vector3(arm.side * .16, 0, -1);
        const upperLength = feminine ? .25 : .275;
        const lowerLength = feminine ? .235 : .26;
        const wrist = freeWrist.clone();
        let elbow = jointBetween(shoulder, wrist, upperLength, lowerLength, pole);
        orientPalm(arm.palm, elbow, wrist, facing);
        if (inner) {
          const { contactOffset } = arm;
          // Two small corrections align the wrist while both palms meet at one shared point.
          for (let correction = 0; correction < 2; correction += 1) {
            const offset = contactOffset.clone().applyQuaternion(arm.palm.quaternion);
            wrist.copy(freeWrist).lerp(contact.clone().sub(offset), joined);
            elbow = jointBetween(shoulder, wrist, upperLength, lowerLength, pole);
            orientPalm(arm.palm, elbow, wrist, facing);
          }
          const offset = contactOffset.clone().applyQuaternion(arm.palm.quaternion);
          wrist.copy(freeWrist).lerp(contact.clone().sub(offset), joined);
          elbow = jointBetween(shoulder, wrist, upperLength, lowerLength, pole);
        }
        setLimb(arm.surface, shoulder, elbow, wrist);
        arm.palm.position.copy(wrist);
        const grip = inner ? smooth(1.48, 1.94, seconds) : 0;
        arm.fingers.forEach((finger, index) => { finger.rotation.x = -.12 - grip * (.66 + index * .1); });
      });
    }

    function render(seconds, shot = {}) {
      if (!available || disposed) return false;
      if (!started) begin();
      const time = clamp(seconds, 0, 10);
      const pace = clamp(Number.isFinite(shot.pace) ? shot.pace : 1);
      const gaze = clamp(Number.isFinite(shot.gaze) ? shot.gaze : 0);
      const heading = clamp(Number.isFinite(shot.heading) ? shot.heading : 0, -.25, .25);
      const anime = Boolean(activeRig && animeStyle);
      const arrival = smooth(.1, 1.75, time);
      const walk = smooth(.15, 1.2, time) * (1 - smooth(6.8, 7.9, time)) * pace;
      cast.rotation.y = activeRig ? 0 : heading;
      cast.updateMatrixWorld(true);
      if (activeRig) activeRig.pose(time, { ...shot, pace, gaze, heading });
      else fallback.forEach((character) => pose(character, time, arrival, walk, gaze));
      ambient.intensity = anime ? .75 : 1.05;
      renderer.toneMappingExposure = anime ? 1 : 1.06;
      sunset.color.copy(duskLight).lerp(starlight, gaze * .58);
      sunset.intensity = anime ? lerp(2.3, 1.85, gaze) : lerp(3.1, 2.4, gaze);
      fill.color.copy(duskFill).lerp(nightFill, gaze * .7);
      fill.intensity = anime ? lerp(1.05, .78, gaze) : lerp(1.67, 1.06, gaze);
      const lantern = Number.isFinite(shot.lanternLight) ? clamp(shot.lanternLight) : 0;
      rose.color.copy(duskRose).lerp(lanternGold, lantern);
      rose.position.set(lerp(-3, 2.8, lantern), 1.6, lerp(3, -2.5, lantern));
      rose.intensity = anime ? lerp(.28, .72, lantern) : lerp(.4, .82, lantern);
      // Follow from behind, then take a short arc as the lantern catches their attention.
      const arc = activeRig ? lerp(.146, .91, shot.bridgeView || 0) : lerp(.146, -.156, gaze);
      const cameraRadius = 3.84;
      camera.position.x = Math.sin(arc) * cameraRadius;
      camera.position.z = Math.cos(arc) * cameraRadius;
      // Match the local ground perspective of the painted path to the recorded stride.
      const groundHeight = activeRig?.motionSource && activeRig.motionSource !== 'procedural-fallback'
        && activeRig.travelMeters > 0 && shot.groundTravel > 0 && shot.figureHeight > 0
        ? shot.groundTravel * cameraRadius * activeRig.crownHeight / (activeRig.travelMeters * shot.figureHeight)
        : 1.58;
      camera.position.y = lerp(clamp(groundHeight, 1.38, 2.17), 1.58, gaze);
      camera.lookAt(0, .95, 0);
      camera.updateMatrixWorld();
      foot.set(0, .01, 0).project(camera);
      framing.footX = (foot.x + 1) / 2;
      framing.footY = (1 - foot.y) / 2;
      // The framing reference stays the standing height, avoiding a zoom when they look up.
      const standingCast = activeRig?.root ?? cast;
      crown.set(-.36, activeRig?.crownHeight ?? 1.72, 0).applyMatrix4(standingCast.matrixWorld).project(camera);
      framing.bodyHeight = (crown.y - foot.y) / 2;
      renderer.render(scene, camera);
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      available = false;
      modelRequests.abort();
      animeStyle?.dispose();
      rigPair?.dispose();
      canvas.removeEventListener('webglcontextlost', contextLost);
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      textures.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    }

    return { canvas, framing, ready, begin, render, dispose, get available() { return available && !disposed; } };
  };
})();
