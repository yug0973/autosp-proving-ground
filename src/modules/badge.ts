/**
 * The one "Demo data" badge in the corner of the cinematic page: it stands for every scene, so no box
 * repeats it. It steps aside once the footer, which says the same, is on screen.
 */
export function initBadge(badge: HTMLElement): () => void {
  const foot = document.querySelector('.foot');
  if (!foot || !('IntersectionObserver' in window)) return () => {};
  const watch = new IntersectionObserver(([entry]) => {
    badge.toggleAttribute('data-away', entry?.isIntersecting ?? false);
  });
  watch.observe(foot);
  return () => {
    watch.disconnect();
  };
}
