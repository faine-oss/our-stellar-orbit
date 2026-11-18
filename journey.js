(() => {
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const mix = (from, to, progress) => from + (to - from) * progress;
  const smooth = (from, to, value) => {
    const progress = clamp((value - from) / (to - from));
    return progress * progress * (3 - 2 * progress);
  };
  // Center of the painted path, from the bridge to the foreground.
  const pathCenters = [
    [.63, .498], [.665, .547], [.695, .481], [.725, .439],
    [.755, .455], [.795, .501], [.855, .514], [.92, .496], [1, .469],
  ];
  const pathSlopes = pathCenters.slice(1).map(([y, x], index) => {
    const [previousY, previousX] = pathCenters[index];
    return (x - previousX) / (y - previousY);
  });
  const pathTangents = pathCenters.map((_, index) => {
    const before = pathSlopes[index - 1] ?? pathSlopes[0];
    const after = pathSlopes[index] ?? pathSlopes.at(-1);
    return before * after > 0 ? 2 * before * after / (before + after) : 0;
  });
  const foregroundPathY = .91;
  const bridgePathY = .641;
  const pathPerspective = .36;

  function pathCenterAt(sourceY) {
    const next = pathCenters.findIndex(([y]) => sourceY < y);
    if (next === -1) return pathCenters.at(-1)[1];
    if (next === 0) return pathCenters[0][1];
    const [fromY, fromX] = pathCenters[next - 1];
    const [toY, toX] = pathCenters[next];
    const span = toY - fromY;
    const t = (sourceY - fromY) / span;
    return mix(fromX, toX, t * t * (3 - 2 * t))
      + span * t * (1 - t) * ((1 - t) * pathTangents[next - 1] - t * pathTangents[next]);
  }

  // Integrate the speed ramp so the feet and camera share one distance clock.
  function distanceRamp(seconds, start, duration) {
    const elapsed = seconds - start;
    if (elapsed <= 0) return 0;
    if (elapsed >= duration) return elapsed - duration / 2;
    const t = elapsed / duration;
    return duration * t ** 3 * (1 - t / 2);
  }

  function cameraAt(seconds) {
    const start = .12;
    const accelerate = .86;
    const brake = 4.34;
    const decelerate = 1.22;
    const travelLength = brake + decelerate / 2 - start - accelerate / 2;
    const distance = clamp((distanceRamp(seconds, start, accelerate) - distanceRamp(seconds, brake, decelerate)) / travelLength);
    const depth = 1 + distance * pathPerspective;
    const projectedDistance = distance * (1 + pathPerspective) / depth;
    const pathY = mix(foregroundPathY, bridgePathY, projectedDistance);
    const bend = pathCenterAt(pathY - .008) - pathCenterAt(pathY + .008);
    const drift = smooth(4.55, 6.5, seconds);
    return {
      distance,
      pathY,
      pathX: pathCenterAt(pathY),
      pathRate: (foregroundPathY - bridgePathY) * (1 + pathPerspective) / (depth * depth),
      anchorX: mix(.448, .465, drift),
      anchorY: mix(.86, .879, drift),
      zoom: mix(1.08, 1.78, distance) + .054 * drift,
      heading: -.15 * Math.tanh(bend / .024),
      pace: smooth(start, start + accelerate, seconds) * (1 - smooth(brake, brake + decelerate, seconds)),
      bridgeView: smooth(4.60, 5.79, seconds),
      gaze: smooth(6.45, 7.24, seconds),
      tilt: smooth(6.98, 8.30, seconds),
      pullback: smooth(7.65, 9.48, seconds),
      lanternLight: smooth(4.6, 5.58, seconds) * (1 - smooth(6.90, 8.04, seconds)),
    };
  }

  window.createLoveJourney = ({ canvas }) => {
    const context = canvas.getContext('2d');
    let width = 1;
    let height = 1;
    let ratio = 1;
    let destroyed = false;
    let seed = 4187;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const stars = Array.from({ length: 460 }, () => ({
      x: random(), y: random(), depth: random(), phase: random() * Math.PI * 2,
      size: .35 + random() * 1.3,
    }));
    const fireflies = Array.from({ length: 31 }, () => ({
      x: random(), y: random(), phase: random() * Math.PI * 2, size: random(),
    }));
    const couple3D = window.createJourneyCouple3D?.();
    let landscape;

    function loadImage(src) {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });
    }

    const landscapeReady = loadImage('assets/journey-dusk.png').then((image) => {
      if (destroyed || !image) return;
      landscape = document.createElement('canvas');
      landscape.width = image.width;
      landscape.height = image.height;
      const plate = landscape.getContext('2d');
      plate.drawImage(image, 0, 0);
      // Feather the skyline as the camera tilts past the edge of the painted sky.
      const feather = plate.createLinearGradient(0, 0, 0, landscape.height * .18);
      feather.addColorStop(0, '#0000');
      feather.addColorStop(1, '#000');
      plate.globalCompositeOperation = 'destination-in';
      plate.fillStyle = feather;
      plate.fillRect(0, 0, landscape.width, landscape.height);
    });
    const ready = Promise.all([landscapeReady, couple3D?.ready]);

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function glow(x, y, radius, color, alpha) {
      if (alpha <= 0) return;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `${color}${Math.round(clamp(alpha) * 255).toString(16).padStart(2, '0')}`);
      gradient.addColorStop(1, `${color}00`);
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function shape(path, fill, stroke, strokeWidth = .7) {
      const geometry = new Path2D(path);
      if (fill) {
        context.fillStyle = fill;
        context.fill(geometry);
      }
      if (stroke) {
        context.strokeStyle = stroke;
        context.lineWidth = strokeWidth;
        context.stroke(geometry);
      }
    }

    function linear(x1, y1, x2, y2, stops) {
      const gradient = context.createLinearGradient(x1, y1, x2, y2);
      stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
      return gradient;
    }

    function frameLandscape(shot) {
      if (!landscape) return null;
      const zoom = mix(shot.zoom, 1.04, shot.pullback);
      const scale = Math.max(width / landscape.width, height / landscape.height) * zoom;
      const imageWidth = landscape.width * scale;
      const imageHeight = landscape.height * scale;
      const x = clamp(width * shot.anchorX - shot.pathX * imageWidth, width - imageWidth, 0);
      const y = clamp(height * shot.anchorY - shot.pathY * imageHeight, height - imageHeight, 0);
      return { x, y: y + height * .73 * shot.tilt, width: imageWidth, height: imageHeight };
    }

    function background(seconds, frame) {
      const night = smooth(2.4, 7.2, seconds);
      context.fillStyle = linear(0, 0, 0, height, [[0, '#090f28'], [.54, '#221e43'], [1, '#101326']]);
      context.fillRect(0, 0, width, height);
      if (frame) {
        context.save();
        context.globalAlpha = 1 - smooth(6.52, 8.39, seconds);
        context.drawImage(landscape, frame.x, frame.y, frame.width, frame.height);
        context.restore();
      } else {
        context.save();
        context.globalAlpha = 1 - smooth(6.52, 8.39, seconds);
        context.fillStyle = linear(0, 0, 0, height, [[0, '#273e6b'], [.4, '#a17d9e'], [.62, '#ffb8ac'], [1, '#39374f']]);
        context.fillRect(0, 0, width, height);
        glow(width * .32, height * .36, height * .23, '#ffe2b3', .6);
        context.fillStyle = '#ffedc8';
        context.beginPath();
        context.arc(width * .32, height * .36, height * .038, 0, Math.PI * 2);
        context.fill();
        [0, 1, 2].forEach((layer) => {
          context.fillStyle = ['#766b91', '#5c5377', '#354753'][layer];
          context.beginPath();
          context.moveTo(0, height);
          for (let step = 0; step <= 16; step += 1) {
            const x = step * width / 16;
            const y = height * (.54 + layer * .07 + Math.sin(step * 1.1 + layer) * .045);
            context.lineTo(x, y);
          }
          context.lineTo(width, height);
          context.fill();
        });
        context.fillStyle = '#d8a4a7';
        context.beginPath();
        context.moveTo(width * .46, height * .61);
        context.bezierCurveTo(width * .72, height * .7, width * .23, height * .78, width * .35, height);
        context.lineTo(width * .65, height);
        context.bezierCurveTo(width * .33, height * .78, width * .76, height * .7, width * .49, height * .61);
        context.fill();
        context.restore();
      }

      // The same landscape gradually loses its horizon as its lights rise into space.
      context.fillStyle = linear(0, 0, 0, height, [[0, `rgba(12,17,43,${night * .47})`], [.6, `rgba(32,21,56,${night * .44})`], [1, `rgba(13,15,36,${night * .52})`]]);
      context.fillRect(0, 0, width, height);
      glow(width * .5, height * .46, Math.max(width * .35, height * .8), '#a758a2', night * .16);
      glow(width * .38, height * .48, height * .5, '#8677df', night * .19);
    }

    function meadowLights(seconds, frame) {
      const appearance = smooth(.32, 1.82, seconds) * (1 - smooth(6.15, 7.24, seconds));
      if (appearance <= 0) return;
      context.save();
      context.translate(width * .53, height * .79);
      context.scale(1, .22);
      glow(0, 0, Math.min(width * .48, 570), '#ffcba6', .18 * appearance);
      context.restore();

      fireflies.forEach((particle, index) => {
        const depth = particle.y;
        const spread = depth ** 1.6;
        const sourceY = mix(.632, .982, depth);
        const groundY = frame ? frame.y + frame.height * sourceY : height * (.61 + depth * .3);
        const y = groundY - height * (.024 + particle.size * .034) + Math.sin(seconds * 1.18 + particle.phase) * 5;
        const center = frame ? frame.x + frame.width * pathCenterAt(sourceY)
          : width * (.5 + Math.sin(depth * 5.9 - .2) * .045 * depth);
        const edge = frame ? frame.width * mix(.031, .17, spread) : width * mix(.034, .18, spread);
        const side = particle.x < .51 ? -1 : 1;
        const x = center + side * edge * (1.16 + particle.size * 1.65) + Math.sin(seconds * .92 + particle.phase) * 8;
        if (x < -18 || x > width + 18 || y < -18 || y > height + 18) return;
        const pulse = appearance * (.18 + .66 * Math.sin(seconds * 1.27 + particle.phase) ** 2);
        glow(x, y, 7 + particle.size * 13, index % 4 ? '#ffc780' : '#f8b2ce', pulse * .45);
        context.globalAlpha = pulse;
        context.fillStyle = '#fff0c7';
        context.beginPath();
        context.arc(x, y, mix(.65, 1.75, particle.size), 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
    }

    function figureHeightAt(shot) {
      return Math.min(height * .465, width * .535) * mix(1, .87, shot.distance)
        * mix(1, 1.20, shot.bridgeView) * mix(1, .56, shot.pullback);
    }

    function lanternPoint(seconds, frame, shot) {
      const approach = smooth(4.68, 5.57, seconds);
      const rise = smooth(6.42, 8.11, seconds);
      const bankX = frame ? frame.x + frame.width * .562 : width * .59;
      const bankY = frame ? frame.y + frame.height * .577 : height * .68;
      const feetY = frame ? frame.y + frame.height * shot.pathY : height * shot.anchorY;
      const hoverY = feetY - figureHeightAt(shot) * .84 + 4 * Math.sin((seconds - 5.57) * 4.1);
      return {
        x: mix(mix(clamp(bankX, width * .58, width * .78), width * .592, approach), width * .56, rise)
          + Math.sin(rise * Math.PI) * width * .023,
        y: mix(mix(bankY, hoverY, approach), height * .232, rise),
      };
    }

    function bridgeLantern(seconds, frame, shot) {
      const opacity = smooth(4.35, 5.18, seconds) * (1 - smooth(8.04, 8.85, seconds));
      if (opacity <= 0) return;
      const { x, y } = lanternPoint(seconds, frame, shot);
      const gathered = smooth(4.45, 5.58, seconds);
      const tail = smooth(6.38, 7.08, seconds);
      for (let i = 1; i <= 6; i += 1) {
        const angle = i * 2.4 + seconds * .6;
        const spread = (1 - gathered) * (13 + i * 3);
        const previous = lanternPoint(seconds - i * .074, frame, shot);
        const sparkX = mix(x + Math.cos(angle) * spread, previous.x, tail);
        const sparkY = mix(y + Math.sin(angle) * spread * .61, previous.y, tail);
        const alpha = opacity * mix(.75 * (1 - gathered), .51 * (1 - i / 7), tail);
        glow(sparkX, sparkY, 8, '#ffd5a0', alpha * .68);
        context.globalAlpha = alpha;
        context.fillStyle = '#ffe4aa';
        context.beginPath();
        context.arc(sparkX, sparkY, mix(1.65, .65, i / 6), 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      glow(x, y, 26, '#ffbd76', opacity * .47);
      glow(x, y, 9.5, '#ffe3ae', opacity * .78);
      context.globalAlpha = opacity;
      context.fillStyle = '#fff5d8';
      context.beginPath();
      context.arc(x, y, 2.75, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }

    function man(seconds, x, footY, scale, shot) {
      const walk = smooth(.15, 1.2, seconds) * shot.pace;
      const step = Math.sin(seconds * 4.1) * walk;
      const bob = -Math.abs(Math.sin(seconds * 4.1)) * 1.3 * walk;
      context.save();
      context.translate(x, footY);
      context.scale(scale, scale);
      context.lineJoin = 'round';
      context.lineCap = 'round';

      // Feet and trouser legs are articulated separately; the joined hands stay steady.
      context.save();
      context.translate(0, step * 2);
      shape('M-17-82Q-18-56-14-30L-13-5-1-5 0-40 3-80Z', '#303449', '#262c40');
      shape('M-13-8L-1-7 2-1Q0 3-17 2L-20 0Q-20-4-13-8Z', '#d2bbac', '#a78b88');
      shape('M-17 0Q-8 2 1 0', null, '#f2dbbf', 1.2);
      shape('M-10-70Q-9-40-8-13', null, '#545166', 1);
      context.restore();
      context.save();
      context.translate(0, -step * 2.1);
      shape('M0-81 18-81Q20-55 16-33L13-5 2-5 0-37Z', '#3b3e53', '#262c40');
      shape('M3-8 13-8Q20-4 21 0C18 3 6 3 1 1Z', '#e3cbb8', '#a78b88');
      shape('M3 1Q11 3 20 0', null, '#f6dfbf', 1.2);
      shape('M12-68Q13-43 9-14', null, '#636073', .8);
      context.restore();

      context.translate(0, bob);
      const sweater = linear(-25, -137, 25, -80, [[0, '#fae2c3'], [.35, '#e8cdb5'], [.75, '#c3a6a4'], [1, '#9c8293']]);
      const sleeve = linear(-25, -136, -36, -89, [[0, '#f7dfbd'], [1, '#c3a0a0']]);
      shape('M-16-145Q-26-143-29-132L-37-102-34-87-27-88-24-104-15-127Z', sleeve, '#987a8b');
      shape('M-34-89Q-37-86-36-81L-32-77Q-28-78-29-83L-27-89Z', '#e3b5a2', '#9b7380');
      shape('M14-145Q24-143 28-132L33-115 42-102 36-96Q24-105 21-115L13-128Z', sweater, '#987a8b');
      shape('M37-104Q43-104 45-101L43-96Q40-94 36-97Z', '#edc0a7', '#9b7380');
      shape('M-15-145Q-2-149 14-145L21-131 17-84Q2-78-18-84L-21-131Z', sweater, '#91798b');
      shape('M-16-87Q0-82 17-87L17-82Q0-78-18-83Z', '#c5aaa1', '#a18592', .5);
      shape('M-17-140Q-23-124-19-105M-14-88 14-87M-12-93 0-95M8-103 17-106', null, '#ab8c98', .8);
      shape('M-13-143Q-18-130-16-119', null, '#fff0d6', 1.5);
      for (let line = -13; line < 15; line += 4) shape(`M${line}-85v4`, null, '#ab929b', .5);
      shape('M-7-157-7-145Q0-140 8-145L7-157Z', '#d5a38f', '#97717b');
      shape('M-11-145Q0-139 12-145L9-141Q0-136-10-141Z', '#f1d9c1', '#b29598', .55);
      context.translate(0, -155);
      context.scale(1, 1 - shot.gaze * .13);
      context.translate(0, 155);
      shape('M-12-167Q-17-167-15-160L-11-158ZM12-167Q17-167 15-160L11-158Z', '#dcb29a', '#946e79');
      shape('M-13-165C-19-175-14-187-5-188-2-193 10-190 14-183Q19-174 13-163L10-156 5-153Q0-151-6-154L-11-159Z', linear(-13, -180, 13, -155, [[0, '#72505c'], [.3, '#473344'], [.7, '#332c3d'], [1, '#514050']]), '#332c3d');
      shape('M-11-179Q-8-188 2-187M-7-181Q-2-187 7-184M-13-171Q-11-165-9-163M9-177Q13-170 9-162M-6-157Q0-153 6-157', null, '#85616b', .75);
      shape('M-13-178Q-15-173-13-168', null, '#bc8d83', .65);
      context.restore();
    }

    function woman(seconds, x, footY, scale, shot) {
      const walk = smooth(.15, 1.2, seconds) * shot.pace;
      const step = Math.sin(seconds * 4.1 + .65) * walk;
      const bob = -Math.abs(Math.sin(seconds * 4.1 + .65)) * 1.1 * walk;
      const sway = Math.sin(seconds * 1.8) * 2;
      context.save();
      context.translate(x, footY);
      context.scale(scale, scale);
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.save();
      context.translate(0, step * 2);
      shape('M-13-43-3-43-5-8-13-7Z', '#c9958f', '#a17881');
      shape('M-13-11-5-10-3-2Q-7 2-17 0L-18-2Z', '#edd5c4', '#b78f96');
      shape('M-16-1-5 0', null, '#fff0d3', 1);
      context.restore();
      context.save();
      context.translate(0, -step * 2);
      shape('M3-43 12-43 13-9 5-8Z', '#e4b0a0', '#a17881');
      shape('M5-10 13-10 18-3Q18 1 5 1L3-2Z', '#f5deca', '#b78f96');
      shape('M5 0 16-1', null, '#fff3dd', 1);
      context.restore();
      context.translate(0, bob);

      const dress = linear(-22, -138, 30, -39, [[0, '#ffdbd6'], [.3, '#eeb5c1'], [.7, '#d993ac'], [1, '#ae6e94']]);
      shape('M-13-140Q-23-136-25-125L-29-109-39-101-34-96Q-19-102-18-115L-10-129Z', '#f2c6bc', '#a67891');
      shape('M-37-103Q-43-103-45-100L-42-96Q-38-94-34-98Z', '#edc0a7', '#9b7380');
      shape('M12-139Q23-137 25-123L30-101 28-86 23-86 22-101 13-127Z', '#e9b4b3', '#a67891');
      shape('M24-88Q20-81 25-79L29-81 29-88Z', '#dba39a', '#9e7585');
      shape('M-11-141Q0-146 13-139L18-124 11-100Q1-96-12-101L-18-124Z', dress, '#ab7a95');
      shape('M-12-102Q-20-79-29-45Q-15-32 1-37 17-32 30-44L13-102Z', dress, '#9f7392');
      context.save();
      context.translate(sway, 0);
      shape('M-11-99Q-11-68-20-43M-3-98Q-3-63-6-39M7-99Q7-62 12-39M13-94Q19-65 24-44', null, '#bf819d', 1.1);
      shape('M-25-45Q-10-34 1-39 16-34 27-45', null, '#f3c8d0', 1.4);
      shape('M-12-98Q-10-63-15-47M0-97Q4-66 4-44', null, '#ffe0d9', .8);
      context.restore();
      shape('M-12-103Q1-99 12-103L13-99Q1-95-13-100Z', '#edc1c5', '#b7819a', .4);
      shape('M1-100Q-6-97-5-94L1-97 6-93 7-97Z', '#f7d5d1', '#b7819a', .5);
      shape('M0-97-3-84M3-97 7-85', null, '#efc5cd', 1.5);
      shape('M-6-154-6-142Q0-137 8-142L6-154Z', '#d7a398', '#946b7e');
      context.translate(0, -148);
      context.scale(1, 1 - shot.gaze * .13);
      context.translate(0, 148);
      shape('M-11-167Q-14-154-7-148 2-142 10-151L12-165Z', '#e4b4a0', '#956d7c');
      shape(`M-12-163C-17-174-5-182 5-178 19-177 17-160 15-150Q13-136 ${21 + sway}-122C9-115 1-124-3-121Q-19-121-19-133C-14-143-18-153-12-163Z`, linear(-15, -175, 17, -122, [[0, '#694756'], [.42, '#493349'], [.8, '#342e42'], [1, '#6a475e']]), '#3c2b41');
      shape(`M-8-170C-15-157-8-149-12-137Q-13-128-8-126M-3-175C-8-161 0-155-4-143Q-8-130-2-127M5-173C10-161 3-151 9-139Q14-127 ${14 + sway}-125`, null, '#9c6773', .85);
      shape('M-10-167Q-12-155-9-151', null, '#dfac9e', .7);
      shape('M-11-145Q-6-141-1-143', null, '#cb8e9e', 1.8);
      context.restore();
    }

    function couple(seconds, frame, shot) {
      const fade = 1 - smooth(7.65, 8.58, seconds);
      const figureHeight = figureHeightAt(shot);
      const scale = figureHeight / 196;
      const arrival = smooth(.1, 1.75, seconds);
      const separation = mix(67, 43, arrival) * scale;
      const y = frame ? frame.y + frame.height * shot.pathY : height * (shot.anchorY + .73 * shot.tilt);
      const x = frame ? frame.x + frame.width * shot.pathX : width * shot.anchorX;
      if (fade <= 0 || y - figureHeight > height) return;
      context.save();
      context.globalAlpha = fade;
      if (couple3D?.render(seconds, { ...shot, figureHeight, groundTravel: frame ? frame.height * shot.pathRate : 0 })) {
        const framing = couple3D.framing;
        const imageHeight = figureHeight / framing.bodyHeight;
        const imageWidth = imageHeight * couple3D.canvas.width / couple3D.canvas.height;
        context.drawImage(couple3D.canvas, x - imageWidth * framing.footX, y - imageHeight * framing.footY, imageWidth, imageHeight);
        context.restore();
        return;
      }
      context.fillStyle = `rgba(45,27,53,${.22 * (1 - smooth(5, 8, seconds))})`;
      context.beginPath();
      context.ellipse(x, y + scale * 1.5, scale * 58, scale * 6, 0, 0, Math.PI * 2);
      context.fill();
      man(seconds, x - separation, y, scale, shot);
      woman(seconds, x + separation, y, scale, shot);
      // The connected hands briefly illuminate when the two characters meet.
      glow(x, y - scale * 99, scale * 19, '#ffe2b7', smooth(1.25, 1.85, seconds) * (1 - smooth(2, 3, seconds)) * .7);
      context.restore();
    }

    function starField(seconds, frame, shot) {
      const emergence = smooth(3.75, 7.57, seconds);
      const horizon = frame ? frame.y + frame.height * .52 : height * (.52 + shot.tilt * .5);
      const starScale = mix(1.28, 1, shot.pullback);
      stars.forEach((star, index) => {
        const x = width * (.5 + (star.x - .5) * starScale);
        const y = height * ((star.y - .4) * starScale + .22 + shot.tilt * .42);
        const opacity = (.045 + .76 * emergence) * (.45 + .55 * Math.pow(Math.sin(seconds * .65 + star.phase), 2));
        const skyMask = 1 - smooth(horizon - height * .14, horizon, y);
        context.globalAlpha = opacity * skyMask;
        context.fillStyle = index % 5 === 0 ? '#ffc7df' : index % 3 === 0 ? '#c6d1ff' : '#fff1d6';
        context.beginPath();
        context.arc(x, y, star.size * starScale, 0, Math.PI * 2);
        context.fill();
        if (index % 29 === 0) {
          context.lineWidth = .65;
          context.strokeStyle = '#fff2de';
          context.beginPath();
          context.moveTo(x - 3.5, y);
          context.lineTo(x + 3.5, y);
          context.moveTo(x, y - 3.5);
          context.lineTo(x, y + 3.5);
          context.stroke();
        }
      });
      context.globalAlpha = 1;

    }

    function foreground(seconds) {
      const opacity = (1 - smooth(5.6, 7.7, seconds)) * .48;
      // Soft near-lens lights move faster than the distant scene to give it depth.
      [0, 1, 2, 3, 4, 5].forEach((index) => {
        const side = index % 2 ? 1 : -1;
        const x = width * .5 + side * width * (.39 + index * .016) + Math.sin(seconds * .26 + index) * 8;
        const y = height * (.72 + (index % 3) * .1) + Math.cos(seconds * .32 + index) * 12;
        glow(x, y, 17 + (index % 3) * 8, index % 2 ? '#ffb1c7' : '#ffdcaf', opacity * .2);
      });
      const vignette = context.createRadialGradient(width * .5, height * .5, height * .3, width * .5, height * .5, Math.max(width, height) * .64);
      vignette.addColorStop(0, '#10162a00');
      vignette.addColorStop(1, '#10162a8c');
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
    }

    function render(seconds) {
      if (destroyed) return;
      const time = clamp(seconds, 0, 10);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const shot = cameraAt(time);
      const frame = frameLandscape(shot);
      background(time, frame);
      meadowLights(time, frame);
      starField(time, frame, shot);
      couple(time, frame, shot);
      bridgeLantern(time, frame, shot);
      foreground(time);
    }

    function destroy() {
      destroyed = true;
      couple3D?.dispose();
      landscape = null;
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    resize();
    return { ready, begin: () => couple3D?.begin(), render, resize, destroy };
  };
})();
