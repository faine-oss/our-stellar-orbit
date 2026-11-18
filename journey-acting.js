(() => {
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const ease = (value) => {
    const t = clamp(value);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const rise = (time, start, end) => ease((time - start) / (end - start));
  const hold = (time, enter, arrive, leave, finish) => rise(time, enter, arrive) * (1 - rise(time, leave, finish));
  const pulse = (time, start, peak, end) => rise(time, start, peak) * (1 - rise(time, peak, end));

  // Additive local head/neck rotations, in radians. The models face -Z:
  // negative yaw looks toward +X; positive pitch raises the chin.
  // Eye focus uses model-local directions: +lookX = +X, +lookY = up.
  // The rig owns the common upward gaze, feet, torso and shared palm target.
  // This deterministic layer never depends on previous frames or playback rate.
  window.journeyActingAt = (seconds, feminine = false) => {
    const time = Number.isFinite(seconds) ? clamp(seconds, 0, 10) : 0;
    const female = Boolean(feminine);
    let headYaw = 0, headPitch = 0, headRoll = 0;
    let neckYaw = 0, neckPitch = 0;
    let smile = 0, blink = 0, lookX = 0, lookY = 0;

    if (female) {
      // LYP catches the firefly before the final step has finished, almost at
      // eye level to her front-right. Her eyes lead the small head movement.
      const notice = hold(time, 4.92, 5.28, 5.30, 5.62);
      const noticeEyes = hold(time, 4.84, 5.08, 5.26, 5.53);
      headYaw = -.37 * notice;
      neckYaw = -.13 * notice;
      headPitch = .010 * notice;
      headRoll = -.006 * notice;
      lookX = .34 * noticeEyes;
      lookY = .10 * noticeEyes;

      // Once both feet are settled, she invites WSQ's attention with a quiet
      // inward glance. The hold is long enough to read before she looks up.
      const partner = hold(time, 5.65, 6.14, 6.40, 7.04);
      const partnerYaw = rise(time, 5.65, 6.14);
      const partnerEyes = hold(time, 5.57, 5.96, 6.42, 6.88);
      headYaw += .51 * partnerYaw;
      neckYaw += .16 * partnerYaw;
      headPitch += .018 * partner;
      neckPitch += .006 * partner;
      headRoll += .022 * partner;
      lookX -= .65 * partnerEyes;
      lookY += .12 * partnerEyes;

      const response = hold(time, 5.84, 6.18, 6.64, 7.60);
      const wonder = hold(time, 6.62, 7.12, 8.20, 9.40);
      smile = .34 * response + .12 * wonder * (1 - response);
      lookY += .23 * hold(time, 6.46, 6.87, 7.35, 7.88);
      blink = Math.max(
        pulse(time, 2.035, 2.090, 2.215),
        pulse(time, 5.495, 5.550, 5.690),
      );
    } else {
      // WSQ does not mirror her initial discovery. He responds to her glance
      // about two tenths later, then gives one small acknowledgement nod.
      const partner = hold(time, 5.96, 6.36, 6.47, 7.15);
      const partnerYaw = rise(time, 5.96, 6.36);
      const partnerEyes = hold(time, 5.86, 6.12, 6.50, 7.00);
      headYaw = -.47 * partnerYaw;
      neckYaw = -.14 * partnerYaw;
      headPitch = -.014 * partner;
      neckPitch = -.004 * partner;
      headRoll = -.009 * partner;
      lookX = .58 * partnerEyes;
      lookY = -.14 * partnerEyes;

      // A single dip and a much smaller recovery; no repeated bobbing.
      headPitch -= .044 * pulse(time, 6.16, 6.29, 6.49);
      headPitch += .006 * pulse(time, 6.46, 6.61, 6.85);
      neckPitch -= .005 * pulse(time, 6.19, 6.34, 6.54);
      const response = hold(time, 6.12, 6.43, 6.78, 7.67);
      const wonder = hold(time, 6.76, 7.18, 8.12, 9.35);
      smile = .27 * response + .10 * wonder * (1 - response);
      lookY += .18 * hold(time, 6.58, 6.98, 7.43, 7.96);
      blink = Math.max(
        pulse(time, 1.585, 1.640, 1.765),
        pulse(time, 5.975, 6.035, 6.180),
      );
    }

    // Their final target is the same firefly, to the pair's front-right and
    // above them. Keep that shared direction while their silhouettes are
    // visible, rather than losing both profiles by returning to forward -Z.
    // LYP moves first; WSQ follows a tenth of a second later. The yaw blends
    // directly from the held partner glance, without a stop at zero in between.
    const shared = rise(time, female ? 6.42 : 6.52, female ? 7.04 : 7.14);
    const sharedEyes = rise(time, female ? 6.36 : 6.46, female ? 6.83 : 6.93);
    const afterFade = 1 - rise(time, 8.65, 9.65);
    headYaw = (headYaw * (1 - shared) - .46 * shared) * afterFade;
    neckYaw = (neckYaw * (1 - shared) - .16 * shared) * afterFade;
    lookX = (lookX * (1 - sharedEyes) + .08 * sharedEyes) * afterFade;

    // A barely perceptible settling breath belongs to the head/neck only.
    // Separate phases keep the resting pair from swaying in lockstep, and no
    // body translation or limb rotation can disturb the existing contact IK.
    const settled = hold(time, 5.68, 6.04, 7.58, 8.14);
    const breath = Math.sin(time * Math.PI * 2 / 3.7 + (female ? .45 : 1.80)) * .0025 * settled;
    neckPitch += breath;
    headPitch += breath * .35;

    return {
      headYaw, headPitch, headRoll, neckYaw, neckPitch,
      smile: clamp(smile), blink: clamp(blink),
      lookX: clamp(lookX, -1, 1), lookY: clamp(lookY, -1, 1),
    };
  };

  // Useful for camera/lantern alignment and exact-frame facial QA. They are
  // authoring beats, not a second mutable animation clock.
  window.journeyActingAt.timings = Object.freeze({
    lypNotice: Object.freeze([4.92, 5.28, 5.30, 5.62]),
    lypPartner: Object.freeze([5.65, 6.14, 6.40, 7.04]),
    wsqPartner: Object.freeze([5.96, 6.36, 6.47, 7.15]),
    wsqNodPeak: 6.29,
    lypBlinkPeaks: Object.freeze([2.09, 5.55]),
    wsqBlinkPeaks: Object.freeze([1.64, 6.035]),
    lypSharedTurn: Object.freeze([6.42, 7.04]),
    wsqSharedTurn: Object.freeze([6.52, 7.14]),
    sharedYaw: -.62,
    sharedGaze: Object.freeze([6.45, 7.22]),
  });
})();
