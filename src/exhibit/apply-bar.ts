/**
 * On a phone, a bar at the foot of the screen: "Apply for the free pilot". It comes up once the Entrance
 * (and its own button) has left the screen, and steps aside while the invitation, the form itself, is on
 * screen. Wider screens keep the button in the doorway at the top instead (CSS).
 */
export function initApplyBar(bar: HTMLElement): () => void {
  const entrance = document.querySelector('#entrance');
  const invitation = document.querySelector('#invitation');
  if (!entrance || !invitation) return () => {};
  let pastEntrance = false;
  let atForm = false;
  const show = (): void => {
    bar.toggleAttribute('data-up', pastEntrance && !atForm);
  };
  const watch = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === entrance) pastEntrance = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      if (entry.target === invitation) atForm = entry.isIntersecting;
    }
    show();
  });
  watch.observe(entrance);
  watch.observe(invitation);
  bar.hidden = false;
  return () => {
    watch.disconnect();
    bar.hidden = true;
  };
}
