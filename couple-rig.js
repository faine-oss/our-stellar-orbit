(() => {
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const smooth = (a, b, value) => {
    const t = clamp((value - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const smoother = (value) => {
    const t = clamp(value);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const TRAVEL_METRES = 2.45;
  const CAPTURE_TRAVEL_METRES = 3.6;
  const PAIR_CYCLES = 2.5;
  // Match WSQ's capture cadence through the walk, then shorten the last
  // right step and let the left foot come underneath him at the bridge.
  const princeContacts = [
    { liftAt: .014, touch: .185, landing: .282 },
    { liftAt: .185, touch: .385, landing: .482 },
    { liftAt: .385, touch: .585, landing: .682 },
    { liftAt: .585, touch: .785, landing: .882 },
    { liftAt: .785, touch: .935, landing: 1.014, final: true },
    { liftAt: .949, touch: .997, landing: .989, final: true },
  ];
  const softMinimum = (value, minimum, width = .006) => (value + minimum + Math.hypot(value - minimum, width)) / 2;
  const restingFingers = [.21, .29, .13];
  const restingThumb = [.095, .14, .085];
  const handholdPoses = {
    wsq: {
      forward: [.66, -.73, -.24], normal: [0, .35, -.94],
      reach: .70, palmDepth: .023, palmSide: -.012, height: 0,
      fingers: [.30, .48, .23], thumb: [.03, .16, .07], opposition: .25, littleCurl: 0,
    },
    lyp: {
      forward: [-.75, -.62, -.23], normal: [0, -.35, .94],
      reach: .78, palmDepth: .023, palmSide: 0, height: .003,
      fingers: [.525, .975, .475], thumb: [.03, .11, .07], opposition: .27, littleCurl: .02,
    },
  };

  function handholdAt(seconds) {
    const contact = smooth(.45, 1.75, seconds);
    // Turn the palms, bring the wrists into position, then close the fingers
    // while the surfaces approach along their normals.
    return {
      orientation: smooth(.25, 1.05, seconds),
      reach: smooth(.45, 1.25, seconds),
      curl: smooth(.80, 1, contact),
      clearance: .08 * (1 - contact),
    };
  }

  // Integral of the opening's acceleration, cruise and deceleration. Keeping
  // this fallback analytic also makes seeking and replay independent of history.
  function journeyDistance(seconds) {
    const integral = (t) => t * t * t - .5 * t * t * t * t;
    const accelerate = clamp((seconds - .12) / .86);
    const decelerate = clamp((seconds - 4.34) / 1.22);
    return clamp((.86 * integral(accelerate) + clamp(seconds - .98, 0, 3.36)
      + 1.22 * (decelerate - integral(decelerate))) / 4.4);
  }

  function timeAtDistance(distance) {
    if (distance <= 0) return .12;
    if (distance >= 1) return 5.56;
    let low = .12;
    let high = 5.56;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const middle = (low + high) / 2;
      if (journeyDistance(middle) < distance) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }

  function approachAtDistance(distance) {
    return smooth(.1, 1.75, timeAtDistance(distance));
  }

  window.createJourneyRigPair = async (models, options = {}) => {
    const THREE = window.THREE;
    if (!THREE || models.length !== 2) throw new Error('Two humanoid models are required.');
    const root = new THREE.Group();
    root.name = 'JourneyHumanoidPair';
    const characters = [];
    const actingAngles = new THREE.Euler(0, 0, 0, 'YXZ');
    const actingRotation = new THREE.Quaternion();
    let disposed = false;

    async function resolveBones(gltf, boneMap) {
      const json = gltf.parser?.json;
      const source = boneMap?.bones || boneMap || json?.asset?.extras?.humanoid;
      if (!source) throw new Error('The character is missing its humanoid bone map.');
      const entries = await Promise.all(Object.entries(source).map(async ([key, entry]) => {
        const name = typeof entry === 'string' ? entry : entry.name;
        let bone = name ? gltf.scene.getObjectByName(name) : null;
        if (!bone && Number.isInteger(entry.node)) bone = await gltf.parser.getDependency('node', entry.node);
        return [key, bone];
      }));
      const bones = Object.fromEntries(entries.filter(([, bone]) => bone));
      const required = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];
      if (required.some((key) => !bones[key])) throw new Error('The character has an incomplete humanoid skeleton.');
      return bones;
    }

    function worldPosition(object) {
      return object.getWorldPosition(new THREE.Vector3());
    }

    function rootPosition(character, object) {
      return character.wrapper.worldToLocal(worldPosition(object));
    }

    function setWorldQuaternion(bone, quaternion) {
      const parentRotation = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(parentRotation.invert().multiply(quaternion));
      bone.updateWorldMatrix(false, true);
    }

    function aimBone(character, bone, child, target, weight = 1) {
      const rest = character.rest.get(bone);
      const childRest = character.rest.get(child);
      const direction = target.clone().sub(worldPosition(bone)).normalize();
      const frame = character.wrapper.getWorldQuaternion(new THREE.Quaternion());
      const restDirection = childRest.point.clone().sub(rest.point).normalize().applyQuaternion(frame);
      const worldRotation = frame.clone().multiply(rest.rotation);
      const delta = new THREE.Quaternion().setFromUnitVectors(restDirection, direction);
      const rotation = delta.multiply(worldRotation);
      if (weight < 1) rotation.copy(bone.getWorldQuaternion(new THREE.Quaternion()).slerp(rotation, weight));
      setWorldQuaternion(bone, rotation);
    }

    function rotateLocal(character, bone, x, y, z) {
      if (!bone) return;
      bone.quaternion.copy(character.rest.get(bone).quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ')));
    }

    function solveLimb(start, target, upperLength, lowerLength, pole) {
      const direction = target.clone().sub(start);
      const distance = clamp(direction.length(), .002, upperLength + lowerLength - .002);
      direction.normalize();
      const wrist = start.clone().addScaledVector(direction, distance);
      const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
      const bendHeight = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      const bend = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
      const joint = start.clone().addScaledVector(direction, along).addScaledVector(bend, bendHeight);
      return { joint, end: wrist };
    }

    function frameQuaternion(longitudinal, normal) {
      const y = longitudinal.clone().normalize();
      const z = normal.clone().addScaledVector(y, -normal.dot(y)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z).normalize();
      z.crossVectors(x, y).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    }

    function handRotation(arm, elbow, wrist, facing, hanging, joined) {
      const along = wrist.clone().sub(elbow).normalize().lerp(hanging, joined).normalize();
      return frameQuaternion(along, facing).multiply(arm.handBasis.clone().invert());
    }

    function joinedHandFrame(character, frame) {
      const { forward, normal } = character.handhold;
      return {
        facing: new THREE.Vector3(...normal).applyQuaternion(frame),
        hanging: new THREE.Vector3(...forward).normalize().applyQuaternion(frame),
      };
    }

    function wristAtContact(character, arm, contact, rotation, clearance) {
      const wrist = contact.clone().sub(arm.contactOffset.clone().multiplyScalar(character.scale).applyQuaternion(rotation));
      wrist.addScaledVector(arm.palmNormal.clone().applyQuaternion(rotation), -clearance);
      wrist.y += character.handhold.height;
      return wrist;
    }

    function outsideCostume(arm, wrist) {
      wrist.x = arm.sign * softMinimum(arm.sign * wrist.x, .244, .018);
      return wrist;
    }

    function princessRightWrist(arm, shoulder, wrist) {
      wrist.x = softMinimum(wrist.x, .235, .018);
      // Keep the hand clear of the skirt without extending the arm to its limit.
      const reach = (arm.upperLength + arm.lowerLength) * .975;
      const dx = wrist.x - shoulder.x;
      const dz = wrist.z - shoulder.z;
      const drop = Math.sqrt(Math.max(.0025, reach * reach - dx * dx - dz * dz));
      wrist.y = softMinimum(wrist.y, shoulder.y - drop, .010);
      return wrist;
    }

    function poseFingers(character, arm, grip, relaxation = 0) {
      const { opposition } = character.handhold;
      arm.fingers.forEach(({ bone, axis, thumbAxis, oppose, baseCurl, heldCurl, relaxedCurl }) => {
        bone.quaternion.copy(character.rest.get(bone).quaternion);
        if (oppose) {
          const turn = relaxation ? lerp(.14, .27, relaxation) : lerp(.14, opposition, grip);
          bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(thumbAxis, oppose * turn));
        }
        const bend = relaxation ? lerp(baseCurl, relaxedCurl, relaxation) : lerp(baseCurl, heldCurl, grip);
        bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis, bend));
      });
    }

    function refineProportions(scene, bones, bounds, feminine) {
      const floor = bounds.min.y;
      const height = bounds.max.y - floor;
      const ankle = worldPosition(bones.leftFoot).y;
      const pelvis = worldPosition(bones.hips).y;
      const neck = worldPosition(bones.neck || bones.head).y;
      const legLength = height * (feminine ? .032 : .029);
      const neckRise = height * .007;
      const rest = [];
      scene.traverse((object) => {
        if (object.isBone) rest.push([object, worldPosition(object)]);
      });
      // Keep the sole in place, lengthen the legs, then ease the offset back
      // through the torso. The original inverse binds carry the tailored mesh.
      for (const [bone, point] of rest) {
        const { y } = point;
        const lift = y <= pelvis
          ? legLength * clamp((y - ankle) / (pelvis - ankle))
          : lerp(legLength, neckRise, clamp((y - pelvis) / (neck - pelvis)));
        point.y += lift;
        bone.position.copy(bone.parent.worldToLocal(point));
      }
      bones.head.scale.multiplyScalar(feminine ? .91 : .92);
      scene.updateMatrixWorld(true);
    }

    const descriptors = models.map((model, index) => model.gltf ? model : { gltf: model, feminine: index === 1 });
    const bonesByCharacter = await Promise.all(descriptors.map(({ gltf, boneMap }) => resolveBones(gltf, boneMap)));
    for (let index = 0; index < descriptors.length; index += 1) {
      const descriptor = descriptors[index];
      const { gltf } = descriptor;
      const feminine = descriptor.feminine ?? index === 1;
      const bones = bonesByCharacter[index];
      const wrapper = new THREE.Group();
      wrapper.name = feminine ? 'JourneyLyp' : 'JourneyWsq';
      root.add(wrapper);
      wrapper.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);
      const initialBounds = new THREE.Box3().setFromObject(gltf.scene);
      const costume = options.dressCharacter?.({ gltf, root: gltf.scene, bones, feminine });
      refineProportions(gltf.scene, bones, initialBounds, feminine);
      const expression = window.createJourneyExpression?.({ gltf, root: gltf.scene, bones, feminine });
      const height = feminine ? 1.64 : 1.72;
      const scale = height / (initialBounds.max.y - initialBounds.min.y);
      gltf.scene.scale.multiplyScalar(scale);
      gltf.scene.position.y -= initialBounds.min.y * scale;
      const toe = bones.leftToes || bones.rightToes;
      const foot = bones.leftToes ? bones.leftFoot : bones.rightFoot;
      if (toe && worldPosition(toe).z > worldPosition(foot).z) gltf.scene.rotation.y = Math.PI;
      wrapper.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        if (object.isSkinnedMesh) object.frustumCulled = false;
      });
      const handhold = feminine ? handholdPoses.lyp : handholdPoses.wsq;
      const character = { wrapper, scene: gltf.scene, bones, costume, expression, feminine, scale, height, handhold, rest: new Map(), arms: [], legs: [] };
      Object.values(bones).forEach((bone) => {
        character.rest.set(bone, {
          quaternion: bone.quaternion.clone(), position: bone.position.clone(),
          rotation: bone.getWorldQuaternion(new THREE.Quaternion()), point: rootPosition(character, bone),
        });
      });
      ['left', 'right'].forEach((side) => {
        const upper = bones[`${side}UpperArm`];
        const lower = bones[`${side}LowerArm`];
        const hand = bones[`${side}Hand`];
        const shoulder = character.rest.get(upper).point;
        const elbow = character.rest.get(lower).point;
        const wrist = character.rest.get(hand).point;
        const middle = bones[`${side}MiddleProximal`];
        const middlePoint = middle ? worldPosition(middle) : worldPosition(hand).add(new THREE.Vector3(Math.sign(shoulder.x) * .07, 0, 0));
        const localMiddle = hand.worldToLocal(middlePoint.clone());
        const down = new THREE.Vector3(0, -1, 0);
        const palmNormal = down.clone().applyQuaternion(character.rest.get(hand).rotation.clone().invert());
        const alongPalm = localMiddle.projectOnPlane(palmNormal);
        const handBasis = frameQuaternion(alongPalm, palmNormal);
        const acrossPalm = new THREE.Vector3().crossVectors(alongPalm, palmNormal).normalize();
        const contactOffset = alongPalm.clone().multiplyScalar(handhold.reach)
          .addScaledVector(palmNormal, handhold.palmDepth).addScaledVector(acrossPalm, handhold.palmSide);
        const fingers = Object.entries(bones).filter(([key]) => key.startsWith(side) && /(?:Thumb|Index|Middle|Ring|Little)/.test(key)).map(([key, bone]) => {
          const position = worldPosition(bone);
          const next = bone.children.find((child) => child.isBone);
          const along = next ? worldPosition(next).sub(position) : position.clone().sub(worldPosition(bone.parent));
          const inverse = character.rest.get(bone).rotation.clone().invert();
          const axis = new THREE.Vector3().crossVectors(along, down).normalize().applyQuaternion(inverse);
          const thumbAxis = down.clone().applyQuaternion(inverse);
          const thumb = key.includes('Thumb');
          const oppose = thumb && key.includes('Proximal')
            ? Math.sign(down.dot(along.cross(middlePoint.clone().sub(position)))) : 0;
          const baseCurl = thumb ? .045 : key.includes('Intermediate') ? .10 : .065;
          const joint = key.endsWith('Proximal') ? 0 : key.endsWith('Intermediate') ? 1 : 2;
          const fingerBias = key.includes('Little') ? handhold.littleCurl : key.includes('Ring') ? .04 : key.includes('Index') ? (feminine ? -.07 : -.03) : 0;
          const heldCurl = thumb ? handhold.thumb[joint] : handhold.fingers[joint] + fingerBias;
          const restBias = key.includes('Little') ? .055 : key.includes('Ring') ? .035 : key.includes('Index') ? -.055 : 0;
          const relaxedCurl = thumb ? restingThumb[joint] : restingFingers[joint] + restBias;
          return { bone, axis, thumbAxis, oppose, baseCurl, heldCurl, relaxedCurl };
        });
        character.arms.push({ side, upper, lower, hand, handBasis, contactOffset, fingers, palmNormal,
          sign: Math.sign(shoulder.x), upperLength: shoulder.distanceTo(elbow), lowerLength: elbow.distanceTo(wrist), shoulderHeight: shoulder.y });
        const upperLeg = bones[`${side}UpperLeg`];
        const lowerLeg = bones[`${side}LowerLeg`];
        const footBone = bones[`${side}Foot`];
        const hip = character.rest.get(upperLeg).point;
        const knee = character.rest.get(lowerLeg).point;
        const ankle = character.rest.get(footBone).point;
        const toes = bones[`${side}Toes`];
        const toePoint = toes ? character.rest.get(toes).point : ankle.clone().add(new THREE.Vector3(0, -.06, -.12));
        const sign = Math.sign(hip.x);
        const landings = [.12, .25, .39, .53, .67, .835, .986, 1.012];
        const touches = [.065, .195, .335, .475, .615, .755, .915, 1];
        const lifts = [.008, .085, .225, .365, .505, .645, .785, .929];
        const placement = (distance) => {
          const approach = approachAtDistance(distance);
          const characterSide = feminine ? 1 : -1;
          const yaw = characterSide * .045 * (1 - approach);
          return {
            x: characterSide * lerp(.5, .345, approach) + Math.cos(yaw) * ankle.x + Math.sin(yaw) * ankle.z,
            z: -Math.sin(yaw) * ankle.x + Math.cos(yaw) * ankle.z,
            yaw,
          };
        };
        const steps = touches.flatMap((touch, step) => {
          if ((step % 2 ? 1 : -1) !== sign) return [];
          const delay = feminine && step < 7 ? .006 : 0;
          return [{ touch: touch + delay, liftAt: lifts[step] + delay, landing: landings[step], final: step >= 6, placement: placement(landings[step]) }];
        });
        const princeStride = feminine ? null : {
          start: sign < 0 ? .082 : -.020,
          steps: princeContacts.flatMap((step, index) => (index % 2 ? -1 : 1) === sign
            ? [{ ...step, placement: placement(step.touch) }] : []),
        };
        character.legs.push({ upper: upperLeg, lower: lowerLeg, foot: footBone, toes, sign, laneX: hip.x * .9, steps, startPlacement: placement(0), princeStride,
          upperLength: hip.distanceTo(knee), lowerLength: knee.distanceTo(ankle), hip: hip.clone(), ankle: ankle.clone(), front: Math.min(-.08, toePoint.z - ankle.z), rear: .045 });
      });
      characters.push(character);
    }

    const shortestArm = Math.min(...characters.flatMap((character) => character.arms.map((arm) => arm.upperLength + arm.lowerLength)));
    const shoulderHeight = Math.min(...characters.flatMap((character) => character.arms.map((arm) => arm.shoulderHeight)));
    const contactHeight = shoulderHeight - Math.min(shortestArm * .77, .34) - .045;

    // Captured rotations remain the primary animation. The constraints below
    // only correct contact and compose the deliberately authored start/stop.
    const childNames = {
      spine: 'chest', chest: 'upperChest', upperChest: 'neck', neck: 'head',
      leftShoulder: 'leftUpperArm', leftUpperArm: 'leftLowerArm', leftLowerArm: 'leftHand',
      rightShoulder: 'rightUpperArm', rightUpperArm: 'rightLowerArm', rightLowerArm: 'rightHand',
      leftUpperLeg: 'leftLowerLeg', leftLowerLeg: 'leftFoot',
      rightUpperLeg: 'rightLowerLeg', rightLowerLeg: 'rightFoot',
    };

    function motionSample(motion, time) {
      const frames = motion.clip.frames;
      let index = Math.min(frames.length - 2, Math.max(0, Math.floor(time * motion.clip.sampleRate)));
      while (index < frames.length - 2 && frames[index + 1].time < time) index += 1;
      const a = frames[index], b = frames[index + 1];
      const t = clamp((time - a.time) / (b.time - a.time));
      const positions = motion.names.map((_, i) => new THREE.Vector3().fromArray(a.positions, i * 3).lerp(new THREE.Vector3().fromArray(b.positions, i * 3), t));
      const rotations = motion.names.map((_, i) => new THREE.Quaternion().fromArray(a.quaternions, i * 4).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternions, i * 4).normalize(), t));
      const rootPosition = new THREE.Vector3().fromArray(a.rootPosition).lerp(new THREE.Vector3().fromArray(b.rootPosition), t);
      const feet = motion.clip.footSamples;
      const footIndex = Math.round(time * motion.clip.sourceSampleRate);
      const floors = [];
      for (let offset = -5; offset <= 5; offset += 1) {
        const foot = feet[clamp(footIndex + offset, 0, feet.length - 1)].positions;
        floors.push(Math.min(foot[4], foot[10]));
      }
      floors.sort((x, y) => x - y);
      return { positions, rotations, root: rootPosition, floor: floors[5] };
    }

    function prepareMotion(character, clip) {
      if (!clip?.recommendedCycle || !clip.frames?.length) return null;
      const names = clip.jointOrder;
      const motion = { clip, names, indices: Object.fromEntries(names.map((name, index) => [name, index])) };
      motion.start = clip.recommendedCycle.start;
      motion.end = clip.recommendedCycle.end;
      motion.duration = motion.end - motion.start;
      const sourceLeg = clip.restLegLengths.left;
      motion.scale = (character.legs[0].upperLength + character.legs[0].lowerLength) / (sourceLeg.total || sourceLeg.totalLength || (sourceLeg.upper + sourceLeg.lower) || sourceLeg);
      motion.restPositions = names.map((_, i) => new THREE.Vector3().fromArray(clip.rest.positions, i * 3));
      motion.restRotations = names.map((_, i) => new THREE.Quaternion().fromArray(clip.rest.quaternions, i * 4).normalize());
      motion.first = motionSample(motion, motion.start);
      motion.last = motionSample(motion, motion.end);
      motion.restFloor = Math.min(...['leftToes', 'rightToes'].map((name) => clip.rest.rootPosition[1] + motion.restPositions[motion.indices[name]].y));
      motion.contacts = ['left', 'right'].map((side) => {
        const windows = clip.contactWindows[side];
        const start = side === 'left' ? motion.start : clip.recommendedCycle.rightContactSourceTime;
        const window = windows.reduce((best, candidate) => Math.abs(candidate.start - start) < Math.abs(best.start - start) ? candidate : best, windows[0]);
        return { phase: (start - motion.start) / motion.duration, clockPhase: side === 'left' ? 0 : .5, duration: (window.end - window.start) / motion.duration, sample: motionSample(motion, start) };
      });
      motion.phaseOffset = character.feminine ? .5 : 0;
      motion.followDelay = character.feminine ? .115 : 0;
      motion.innerHand = motion.indices[character.feminine ? 'leftHand' : 'rightHand'];
      motion.handMean = new THREE.Vector3();
      motion.meanPose = { positions: names.map(() => new THREE.Vector3()), rotations: [], root: new THREE.Vector3(), floor: 0 };
      let referenceCount = 0;
      for (let phase = 0; phase < 1; phase += .25) {
        const reference = motionSample(motion, motion.start + phase * motion.duration);
        motion.handMean.add(reference.positions[motion.innerHand].clone().multiplyScalar(.25));
        referenceCount += 1;
        reference.positions.forEach((point, index) => motion.meanPose.positions[index].addScaledVector(point, .25));
        reference.rotations.forEach((rotation, index) => {
          if (!motion.meanPose.rotations[index]) motion.meanPose.rotations[index] = rotation.clone();
          else motion.meanPose.rotations[index].slerp(rotation, 1 / referenceCount);
        });
        motion.meanPose.root.addScaledVector(reference.root, .25);
        motion.meanPose.floor += reference.floor * .25;
      }
      motion.meanHeightChange = (motion.meanPose.root.y - motion.meanPose.floor - (clip.rest.rootPosition[1] - motion.restFloor)) * motion.scale;
      motion.stopSamples = [cycleSample(motion, .82), cycleSample(motion, .95)];
      return motion;
    }

    characters.forEach((character, index) => { character.motion = prepareMotion(character, options.motion?.[index]); });
    const hasMotion = characters.every((character) => character.motion && Number.isFinite(character.motion.scale));

    function actorProgress(motion, distance, seconds) {
      const clock = distance >= 1 ? Math.max(5.56, seconds) : timeAtDistance(distance);
      return journeyDistance(clock - motion.followDelay);
    }

    function landingProgress(motion, actorDistance) {
      if (actorDistance < 0 || actorDistance > 1) return actorDistance;
      return journeyDistance(timeAtDistance(actorDistance) + motion.followDelay);
    }

    function cycleSample(motion, travel) {
      // Shared cadence aligns adjacent inside feet. Each recording keeps its
      // own pose curves and contact timing within a C1 continuous phase map.
      const clock = clamp(travel) * PAIR_CYCLES + motion.phaseOffset;
      const cycle = Math.floor(clock);
      const beat = clock - cycle;
      const rightContact = motion.clip.recommendedCycle.rightContact;
      const firstHalf = beat < .5;
      const t = firstHalf ? beat * 2 : (beat - .5) * 2;
      const phaseInCycle = lerp(firstHalf ? 0 : rightContact, firstHalf ? rightContact : 1, t * t * (3 - 2 * t))
        + .5 * t * (1 - t) * (1 - 2 * t);
      const total = cycle + phaseInCycle;
      const phase = total % 1;
      const sample = motionSample(motion, motion.start + phase * motion.duration);
      const seam = smooth(.84, 1, phase);
      sample.positions.forEach((position, index) => position.add(motion.first.positions[index].clone().sub(motion.last.positions[index]).multiplyScalar(seam)));
      sample.rotations.forEach((rotation, index) => {
        const correction = motion.first.rotations[index].clone().multiply(motion.last.rotations[index].clone().invert());
        rotation.premultiply(new THREE.Quaternion().slerp(correction, seam));
      });
      sample.root.x -= lerp(motion.first.root.x, motion.last.root.x, phase);
      sample.root.z -= lerp(motion.first.root.z, motion.last.root.z, phase);
      sample.root.y += ((motion.first.root.y - motion.first.floor) - (motion.last.root.y - motion.last.floor)) * seam;
      sample.phase = phase;
      sample.total = total;
      sample.actorDistance = clamp(travel);
      return sample;
    }

    function referenceFoot(character, leg, sample) {
      const motion = character.motion;
      const key = `${leg.sign < 0 ? 'left' : 'right'}Foot`;
      const index = motion.indices[key];
      const point = sample.positions[index].clone().sub(motion.restPositions[index]).multiplyScalar(motion.scale);
      point.add(leg.ankle);
      point.x += sample.root.x * motion.scale;
      point.z += sample.root.z * motion.scale;
      return point;
    }

    function correctLimb(character, upper, lower, end, target, weight) {
      if (weight <= 0) return;
      const start = worldPosition(upper), middle = worldPosition(lower), finish = worldPosition(end);
      const destination = finish.clone().lerp(target, weight);
      const upperLength = start.distanceTo(middle), lowerLength = middle.distanceTo(finish);
      let solved = solveLimb(start, destination, upperLength, lowerLength, middle.clone().sub(start));
      const leg = character.legs.find((candidate) => candidate.upper === upper);
      if (leg) {
        // Preserve the captured bend plane unless its knee crosses its own
        // narrow inner corridor after the foot-width correction.
        const limit = Math.abs(leg.laneX) * .38;
        for (let correction = 0; correction < 2; correction += 1) {
          const hint = root.worldToLocal(solved.joint.clone());
          const signed = leg.sign * (hint.x - character.wrapper.position.x);
          const corrected = softMinimum(signed, limit, .004);
          if (corrected - signed < .00001) break;
          hint.x = character.wrapper.position.x + leg.sign * corrected;
          root.localToWorld(hint);
          solved = solveLimb(start, destination, upperLength, lowerLength, hint.sub(start));
        }
      }
      for (const [bone, child, goal] of [[upper, lower, solved.joint], [lower, end, solved.end]]) {
        const origin = worldPosition(bone);
        const correction = new THREE.Quaternion().setFromUnitVectors(worldPosition(child).sub(origin).normalize(), goal.clone().sub(origin).normalize());
        setWorldQuaternion(bone, correction.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
      }
    }

    function capturedRotation(character, name, index, sample, frame) {
      const { bones, rest, motion } = character;
      const bone = bones[name];
      const rotation = frame.clone().multiply(sample.rotations[index]).multiply(motion.restRotations[index].clone().invert()).multiply(rest.get(bone).rotation);
      const childName = childNames[name], child = bones[childName], childIndex = motion.indices[childName];
      if (child && childIndex !== undefined) {
        const desired = sample.positions[childIndex].clone().sub(sample.positions[index]);
        if (desired.lengthSq() > 1e-6) {
          desired.normalize().applyQuaternion(frame);
          const axis = rest.get(child).point.clone().sub(rest.get(bone).point).normalize().applyQuaternion(rest.get(bone).rotation.clone().invert()).applyQuaternion(rotation);
          rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(axis, desired));
        }
      }
      return rotation;
    }

    function strollingFootX(leg, value) {
      return leg.sign * softMinimum(leg.sign * value, Math.abs(leg.laneX) * .72);
    }

    function followWithShoulders(bones, acting) {
      if (!acting || !bones.chest) return;
      // Let the shoulders follow the glance while the arm solver still owns
      // the point where their hands meet.
      actingAngles.set(acting.headPitch * .10, acting.neckYaw * .30, acting.headRoll * .28, 'YXZ');
      bones.chest.quaternion.multiply(actingRotation.setFromEuler(actingAngles));
    }

    function poseCaptured(character, seconds, distance, gaze, contact, constraintWeight, suppliedSample, coupling) {
      const { wrapper, bones, rest, motion, feminine } = character;
      const side = feminine ? 1 : -1;
      const arrival = smooth(.1, 1.75, seconds);
      const sample = suppliedSample || cycleSample(motion, distance);
      const actorDistance = sample.actorDistance;
      const stopping = smooth(.88, 1, actorDistance);
      rest.forEach((state, bone) => { bone.position.copy(state.position); bone.quaternion.copy(state.quaternion); });
      wrapper.position.x = side * lerp(.5, .345, arrival);
      wrapper.rotation.y = side * .045 * (1 - arrival);
      const sourceHeightChange = sample.root.y - sample.floor - (motion.clip.rest.rootPosition[1] - motion.restFloor);
      bones.hips.position.x += sample.root.x * motion.scale * .45 * (1 - stopping) / character.scale;
      const walkingHeight = lerp(motion.meanHeightChange, sourceHeightChange * motion.scale, .82);
      bones.hips.position.y += lerp(walkingHeight, -.009, stopping) / character.scale;
      bones.hips.position.z += sample.root.z * motion.scale * (1 - stopping) / character.scale;
      wrapper.updateMatrixWorld(true);
      const frame = wrapper.getWorldQuaternion(new THREE.Quaternion());
      motion.names.forEach((name, index) => {
        const bone = bones[name];
        if (!bone) return;
        const rotation = capturedRotation(character, name, index, sample, frame);
        const bodyFactors = {
          hips: [.88, .76, .42], spine: [.94, .9, .8], chest: [.92, .88, .78],
          upperChest: [.9, .85, .75], neck: [.9, .8, .68], head: [.85, .8, .65],
        };
        if (bodyFactors[name]) {
          const relative = frame.clone().invert().multiply(rotation).multiply(rest.get(bone).rotation.clone().invert());
          const angles = new THREE.Euler().setFromQuaternion(relative, 'YXZ');
          const factors = bodyFactors[name];
          angles.x *= factors[0]; angles.y *= factors[1]; angles.z *= factors[2];
          if (name === 'head' || name === 'neck') {
            const meanRotation = capturedRotation(character, name, index, motion.meanPose, frame);
            const mean = new THREE.Euler().setFromQuaternion(frame.clone().invert().multiply(meanRotation).multiply(rest.get(bone).rotation.clone().invert()), 'YXZ');
            // The capture has a persistent tilted head; remove that bias while
            // retaining its small real fluctuations, then add the glance below.
            angles.z -= mean.z * (factors[2] - (name === 'head' ? .08 : .28));
          }
          rotation.copy(frame).multiply(new THREE.Quaternion().setFromEuler(angles)).multiply(rest.get(bone).rotation);
        }
        const freeSide = feminine ? 'right' : 'left';
        if ([`${freeSide}UpperArm`, `${freeSide}LowerArm`, `${freeSide}Hand`].includes(name)) {
          rotation.slerp(capturedRotation(character, name, index, motion.meanPose, frame), .26);
        }
        if (name === 'hips') rotation.slerp(frame.clone().multiply(rest.get(bone).rotation), stopping * .5);
        setWorldQuaternion(bone, rotation);
      });
      const together = smooth(.65, 1.85, seconds) * (1 - stopping) * constraintWeight;
      const sharedSwing = clamp((coupling?.swingZ || 0) / .045, -1, 1);
      // The held arm follows the same small impulse through the chest and
      // clavicle; the independent captured pelvis/free arm remain readable.
      bones.hips.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -side * sharedSwing * .004 * together));
      bones.chest?.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sharedSwing * .006 * together, side * sharedSwing * .012 * together, 0, 'YXZ')));
      const innerArm = character.arms.find((arm) => arm.sign === -side);
      bones[`${innerArm.side}Shoulder`]?.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -innerArm.sign * sharedSwing * .018 * together));
      const gazeProgress = clamp((gaze - (feminine ? 0 : .08)) / (feminine ? 1 : .92));
      const glanceTime = seconds - (feminine ? .14 : 0);
      const glance = smooth(2.45, 2.88, glanceTime) * (1 - smooth(3.2, 3.65, glanceTime)) * (1 - gazeProgress);
      bones.neck?.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * .025 * glance));
      bones.head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * .065 * glance));
      for (const [name, angle] of [['spine', .018 * smooth(0, .57, gazeProgress)], ['chest', .033 * smooth(0, .57, gazeProgress)], ['neck', .065 * smooth(.1, .76, gazeProgress)], ['head', .245 * smooth(.18, .89, gazeProgress)]]) {
        bones[name]?.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle));
      }
      followWithShoulders(bones, coupling?.acting);
      wrapper.updateMatrixWorld(true);

      if (!feminine) posePrinceStride(character, distance, constraintWeight);
      else character.legs.forEach((leg) => {
        const freeFoot = root.worldToLocal(worldPosition(leg.foot));
        freeFoot.x = wrapper.position.x + strollingFootX(leg, freeFoot.x - wrapper.position.x);
        const contactData = motion.contacts[leg.sign < 0 ? 0 : 1];
        let cycle = Math.floor(sample.total - contactData.phase);
        let since = sample.total - cycle - contactData.phase;
        if (since > .965) { cycle += 1; since -= 1; }
        const planted = smooth(-.025, .02, since) * (1 - smooth(contactData.duration - .035, contactData.duration + .015, since));
        const landingDistance = landingProgress(motion, (cycle + contactData.clockPhase - motion.phaseOffset) / PAIR_CYCLES);
        const atContact = referenceFoot(character, leg, contactData.sample);
        // Contact samples contain absolute root X/Z; remove their cycle baseline.
        atContact.x -= contactData.sample.root.x * motion.scale;
        atContact.z -= contactData.sample.root.z * motion.scale;
        atContact.x = leg.laneX + .008 * Math.tanh((atContact.x - leg.ankle.x) / .025);
        const center = side * lerp(.5, .345, approachAtDistance(clamp(landingDistance)));
        let target = new THREE.Vector3(center + atContact.x, worldPosition(leg.foot).y, atContact.z + (distance - landingDistance) * CAPTURE_TRAVEL_METRES);
        let weight = planted;
        const footRotation = leg.foot.getWorldQuaternion(new THREE.Quaternion());
        const localRotation = frame.clone().invert().multiply(footRotation);
        const toeDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(localRotation);
        const pitch = Math.atan2(toeDirection.y, Math.hypot(toeDirection.x, toeDirection.z));
        target.y = leg.ankle.y * Math.cos(pitch) + Math.max(leg.front * Math.sin(pitch), leg.rear * Math.sin(pitch));
        if (actorDistance >= .82) {
          const leading = leg.sign < 0;
          const begin = leading ? .82 : .95;
          const end = leading ? .95 : 1;
          const startSample = motion.stopSamples[leading ? 0 : 1];
          const startFoot = referenceFoot(character, leg, startSample);
          const startHeightChange = (startSample.root.y - startSample.floor - (motion.clip.rest.rootPosition[1] - motion.restFloor)) * motion.scale;
          const initial = new THREE.Vector3(side * .345 + strollingFootX(leg, startFoot.x), leg.ankle.y + clamp(startFoot.y + startHeightChange - leg.ankle.y, 0, .12), startFoot.z - landingProgress(motion, begin) * CAPTURE_TRAVEL_METRES);
          if (!leading) initial.set(center + atContact.x, leg.ankle.y, atContact.z - landingDistance * CAPTURE_TRAVEL_METRES);
          const final = new THREE.Vector3(side * .345 + leg.laneX, leg.ankle.y, leg.ankle.z - CAPTURE_TRAVEL_METRES + (leading ? -.03 : .03));
          const t = clamp((actorDistance - begin) / (end - begin));
          target = initial.lerp(final, smoother(t));
          target.z += distance * CAPTURE_TRAVEL_METRES;
          target.y += (leading ? .035 : .055) * Math.sin(Math.PI * t);
          weight = Math.max(weight, smooth(.82, .845, actorDistance));
          if (actorDistance >= begin) {
            const flat = root.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.get(leg.foot).rotation);
            setWorldQuaternion(leg.foot, footRotation.clone().slerp(flat, smoother(t) * constraintWeight));
          }
        }
        const desired = root.localToWorld(freeFoot.lerp(target, weight));
        const orientation = leg.foot.getWorldQuaternion(new THREE.Quaternion());
        correctLimb(character, leg.upper, leg.lower, leg.foot, desired, constraintWeight);
        setWorldQuaternion(leg.foot, orientation);
      });

      const grip = handholdAt(seconds);
      character.arms.forEach((arm) => {
        const inner = arm.sign === -side;
        const princessRight = feminine && !inner;
        if (inner) {
          const freeRotation = arm.hand.getWorldQuaternion(new THREE.Quaternion());
          const { facing, hanging } = joinedHandFrame(character, frame);
          const rotation = frameQuaternion(hanging, facing).multiply(arm.handBasis.clone().invert());
          const target = wristAtContact(character, arm, contact, rotation, grip.clearance);
          correctLimb(character, arm.upper, arm.lower, arm.hand, target, grip.reach * constraintWeight);
          setWorldQuaternion(arm.hand, freeRotation.slerp(rotation, grip.orientation * constraintWeight));
        } else {
          const shoulder = wrapper.worldToLocal(worldPosition(arm.upper));
          const restingWrist = new THREE.Vector3(shoulder.x + arm.sign * .035, shoulder.y - (arm.upperLength + arm.lowerLength) * .97, shoulder.z + .015);
          const wrist = wrapper.worldToLocal(worldPosition(arm.hand)).lerp(restingWrist, stopping * .94);
          const target = wrapper.localToWorld(princessRight
            ? princessRightWrist(arm, shoulder, wrist) : outsideCostume(arm, wrist));
          correctLimb(character, arm.upper, arm.lower, arm.hand, target, constraintWeight);
          const facing = new THREE.Vector3(-arm.sign, 0, .08).applyQuaternion(frame);
          const hanging = new THREE.Vector3(0, -1, .025).normalize().applyQuaternion(frame);
          const relaxedHand = handRotation(arm, worldPosition(arm.lower), worldPosition(arm.hand), facing, hanging, princessRight ? .12 : 1);
          const relax = (princessRight ? .24 + stopping * .70 : stopping * .94) * constraintWeight;
          setWorldQuaternion(arm.hand, arm.hand.getWorldQuaternion(new THREE.Quaternion()).slerp(relaxedHand, relax));
        }
        poseFingers(character, arm, inner ? grip.curl * constraintWeight : 0, princessRight ? (.86 + .14 * stopping) * constraintWeight : 0);
      });
      wrapper.updateMatrixWorld(true);
    }

    function stepPose(leg, distance, travel = TRAVEL_METRES, stride) {
      let previous = { touch: 0, landing: stride?.start ?? 0, final: false, placement: leg.startPlacement };
      let next;
      for (const step of stride?.steps ?? leg.steps) {
        if (distance >= step.touch) previous = step;
        else { next = step; break; }
      }
      let anchor = previous.landing;
      const placement = { ...previous.placement };
      let lift = 0;
      let support = 1;
      let pitch = previous.touch && !previous.final ? .085 * (1 - smooth(previous.touch, previous.touch + .02, distance)) : 0;
      if (next && distance >= next.liftAt) {
        const t = clamp((distance - next.liftAt) / (next.touch - next.liftAt));
        anchor = lerp(previous.landing, next.landing, stride ? smooth(0, 1, t) : smoother(t));
        ['x', 'z', 'yaw'].forEach((axis) => { placement[axis] = lerp(previous.placement[axis], next.placement[axis], smoother(t)); });
        lift = Math.pow(Math.sin(t * Math.PI), 1.3) * (next.final ? .052 : .067);
        support = 1 - smooth(0, .14, t) * (1 - smooth(.84, 1, t));
        pitch = lerp(-.15, next.final ? 0 : .085, smoother(t));
      } else if (next) {
        pitch -= .15 * smooth(Math.max(previous.touch, next.liftAt - .024), next.liftAt, distance);
      }
      // A planted foot owns a fixed point on the virtual ground. Only the body's
      // forward travel changes its local position; pace never scales that point.
      return { ...placement, forward: (distance - anchor) * travel, lift, pitch, support };
    }

    function shoeHeight(leg, step) {
      const roll = Math.sin(step.pitch);
      return leg.ankle.y * Math.cos(step.pitch) + Math.max(leg.front * roll, leg.rear * roll) + step.lift;
    }

    function posePlantedLeg(character, leg, step, target, pole, weight = 1) {
      const solved = solveLimb(worldPosition(leg.upper), target, leg.upperLength, leg.lowerLength, pole);
      aimBone(character, leg.upper, leg.lower, solved.joint, weight);
      aimBone(character, leg.lower, leg.foot, solved.end, weight);
      const rotation = root.getWorldQuaternion(new THREE.Quaternion())
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), step.yaw))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), step.pitch))
        .multiply(character.rest.get(leg.foot).rotation);
      if (weight < 1) rotation.copy(leg.foot.getWorldQuaternion(new THREE.Quaternion()).slerp(rotation, weight));
      setWorldQuaternion(leg.foot, rotation);
    }

    function posePrinceStride(character, distance, weight) {
      if (weight <= 0) return;
      const { bones, legs, scale, wrapper } = character;
      const targets = legs.map((leg) => {
        const step = stepPose(leg, distance, CAPTURE_TRAVEL_METRES, leg.princeStride);
        step.pitch *= 1.8;
        step.lift *= 1.2;
        const target = new THREE.Vector3(step.x, shoeHeight(leg, step), step.z + step.forward);
        const hip = root.worldToLocal(worldPosition(leg.upper));
        const dx = target.x - hip.x, dz = target.z - hip.z;
        const reach = leg.upperLength + leg.lowerLength - .008;
        const height = Math.sqrt(Math.max(.01, reach * reach - dx * dx - dz * dz));
        return { leg, step, target, drop: hip.y - target.y - height };
      });
      // Keep the captured weight shift. Only lower it when a planted shoe
      // would otherwise pull the knee completely straight.
      const drop = softMinimum(softMinimum(targets[0].drop, targets[1].drop, .012), 0, .012);
      bones.hips.position.y -= drop * weight / scale;
      wrapper.updateMatrixWorld(true);
      const frame = root.getWorldQuaternion(new THREE.Quaternion());
      targets.forEach(({ leg, step, target }) => {
        const pole = new THREE.Vector3(leg.sign * .12, 0, -1).applyQuaternion(frame);
        posePlantedLeg(character, leg, step, root.localToWorld(target), pole, weight);
      });
    }

    function poseCharacter(character, seconds, distance, pace, gaze, arrival, contact, acting) {
      const { wrapper, bones, feminine, rest } = character;
      const side = feminine ? 1 : -1;
      const phase = distance * Math.PI * 8 + (feminine ? -.12 : 0);
      const steps = character.legs.map((leg) => stepPose(leg, distance));
      const load = steps.reduce((total, step, index) => total + step.support * character.legs[index].sign, 0)
        / Math.max(.1, steps.reduce((total, step) => total + step.support, 0));
      const energy = smooth(.005, .09, distance) * (1 - smooth(.87, 1, distance));
      const shift = load * .017;
      wrapper.position.x = side * lerp(.5, .345, arrival) + shift;
      wrapper.rotation.y = side * .045 * (1 - arrival);
      rest.forEach((state, bone) => {
        bone.quaternion.copy(state.quaternion);
        bone.position.copy(state.position);
      });
      wrapper.updateWorldMatrix(true, false);
      let drop = .012 + energy * .008;
      character.legs.forEach((leg, index) => {
        const step = steps[index];
        step.height = shoeHeight(leg, step);
        step.target = wrapper.worldToLocal(root.localToWorld(new THREE.Vector3(step.x, step.height, step.z + step.forward)));
        const dx = step.target.x - leg.hip.x;
        const dz = step.target.z - leg.hip.z;
        const reach = leg.upperLength + leg.lowerLength - .009;
        const reachableHeight = Math.sqrt(Math.max(.01, reach * reach - dx * dx - dz * dz));
        drop = Math.max(drop, leg.hip.y - step.height - reachableHeight + .004);
      });
      const gazeProgress = clamp((gaze - (feminine ? 0 : .08)) / (feminine ? 1 : .92));
      const chestLift = smooth(0, .57, gazeProgress);
      const headLift = smooth(.18, .89, gazeProgress);
      const settle = Math.sin(Math.PI * smooth(.52, 1, gazeProgress)) * .012;
      const turn = clamp((steps[0].forward - steps[1].forward) / .48, -1, 1) * energy;
      bones.hips.position.y -= clamp(drop, .012, .085) / character.scale;
      rotateLocal(character, bones.hips, -.008 * energy, turn * .032, -load * .014);
      rotateLocal(character, bones.spine, -.015 * energy + .018 * chestLift, -turn * .016, load * .007);
      rotateLocal(character, bones.chest, .033 * chestLift, -turn * .018, 0);
      character.arms.forEach((arm) => rotateLocal(character, bones[`${arm.side}Shoulder`], 0, -arm.sign * .024 * chestLift, arm.sign * .009 * chestLift * (1 - .7 * headLift)));
      rotateLocal(character, bones.neck, .065 * smooth(.1, .76, gazeProgress), 0, 0);
      const glance = smooth(.6, 2.1, seconds) * (1 - smooth(3.2, 4.5, seconds)) * (1 - gaze);
      rotateLocal(character, bones.head, .245 * headLift + settle, side * .075 * glance, -side * .01 * glance);
      followWithShoulders(bones, acting);
      wrapper.updateMatrixWorld(true);
      const frame = wrapper.getWorldQuaternion(new THREE.Quaternion());
      const forwardPole = new THREE.Vector3(0, 0, -1).applyQuaternion(frame);

      character.legs.forEach((leg, index) => {
        const step = steps[index];
        const target = wrapper.localToWorld(step.target.clone());
        posePlantedLeg(character, leg, step, target, forwardPole);
      });

      const grip = handholdAt(seconds);
      character.arms.forEach((arm) => {
        const inner = arm.sign === -side;
        const princessRight = feminine && !inner;
        const shoulder = worldPosition(arm.upper);
        const shoulderLocal = wrapper.worldToLocal(shoulder.clone());
        const length = arm.upperLength + arm.lowerLength;
        const neutralWrist = new THREE.Vector3(
          shoulderLocal.x + arm.sign * .042,
          shoulderLocal.y - length * lerp(.95, .974, headLift),
          shoulderLocal.z + Math.cos(phase + (arm.sign > 0 ? Math.PI : 0)) * .06 * energy * (.65 + .35 * pace) + .012 * chestLift,
        );
        const freeWrist = wrapper.localToWorld(inner ? neutralWrist : princessRight
          ? princessRightWrist(arm, shoulderLocal, neutralWrist)
          : outsideCostume(arm, neutralWrist));
        const pole = new THREE.Vector3(arm.sign * .18, 0, -1).applyQuaternion(frame);
        const aim = inner ? grip.orientation : princessRight ? .12 : 0;
        const reach = inner ? grip.reach : 0;
        const { facing, hanging } = inner ? joinedHandFrame(character, frame) : {
          facing: new THREE.Vector3(-arm.sign, 0, .08).applyQuaternion(frame),
          hanging: new THREE.Vector3(0, -1, .025).normalize().applyQuaternion(frame),
        };
        let wrist = freeWrist.clone();
        let solved = solveLimb(shoulder, wrist, arm.upperLength, arm.lowerLength, pole);
        let rotation = handRotation(arm, solved.joint, wrist, facing, hanging, aim);
        for (let correction = 0; correction < 3; correction += 1) {
          wrist.copy(freeWrist).lerp(wristAtContact(character, arm, contact, rotation, grip.clearance), reach);
          solved = solveLimb(shoulder, wrist, arm.upperLength, arm.lowerLength, pole);
          wrist.copy(solved.end);
          rotation = handRotation(arm, solved.joint, wrist, facing, hanging, aim);
        }
        aimBone(character, arm.upper, arm.lower, solved.joint);
        aimBone(character, arm.lower, arm.hand, wrist);
        setWorldQuaternion(arm.hand, rotation);
        poseFingers(character, arm, inner ? grip.curl : 0, princessRight ? 1 - .14 * pace : 0);
      });
      wrapper.updateMatrixWorld(true);
    }

    function pose(seconds, shot = {}) {
      if (disposed) return;
      const time = clamp(seconds, 0, 10);
      const pace = Number.isFinite(shot.pace) ? clamp(shot.pace) : 1;
      const distance = Number.isFinite(shot.distance) ? clamp(shot.distance) : journeyDistance(time);
      const gaze = Number.isFinite(shot.gaze) ? clamp(shot.gaze) : 0;
      const actingByCharacter = characters.map(({ feminine }) => window.journeyActingAt?.(time, feminine));
      root.rotation.y = Number.isFinite(shot.heading) ? clamp(shot.heading, -.3, .3) : 0;
      root.updateMatrixWorld(true);
      const arrival = smooth(.1, 1.75, time);
      const phase = distance * Math.PI * 8;
      const energy = smooth(.005, .09, distance) * (1 - smooth(.87, 1, distance));
      const contact = root.localToWorld(new THREE.Vector3(
        Math.sin(phase * .5) * .002 * energy,
        contactHeight + Math.cos(phase * 2) * .003 * energy - .012 * smooth(.25, 1, gaze),
        -.02 + Math.sin(phase - .2) * .032 * energy + .014 * gaze,
      ));
      if (hasMotion) {
        const constraints = Number.isFinite(shot.constraintWeight) ? clamp(shot.constraintWeight) : 1;
        const samples = characters.map((character) => cycleSample(character.motion, actorProgress(character.motion, distance, time)));
        const pairDistance = samples.reduce((total, sample) => total + sample.actorDistance * .5, 0);
        const pairEnergy = smooth(.005, .09, pairDistance) * (1 - smooth(.82, 1, pairDistance));
        const heldSway = new THREE.Vector3();
        characters.forEach((character, index) => heldSway.add(samples[index].positions[character.motion.innerHand].clone().sub(character.motion.handMean).multiplyScalar(character.motion.scale * .5)));
        const swingZ = clamp(heldSway.z * .22, -.036, .036) * pairEnergy;
        contact.set(heldSway.x * .05 * pairEnergy, contactHeight + clamp(heldSway.y * .15, -.014, .014) * pairEnergy - .012 * smooth(.25, 1, gaze), -.02 + swingZ + .014 * gaze);
        root.localToWorld(contact);
        characters.forEach((character, index) => {
          poseCaptured(character, time, distance, gaze, contact, constraints, samples[index], { swingZ, acting: actingByCharacter[index] });
        });
      } else characters.forEach((character, index) => poseCharacter(character, time, distance, pace, gaze, arrival, contact, actingByCharacter[index]));
      characters.forEach(({ bones, costume, expression }, index) => {
        const acting = actingByCharacter[index];
        if (acting) {
          actingAngles.set(acting.neckPitch, acting.neckYaw, 0, 'YXZ');
          bones.neck?.quaternion.multiply(actingRotation.setFromEuler(actingAngles));
          actingAngles.set(acting.headPitch, acting.headYaw, acting.headRoll, 'YXZ');
          bones.head.quaternion.multiply(actingRotation.setFromEuler(actingAngles));
          expression?.update(acting);
        }
        costume?.update(time, shot);
      });
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      characters.forEach(({ costume, expression }) => {
        expression?.dispose();
        costume?.dispose();
      });
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      const skeletons = new Set();
      root.traverse((object) => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        if (object.isSkinnedMesh) skeletons.add(object.skeleton);
        const surfaces = Array.isArray(object.material) ? object.material : [object.material];
        surfaces.forEach((surface) => {
          materials.add(surface);
          Object.values(surface).forEach((value) => { if (value?.isTexture) textures.add(value); });
        });
      });
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      textures.forEach((value) => value.dispose());
      skeletons.forEach((value) => value.dispose());
      root.removeFromParent();
    }

    pose(0, { pace: 0 });
    return { root, pose, crownHeight: 1.72, groundY: 0, travelMeters: hasMotion ? CAPTURE_TRAVEL_METRES : TRAVEL_METRES, motionSource: hasMotion ? characters.map((character) => character.motion.clip.name).join(' + ') : 'procedural-fallback', dispose };
  };
})();
