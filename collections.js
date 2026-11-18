(function () {
  'use strict';

  const databaseName = 'our-story-starry-collections-v1';
  const photoLimit = 20 * 1024 * 1024;
  const sections = {
    album: { name: '相册', kicker: 'PHOTO CONSTELLATION', description: '把想留下的瞬间收进相册，它们也会出现在我们的星空里。' },
    memories: { name: '回忆', kicker: 'OUR MEMORIES', description: '记下那些想再想起一次的日子。' },
    letters: { name: '写给你', kicker: 'LETTERS TO YOU', description: '有些话，值得单独写成一封信。' }
  };
  const kinds = { memories: '回忆', letters: '信' };

  function node(tag, className, copy) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (copy !== undefined) result.textContent = copy;
    return result;
  }

  function button(copy, onClick, className = 'ui-button') {
    const result = node('button', className, copy);
    result.type = 'button';
    result.addEventListener('click', onClick);
    return result;
  }

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function localDay() {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function readRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('photos', { keyPath: 'id' });
        request.result.createObjectStore('entries', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Database is blocked'));
    });
  }

  function imageLoads(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = reject;
      image.src = src;
    });
  }

  function inputField(form, id, title, options = {}) {
    const field = node('div', 'field');
    const label = node('label', '', title);
    label.htmlFor = id;
    const control = node(options.tag || 'input');
    control.id = id;
    if (options.type) control.type = options.type;
    if (options.value !== undefined) control.value = options.value;
    if (options.maxLength) control.maxLength = options.maxLength;
    if (options.placeholder) control.placeholder = options.placeholder;
    if (options.required) control.required = true;
    if (options.tag === 'textarea') control.rows = options.rows || 4;
    field.append(label, control);
    form.append(field);
    return control;
  }

  window.createStarCollections = function createStarCollections({ samples = [], onPhotos, onDialogChange } = {}) {
    const dialog = document.getElementById('collection-dialog');
    const content = document.getElementById('collection-content');
    const viewer = document.getElementById('photo-viewer');
    const viewerStage = document.getElementById('photo-viewer-stage');
    const viewerTitle = document.getElementById('photo-viewer-title');
    const viewerImage = document.getElementById('photo-viewer-image');
    const uploaded = new Map();
    const entries = new Map();
    const samplePhotos = new Map(samples.map(photo => [photo.id, { ...photo, sample: true }]));
    let database;
    let ready = false;
    let initialization;
    let pending = false;
    let view;
    let trigger;
    let status;
    let nativePhotoFullscreen = false;

    dialog.setAttribute('aria-labelledby', 'collection-title');

    function allPhotos() {
      return [...uploaded.values()].reverse().concat([...samplePhotos.values()]);
    }

    function findPhoto(id) {
      return uploaded.get(id) || samplePhotos.get(id);
    }

    function publishPhotos() {
      onPhotos?.(allPhotos().map(({ id, src, title }) => ({ id, src, title })));
    }

    function notify(message, isError = false) {
      if (!status) return;
      status.textContent = message;
      status.dataset.error = String(isError);
    }

    async function write(stores, edit) {
      if (!database) return;
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(stores, 'readwrite');
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
        try {
          edit(transaction);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    }

    async function perform(work, done, control) {
      if (pending) {
        notify('正在保存上一项更改，请稍等。');
        return;
      }
      const startedFrom = view;
      pending = true;
      if (control) control.disabled = true;
      try {
        const result = await work();
        if (dialog.open && view === startedFrom) done(result);
        else if (dialog.open && view.screen === 'list') render('title');
      } catch (error) {
        if (dialog.open && view === startedFrom) {
          notify(error?.name === 'QuotaExceededError' ? '此浏览器的储存空间已满，请腾出空间后再试。' : '这次更改保存失败，请重试。', true);
        }
      } finally {
        pending = false;
        if (control) control.disabled = false;
      }
    }

    function init() {
      if (initialization) return initialization;
      publishPhotos();
      initialization = (async () => {
        try {
          database = await openDatabase();
          const transaction = database.transaction(['photos', 'entries'], 'readonly');
          const [savedPhotos, savedEntries] = await Promise.all([
            readRequest(transaction.objectStore('photos').getAll()),
            readRequest(transaction.objectStore('entries').getAll())
          ]);
          savedPhotos.sort((first, second) => (first.createdAt ?? 0) - (second.createdAt ?? 0));
          for (const photo of savedPhotos) {
            if (photo.sample) {
              const original = samplePhotos.get(photo.id);
              if (!original) continue;
              const { title, date, description, deleted } = photo;
              if (deleted) samplePhotos.delete(photo.id);
              else samplePhotos.set(photo.id, { ...original, title, date, description });
            } else if (photo.blob instanceof Blob) {
              uploaded.set(photo.id, { ...photo, src: URL.createObjectURL(photo.blob) });
            }
          }
          for (const entry of savedEntries) entries.set(entry.id, entry);
        } catch {
          database?.close();
          database = undefined;
        }
        ready = true;
        publishPhotos();
        if (dialog.open) render('title');
      })();
      return initialization;
    }

    function navigate(section, screen = 'list', id, focus = 'title') {
      if (!Object.hasOwn(sections, section)) return;
      view = { section, screen, id };
      render(focus);
      if (!dialog.open) {
        trigger = document.activeElement;
        dialog.showModal();
        onDialogChange?.(true);
        focusView(focus);
      }
      init();
    }

    function showPhoto(id) {
      navigate('album', 'detail', id);
    }

    function openPhotoViewer(photo) {
      if (viewer.open) return;
      viewerTitle.textContent = photo.title;
      viewerImage.alt = photo.title;
      viewerImage.src = photo.src;
      viewer.showModal();
      if (document.fullscreenEnabled && viewerStage.requestFullscreen) {
        viewerStage.requestFullscreen().catch(() => {
          // The modal already fills the viewport if native fullscreen is unavailable.
        });
      }
    }

    function exitPhotoFullscreen() {
      if (document.fullscreenElement === viewerStage) document.exitFullscreen().catch(() => {});
    }

    function focusView(target) {
      const firstField = target === 'form' && content.querySelector('.collection-form input');
      (firstField || content.querySelector('#collection-title'))?.focus({ preventScroll: true });
    }

    function render(focus) {
      const section = sections[view.section];
      const header = node('header', 'modal-head');
      const headingBlock = node('div');
      const heading = node('h2', 'modal-title', section.name);
      heading.id = 'collection-title';
      heading.tabIndex = -1;
      headingBlock.append(node('p', 'modal-kicker', section.kicker), heading);
      const close = button('×', () => dialog.close(), 'modal-close');
      close.setAttribute('aria-label', '关闭');
      header.append(headingBlock, close);

      const tabs = node('nav', 'modal-tabs');
      tabs.setAttribute('aria-label', '纪念册章节');
      for (const [key, sectionInfo] of Object.entries(sections)) {
        const tab = button(sectionInfo.name, () => navigate(key), 'ui-button');
        if (key === view.section) tab.setAttribute('aria-current', 'page');
        tabs.append(tab);
      }

      const body = node('div', 'modal-body');
      status = node('p', 'status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-atomic', 'true');
      body.append(status);
      if (!ready) {
        notify('正在读取纪念册…');
      } else {
        if (!database) body.append(node('p', 'status', '此浏览器暂时无法保存更改，新增内容仅保留到关闭本页。'));
        if (view.section === 'album') renderAlbum(body);
        else renderEntries(body);
      }
      content.replaceChildren(header, tabs, body);
      if (focus && dialog.open) {
        dialog.scrollTop = 0;
        focusView(focus);
      }
    }

    function actions(...controls) {
      const row = node('div', 'modal-actions');
      row.append(...controls);
      return row;
    }

    function goBack() {
      return button('返回列表', () => navigate(view.section));
    }

    function photoImage(photo, className = '') {
      const image = node('img', className);
      image.src = photo.src;
      image.alt = photo.title;
      return image;
    }

    function renderAlbum(body) {
      const photo = view.id && findPhoto(view.id);
      if (photo && view.screen === 'detail') return renderPhoto(body, photo);
      if (photo && view.screen === 'edit') return renderPhotoForm(body, photo);

      body.append(node('p', 'modal-intro', sections.album.description));
      const input = node('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.hidden = true;
      const add = button('添加照片', () => input.click(), 'ui-button primary');
      input.addEventListener('change', () => {
        const files = Array.from(input.files);
        input.value = '';
        if (files.length) addPhotos(files, add);
      });
      const toolbar = node('div', 'modal-toolbar');
      toolbar.append(add, input, node('span', 'album-date', database ? '照片保存在此浏览器 · 每张至多 20 MB' : '每张照片至多 20 MB'));
      body.append(toolbar);

      const photos = allPhotos();
      if (!photos.length) {
        body.append(node('p', 'empty-state', '相册里还没有照片。点击「添加照片」留住新的瞬间。'));
        return;
      }
      const grid = node('div', 'album-grid');
      for (const item of photos) {
        const tile = button('', () => showPhoto(item.id), 'album-tile');
        const image = photoImage(item, 'album-image');
        image.alt = '';
        image.loading = 'lazy';
        tile.append(image, node('span', 'album-caption', item.title));
        if (item.sample) tile.append(node('span', 'album-date', '示例照片'));
        else if (item.date) tile.append(node('span', 'album-date', item.date));
        grid.append(tile);
      }
      body.append(grid);
    }

    async function addPhotos(files, control) {
      const rejected = [];
      const accepted = [];
      await perform(async () => {
        notify('正在添加照片…');
        try {
          for (const file of files) {
            if (!file.size || file.size > photoLimit || (file.type && !file.type.startsWith('image/'))) {
              rejected.push(file.name);
              continue;
            }
            const src = URL.createObjectURL(file);
            try {
              await imageLoads(src);
            } catch {
              URL.revokeObjectURL(src);
              rejected.push(file.name);
              continue;
            }
            accepted.push({
              record: { id: makeId(), blob: file, title: file.name.replace(/\.[^.]+$/, '') || '未命名照片', date: '', description: '', createdAt: Date.now() },
              src
            });
          }
          if (accepted.length) {
            await write(['photos'], transaction => {
              const store = transaction.objectStore('photos');
              for (const { record } of accepted) store.add(record);
            });
          }
        } catch (error) {
          for (const { src } of accepted) URL.revokeObjectURL(src);
          throw error;
        }
        for (const { record, src } of accepted) uploaded.set(record.id, { ...record, src });
        if (accepted.length) publishPhotos();
      }, () => {
        render('title');
        const added = accepted.length ? `已添加 ${accepted.length} 张照片。` : '';
        const skipped = rejected.length ? ` 有 ${rejected.length} 张未能添加，请检查格式和文件大小。` : '';
        notify((added + skipped).trim(), !accepted.length);
      }, control);
    }

    function renderPhoto(body, photo) {
      const detail = node('article', 'photo-detail');
      const frame = button('', () => openPhotoViewer(photo), 'photo-frame photo-expand');
      frame.setAttribute('aria-label', '全屏查看');
      frame.append(photoImage(photo, 'album-image'), node('span', 'photo-expand-label', '全屏查看'));
      detail.append(frame, node('h3', '', photo.title));
      if (photo.sample) detail.append(node('p', 'album-date', '示例照片'));
      if (photo.date) detail.append(node('p', 'album-date', photo.date));
      if (photo.description) detail.append(node('p', 'entry-copy', photo.description));
      body.append(detail);

      const photos = allPhotos();
      const position = photos.findIndex(item => item.id === photo.id);
      const photoNav = node('div', 'photo-nav');
      const previous = button('上一张', () => shiftPhoto(-1));
      const next = button('下一张', () => shiftPhoto(1));
      previous.disabled = position <= 0;
      next.disabled = position >= photos.length - 1;
      photoNav.append(previous, node('span', 'album-date', `${position + 1} / ${photos.length}`), next);
      body.append(photoNav);

      const edit = button('修改文字', () => navigate('album', 'edit', photo.id, 'form'));
      const remove = button('删除照片', () => confirmDelete(row, '从相册和星空删除这张照片？',
        control => deletePhoto(photo, control)), 'ui-button danger');
      const row = actions(goBack(), edit, remove);
      body.append(row);
    }

    function shiftPhoto(direction) {
      const photos = allPhotos();
      const current = photos.findIndex(photo => photo.id === view.id);
      const next = photos[current + direction];
      if (current >= 0 && next) showPhoto(next.id);
    }

    function confirmDelete(row, copy, onConfirm) {
      const original = [...row.childNodes];
      const confirm = button('确认删除', () => onConfirm(confirm), 'ui-button primary');
      const cancel = button('取消', () => {
        row.replaceChildren(...original);
        row.lastElementChild?.focus();
      });
      row.replaceChildren(node('span', 'album-date', copy), confirm, cancel);
      cancel.focus();
    }

    function deletePhoto(photo, control) {
      const linked = [...entries.values()].filter(entry => entry.photoId === photo.id).map(entry => ({ ...entry, photoId: '' }));
      perform(async () => {
        await write(['photos', 'entries'], transaction => {
          const photos = transaction.objectStore('photos');
          // Remember removals of bundled photos without storing a second copy of the image.
          if (photo.sample) photos.put({ id: photo.id, sample: true, deleted: true });
          else photos.delete(photo.id);
          const store = transaction.objectStore('entries');
          const request = store.openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            if (cursor.value.photoId === photo.id) cursor.update({ ...cursor.value, photoId: '' });
            cursor.continue();
          };
        });
        for (const entry of linked) entries.set(entry.id, entry);
        if (photo.sample) samplePhotos.delete(photo.id);
        else {
          uploaded.delete(photo.id);
          URL.revokeObjectURL(photo.src);
        }
        publishPhotos();
      }, () => {
        navigate('album');
        notify('照片已删除。');
      }, control);
    }

    function renderPhotoForm(body, photo) {
      const form = node('form', 'collection-form');
      const title = inputField(form, 'photo-title', '照片标题', { value: photo.title, required: true, maxLength: 100 });
      const date = inputField(form, 'photo-date', '拍摄日期（选填）', { type: 'date', value: photo.date });
      const description = inputField(form, 'photo-description', '照片说明（选填）', { tag: 'textarea', value: photo.description, maxLength: 600 });
      const save = node('button', 'ui-button primary', '保存照片信息');
      form.append(actions(save, button('取消', () => showPhoto(photo.id))));
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!title.value.trim()) {
          notify('请填写照片标题。', true);
          title.focus();
          return;
        }
        const changes = { title: title.value.trim(), date: date.value, description: description.value.trim() };
        perform(async () => {
          await write(['photos'], transaction => {
            const store = transaction.objectStore('photos');
            const request = store.get(photo.id);
            request.onsuccess = () => {
              const saved = request.result;
              // A tab holding a stale edit must not bring back a deleted photo.
              if (photo.sample ? saved?.deleted : !saved?.blob) {
                transaction.abort();
                return;
              }
              store.put(photo.sample ? { id: photo.id, sample: true, ...changes } : { ...saved, ...changes });
            };
          });
          (photo.sample ? samplePhotos : uploaded).set(photo.id, { ...photo, ...changes });
          publishPhotos();
        }, () => {
          showPhoto(photo.id);
          notify('照片信息已保存。');
        }, save);
      });
      body.append(form);
    }

    function renderEntries(body) {
      const { section, screen, id } = view;
      const entry = entries.get(id);
      if (screen === 'new' || (screen === 'edit' && entry)) return renderEntryForm(body, section, entry);
      if (screen === 'detail' && entry) return renderEntry(body, section, entry);

      body.append(node('p', 'modal-intro', sections[section].description));
      const create = section === 'memories' ? '写一段回忆' : '写一封信';
      body.append(actions(button(create, () => navigate(section, 'new', undefined, 'form'), 'ui-button primary')));
      const items = [...entries.values()].filter(item => item.section === section).sort((first, second) => {
        return section === 'memories' ? second.date.localeCompare(first.date) || second.createdAt - first.createdAt : second.createdAt - first.createdAt;
      });
      if (!items.length) {
        const empty = node('div', 'empty-state');
        empty.append(node('h3', '', section === 'memories' ? '第一段回忆，从这里开始' : '给未来的你留一封信'), node('p', '', section === 'memories' ? '第一次见面时，你记住了哪个小细节？' : '想写的那句话，就从今天开始吧。'));
        body.append(empty);
        return;
      }

      const list = node('div', 'entry-list');
      for (const item of items) {
        const card = node('article', 'entry-card');
        const preview = item.body.length > 120 ? `${item.body.slice(0, 120)}…` : item.body;
        card.append(node('p', 'album-date', item.date), node('h3', '', item.title), node('p', 'entry-copy', preview));
        const read = button(section === 'memories' ? '重温这段回忆' : '拆开这封信', () => navigate(section, 'detail', item.id));
        read.setAttribute('aria-label', `${read.textContent}：${item.title}`);
        card.append(read);
        list.append(card);
      }
      body.append(list);
    }

    function renderEntry(body, section, entry) {
      const detail = node('article', `entry-card ${section === 'letters' ? 'letter-detail' : 'memory-detail'}`);
      detail.append(node('p', 'album-date', entry.date), node('h3', '', entry.title), node('p', 'entry-copy', entry.body));
      const photo = entry.photoId && findPhoto(entry.photoId);
      if (photo) {
        const link = button('', () => showPhoto(photo.id), 'album-tile');
        const image = photoImage(photo, 'album-image');
        image.alt = '';
        link.append(image, node('span', 'album-caption', photo.title));
        detail.append(link);
      }
      const edit = button('编辑', () => navigate(section, 'edit', entry.id, 'form'));
      const remove = button('删除', () => confirmDelete(row, section === 'memories' ? '删除这段回忆？' : '删除这封信？', control => {
        perform(async () => {
          await write(['entries'], transaction => transaction.objectStore('entries').delete(entry.id));
          entries.delete(entry.id);
        }, () => {
          navigate(section);
          notify('内容已删除。');
        }, control);
      }));
      const row = actions(goBack(), edit, remove);
      body.append(detail, row);
    }

    function renderEntryForm(body, section, entry) {
      const form = node('form', 'collection-form');
      const title = inputField(form, 'entry-title', '标题', { value: entry?.title || '', required: true, maxLength: 100 });
      const date = inputField(form, 'entry-date', section === 'memories' ? '回忆日期' : '落款日期', { type: 'date', value: entry?.date || localDay(), required: true });
      const copy = inputField(form, 'entry-body', section === 'memories' ? '写下这段回忆' : '想说的话', { tag: 'textarea', value: entry?.body || '', required: true, maxLength: 6000, rows: 7 });
      let photo;
      if (section === 'memories') {
        photo = inputField(form, 'entry-photo', '关联相册照片（选填）', { tag: 'select' });
        photo.append(new Option('暂不关联照片', ''));
        for (const item of allPhotos()) photo.append(new Option(item.title, item.id));
        photo.value = entry?.photoId || '';
      }
      const save = node('button', 'ui-button primary', `保存${kinds[section]}`);
      form.append(actions(save, button('取消', () => navigate(section, entry ? 'detail' : 'list', entry?.id))));
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!title.value.trim() || !copy.value.trim()) {
          notify('请填写标题和正文。', true);
          (!title.value.trim() ? title : copy).focus();
          return;
        }
        const record = {
          id: entry?.id || makeId(), section, title: title.value.trim(), date: date.value, body: copy.value.trim(),
          photoId: photo?.value || '', createdAt: entry?.createdAt || Date.now()
        };
        perform(async () => {
          await write(['entries'], transaction => transaction.objectStore('entries').put(record));
          entries.set(record.id, record);
        }, () => {
          navigate(section, 'detail', record.id);
          notify('已保存。');
        }, save);
      });
      body.append(form);
    }

    document.getElementById('photo-viewer-close').addEventListener('click', () => viewer.close());
    viewer.addEventListener('close', () => {
      exitPhotoFullscreen();
      viewerImage.removeAttribute('src');
      if (dialog.open) content.querySelector('.photo-expand')?.focus({ preventScroll: true });
    });
    document.addEventListener('fullscreenchange', () => {
      const active = document.fullscreenElement === viewerStage;
      if (active && !viewer.open) exitPhotoFullscreen();
      if (!active && nativePhotoFullscreen && viewer.open) viewer.close();
      nativePhotoFullscreen = active;
    });

    dialog.addEventListener('close', () => {
      if (viewer.open) viewer.close();
      onDialogChange?.(false);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
      trigger = undefined;
    });
    dialog.addEventListener('keydown', event => {
      if (!ready || view?.section !== 'album' || view.screen !== 'detail') return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      shiftPhoto(event.key === 'ArrowLeft' ? -1 : 1);
    });

    return { open: navigate, showPhoto, init };
  };
})();
