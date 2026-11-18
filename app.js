(() => {
  const sampleDate = '2025-06-05';
  const dateKey = 'stellar-orbit-start-date';
  const dateFormat = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const numberFormat = new Intl.NumberFormat('zh-CN');
  const sampleTitles = [
    '一起等海上的日落', '你把手伸了过来', '有雨的长街', '风经过的地方',
    '靠窗的两杯咖啡', '给你的那枝玫瑰', '暮色里靠近一点', '在车窗边看晚霞',
    '秋天散步的路', '看月亮落进水里', '烛光慢下来的晚上', '沙滩上留下的脚印',
    '快要消失的粉色天空', '电车经过时', '把星星拿在手里', '同撑一把伞',
    '海浪追上了脚印', '留着那两张票', '一起看城市亮起来', '自行车上的一束花', '等到湖上天亮',
    '把唱片翻到另一面', '雨落在蓝伞上', '摩天轮亮起的时候', '分你一半可颂', '樱花开满了街',
    '你手里的一串星光', '粉色云朵旁的月亮', '我们的鞋并排放着', '落在信纸旁的花瓣', '山间列车的靠窗座',
    '客厅里跳一支舞', '和你去看花灯', '转角那间小店', '在桥上多站一会儿', '花开的时候牵手',
    '月亮升起来的时候', '桥上看过的夜色', '一起坐过的秋千', '野餐垫上的两只杯子', '花园里的灯', '海边的两行脚印',
    '去山上等星星', '光穿过秋天的叶子', '一起吹灭的蜡烛', '窗边的粉玫瑰', '系好丝带的信', '湖边坐到天黑',
    '海岸变成紫色', '伸手碰一碰浪花', '出租车窗外的灯', '霓虹下的两把伞', '桃花被阳光照亮', '隔着桌子牵手',
    '花园里亮起小灯', '小屋的窗外下雪了', '一起走上山坡', '火车上看粉色晚霞', '水面倒映的烟花', '并肩看过的星空',
  ];
  const samples = sampleTitles.map((title, index) => ({
    id: `sample-${index + 1}`,
    src: `assets/photo-${String(index + 1).padStart(2, '0')}.jpg`,
    title,
    date: new Date(Date.UTC(2025, 5 + Math.floor(index / 4), 5 + index % 4 * 5)).toISOString().slice(0, 10),
    description: index === 0 ? '回去的路上，你说下次还来。' : '',
  }));

  const modes = {
    galaxy: ['01', 'THE GALAXY', '把一起走过的日子，放进一条星河。'],
    heart: ['02', 'THE HEART', '从无数个瞬间里，拼出一颗心。'],
    tree: ['03', 'THE LOVE TREE', '那些寻常的日子，后来都长成了枝叶。'],
    fireworks: ['04', 'THE FIREWORKS', '有些瞬间，只亮一下就记了很久。'],
  };

  const days = document.getElementById('days');
  const start = document.getElementById('start-date');
  const dateTag = document.getElementById('date-tag');
  const dateDialog = document.getElementById('date-dialog');
  const dateInput = document.getElementById('date-input');
  const dateStatus = document.getElementById('date-status');
  let savedDate;
  try { savedDate = localStorage.getItem(dateKey); } catch { savedDate = null; }

  function todayInShanghai() {
    const parts = Object.fromEntries(dateFormat.formatToParts().map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function updateCounter() {
    const today = todayInShanghai();
    const beginning = savedDate || sampleDate;
    const count = Math.max(0, (Date.parse(today) - Date.parse(beginning)) / 86400000 + 1);
    days.textContent = numberFormat.format(count);
    start.dateTime = beginning;
    start.textContent = beginning.replaceAll('-', '.');
    dateTag.hidden = Boolean(savedDate);
    dateInput.max = today;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(savedDate || '') || !Number.isFinite(Date.parse(savedDate))) savedDate = null;
  updateCounter();
  setInterval(updateCounter, 15000);

  const stage = document.getElementById('stage');
  const galaxyControls = document.getElementById('galaxy-controls');
  const fireworksReplay = document.getElementById('replay-fireworks');
  const zoomIn = document.getElementById('zoom-in');
  const zoomOut = document.getElementById('zoom-out');
  const zoomValue = document.getElementById('zoom-value');
  const stageHelp = document.getElementById('stage-help-text');
  const scene = window.createStarScene({
    canvas: stage,
    onPhoto: (id) => collections.showPhoto(id),
    onZoomChange({ percent, canZoomIn, canZoomOut }) {
      zoomValue.value = `${percent}%`;
      zoomIn.disabled = !canZoomIn;
      zoomOut.disabled = !canZoomOut;
    },
  });
  const collections = window.createStarCollections({
    samples,
    onPhotos(photos) {
      scene.setPhotos(photos);
      document.getElementById('photo-count').textContent = `${photos.length} 个瞬间`;
    },
    onDialogChange: (open) => scene.setPaused(open),
  });

  const modePicker = document.querySelector('.scene-switcher');
  const modeButtons = [...modePicker.querySelectorAll('[data-mode]')];
  modeButtons.forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    const [number, english, description] = modes[mode];
    scene.setMode(mode);
    stage.parentElement.dataset.mode = mode;
    modeButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    document.getElementById('scene-number').textContent = number;
    document.getElementById('scene-english').textContent = english;
    document.getElementById('scene-description').textContent = description;
    const zoomable = mode === 'galaxy' || mode === 'tree';
    const sceneName = mode === 'tree' ? '爱情树' : '星河';
    galaxyControls.hidden = !zoomable;
    galaxyControls.setAttribute('aria-label', `${sceneName}缩放`);
    zoomOut.setAttribute('aria-label', `缩小${sceneName}`);
    zoomIn.setAttribute('aria-label', `放大${sceneName}`);
    fireworksReplay.hidden = mode !== 'fireworks';
    stageHelp.textContent = zoomable ? '拖动旋转 · 滚轮或双指缩放' : '拖动旋转 · 点照片放大';
    stage.setAttribute('aria-label', `3D 照片星轨。拖动或按方向键旋转，${zoomable ? '按加减键缩放，' : ''}按方括号键切换照片，按回车打开。`);
  }));

  modePicker.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const index = modeButtons.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' ? -1 : 1;
    const next = modeButtons[(index + step + modeButtons.length) % modeButtons.length];
    next.focus();
    next.click();
  });

  document.querySelectorAll('[data-collection]').forEach((button) => {
    button.addEventListener('click', () => collections.open(button.dataset.collection));
  });
  document.getElementById('reset-view').addEventListener('click', () => scene.resetView());
  zoomIn.addEventListener('click', () => scene.zoomBy(1));
  zoomOut.addEventListener('click', () => scene.zoomBy(-1));
  fireworksReplay.addEventListener('click', () => scene.setMode('fireworks'));

  document.getElementById('date-trigger').addEventListener('click', () => {
    dateInput.value = savedDate || sampleDate;
    dateStatus.textContent = '';
    dateDialog.showModal();
    scene.setPaused(true);
  });
  document.getElementById('close-date').addEventListener('click', () => dateDialog.close());
  dateDialog.addEventListener('close', () => scene.setPaused(false));
  document.getElementById('date-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      localStorage.setItem(dateKey, dateInput.value);
      savedDate = dateInput.value;
      updateCounter();
      dateDialog.close();
    } catch {
      dateStatus.textContent = '浏览器暂时无法保存日期。';
    }
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const opening = document.getElementById('opening');
  const replayOpening = document.getElementById('replay-opening');
  const skipOpening = document.getElementById('skip-opening');
  let journey;
  let openingFrame = 0;
  let openingTime = 0;
  let previousFrame = 0;
  let openingRequest = 0;
  let preparingOpening = false;
  let openingAnimations = [];

  function finishOpening() {
    if (opening.hidden && !preparingOpening) return;
    openingRequest += 1;
    preparingOpening = false;
    cancelAnimationFrame(openingFrame);
    openingFrame = 0;
    const restoreFocus = opening.contains(document.activeElement);
    opening.hidden = true;
    opening.classList.remove('is-playing');
    openingAnimations = [];
    replayOpening.disabled = false;
    scene.setPaused(Boolean(document.querySelector('dialog[open]')));
    if (restoreFocus) replayOpening.focus({ preventScroll: true });
  }

  function drawOpening(now) {
    if (opening.hidden || document.hidden) return;
    if (previousFrame) openingTime += now - previousFrame;
    previousFrame = now;
    const seconds = Math.min(openingTime / 1000, 10);
    journey.render(seconds);
    openingAnimations.forEach((animation) => { animation.currentTime = openingTime; });
    if (seconds >= 10) finishOpening();
    else openingFrame = requestAnimationFrame(drawOpening);
  }

  async function startOpening() {
    if (reducedMotion.matches || preparingOpening || !opening.hidden) return;
    const request = ++openingRequest;
    preparingOpening = true;
    replayOpening.disabled = true;
    try {
      journey ??= window.createLoveJourney({ canvas: document.getElementById('journey-canvas') });
      // The galaxy remains usable while the illustration loads.
      let timeout;
      await Promise.race([journey.ready, new Promise((resolve) => { timeout = setTimeout(resolve, 4200); })]);
      clearTimeout(timeout);
      if (request !== openingRequest || reducedMotion.matches) return;
      preparingOpening = false;
      openingTime = 0;
      previousFrame = 0;
      opening.hidden = false;
      opening.classList.add('is-playing');
      journey.resize();
      journey.begin();
      journey.render(0);
      openingAnimations = [
        ...opening.getAnimations({ subtree: true }),
        ...stage.getAnimations().filter((animation) => animation.animationName === 'journey-galaxy-arrival'),
      ];
      openingAnimations.forEach((animation) => { animation.pause(); animation.currentTime = 0; });
      scene.setPaused(true);
      if (!document.hidden) openingFrame = requestAnimationFrame(drawOpening);
    } catch {
      finishOpening();
      replayOpening.hidden = true;
    }
  }

  replayOpening.addEventListener('click', () => {
    if (modeButtons[0].getAttribute('aria-pressed') !== 'true') modeButtons[0].click();
    scene.resetView();
    startOpening();
  });
  skipOpening.addEventListener('click', finishOpening);
  const dismissOnInteraction = (event) => {
    if (event.target.closest('#replay-opening, #skip-opening')) return;
    finishOpening();
  };
  document.addEventListener('pointerdown', dismissOnInteraction, { capture: true });
  document.addEventListener('click', dismissOnInteraction, { capture: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') finishOpening();
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(openingFrame);
    previousFrame = 0;
    if (!document.hidden && !opening.hidden) openingFrame = requestAnimationFrame(drawOpening);
  });
  window.addEventListener('resize', () => {
    if (!opening.hidden) {
      journey.resize();
      journey.render(openingTime / 1000);
    }
  });
  window.addEventListener('pagehide', finishOpening);
  reducedMotion.addEventListener('change', () => {
    replayOpening.hidden = reducedMotion.matches;
    if (reducedMotion.matches) finishOpening();
  });
  replayOpening.hidden = reducedMotion.matches;
  if (!reducedMotion.matches) startOpening();

  collections.init();
})();
