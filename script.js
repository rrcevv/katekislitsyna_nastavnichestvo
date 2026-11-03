if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
}

const scenes = [...document.querySelectorAll('main > section')];
const mobileLayout = window.matchMedia('(max-width: 900px), (pointer: coarse)');
let sceneViewportHeight = 0;
let sceneViewportWidth = 0;
function stableViewportHeight() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;height:100svh;width:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height || window.innerHeight;
  probe.remove();
  return height;
}
function sizeScenes() {
  // Browser toolbar changes must not move sticky boundaries on touch screens.
  if (!mobileLayout.matches || !sceneViewportHeight || sceneViewportWidth !== window.innerWidth) {
    sceneViewportHeight = mobileLayout.matches ? stableViewportHeight() : window.innerHeight;
    sceneViewportWidth = window.innerWidth;
  }
  if (mobileLayout.matches) document.documentElement.style.setProperty('--mobile-screen-height', `${sceneViewportHeight}px`);
  else document.documentElement.style.removeProperty('--mobile-screen-height');
  scenes.forEach(scene => {
    // Tall scenes scroll completely before holding for the next scene.
    const offset = Math.min(0, sceneViewportHeight - scene.offsetHeight);
    scene.style.setProperty('--stack-top', `${offset}px`);
  });
}
const sceneObserver = new ResizeObserver(sizeScenes);
scenes.forEach(scene => sceneObserver.observe(scene));
window.addEventListener('resize', sizeScenes, { passive: true });
sizeScenes();

// Keep native scrolling; soften the outgoing plane with frame-rate independent easing.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const sceneMotion = scenes.map(() => 0);
let motionFrame = 0;
let previousFrame = 0;
function renderStack(now) {
  const dt = previousFrame ? Math.min(now - previousFrame, 64) : 16.67;
  previousFrame = now;
  const damping = 1 - Math.exp(-dt / 180);
  const nextTops = scenes.slice(1).map(scene => scene.getBoundingClientRect().top + 12 * sceneMotion[scenes.indexOf(scene)]);
  let settling = false;
  sceneMotion.forEach((value, index) => {
    if (index === scenes.length - 1) return;
    const overlap = Math.max(0, Math.min(1, 1 - nextTops[index] / window.innerHeight));
    const target = overlap * overlap * (3 - 2 * overlap);
    let next = value + (target - value) * damping;
    if (Math.abs(target - next) < .0005) next = target;
    else settling = true;
    sceneMotion[index] = next;
    const scene = scenes[index];
    scene.classList.toggle('stack-active', next > .0001);
    scene.style.setProperty('--scene-lift', `${(-12 * next).toFixed(3)}px`);
  });
  motionFrame = settling ? requestAnimationFrame(renderStack) : 0;
  if (!settling) previousFrame = 0;
}
function scheduleStack() {
  if (!reducedMotion.matches && !mobileLayout.matches && !motionFrame) motionFrame = requestAnimationFrame(renderStack);
}
window.addEventListener('scroll', scheduleStack, { passive: true });
window.addEventListener('resize', scheduleStack, { passive: true });
function resetStackMotion() {
  if (reducedMotion.matches || mobileLayout.matches) {
    cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    previousFrame = 0;
    sceneMotion.fill(0);
    scenes.forEach(scene => scene.classList.remove('stack-active'));
  } else scheduleStack();
}
reducedMotion.addEventListener('change', resetStackMotion);
mobileLayout.addEventListener('change', () => {
  sceneViewportHeight = 0;
  sizeScenes();
  resetStackMotion();
});
scheduleStack();

// Ease wheel movement without replacing touch scrolling or keyboard navigation.
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let wheelFrame = 0;
let wheelTarget = window.scrollY;
let wheelTime = 0;
let wheelDirection = 0;
function stopWheel() {
  cancelAnimationFrame(wheelFrame);
  wheelFrame = 0;
  wheelTime = 0;
  wheelTarget = window.scrollY;
}
function animateWheel(now) {
  const dt = wheelTime ? Math.min(now - wheelTime, 64) : 16.67;
  wheelTime = now;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  wheelTarget = Math.max(0, Math.min(maxScroll, wheelTarget));
  const current = window.scrollY;
  const distance = wheelTarget - current;
  if (Math.abs(distance) < 1) {
    window.scrollTo({top: wheelTarget, behavior: 'instant'});
    stopWheel();
    return;
  }
  const step = distance * (1 - Math.exp(-dt / 150));
  window.scrollTo({top: current + Math.sign(step) * Math.max(1, Math.abs(step)), behavior: 'instant'});
  wheelFrame = requestAnimationFrame(animateWheel);
}
window.addEventListener('wheel', event => {
  if (reducedMotion.matches || !finePointer.matches || event.ctrlKey || event.metaKey || !event.cancelable || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
  if (!delta) return;
  const direction = Math.sign(delta);
  if (!wheelFrame || direction !== wheelDirection) wheelTarget = window.scrollY;
  wheelDirection = direction;
  wheelTarget = Math.max(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, wheelTarget + delta));
  event.preventDefault();
  if (!wheelFrame) wheelFrame = requestAnimationFrame(animateWheel);
}, {passive: false});
window.addEventListener('pointerdown', stopWheel, {passive: true});
window.addEventListener('touchstart', stopWheel, {passive: true});
window.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopWheel();
});
window.addEventListener('resize', stopWheel, {passive: true});
reducedMotion.addEventListener('change', stopWheel);

// Native swipe on phones; simple buttons and keyboard support on larger screens.
const resultsTrack = document.querySelector('.results-track');
if (resultsTrack) {
  const previous = document.querySelector('.gallery-prev');
  const next = document.querySelector('.gallery-next');
  const syncGallery = () => {
    previous.disabled = resultsTrack.scrollLeft < 2;
    next.disabled = resultsTrack.scrollLeft + resultsTrack.clientWidth >= resultsTrack.scrollWidth - 2;
  };
  const moveGallery = direction => {
    const shot = resultsTrack.querySelector('.result-shot');
    const gap = parseFloat(getComputedStyle(resultsTrack).columnGap) || 0;
    resultsTrack.scrollBy({left: direction * (shot.getBoundingClientRect().width + gap), behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  };
  previous.addEventListener('click', () => moveGallery(-1));
  next.addEventListener('click', () => moveGallery(1));
  resultsTrack.addEventListener('scroll', syncGallery, {passive:true});
  resultsTrack.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveGallery(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  window.addEventListener('resize', syncGallery, {passive:true});
  syncGallery();
}

// Show the participation terms inside this page, including on touch screens.
const conditionsLink = document.querySelector('.hero .button[href="#join"]');
if (conditionsLink) {
  conditionsLink.addEventListener('click', event => {
    const section = document.getElementById('join');
    if (!section) return;
    event.preventDefault();
    stopWheel();
    const destination = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({top: destination, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
    section.focus({preventScroll:true});
    window.history.replaceState(null, '', '#join');
  });
}
